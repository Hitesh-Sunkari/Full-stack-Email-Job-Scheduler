import { Worker, Job } from 'bullmq';
import { QUEUE_NAMES, EmailStatus } from '@reachinbox/shared';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { prisma } from '../config/database';
import { EmailDispatchJobData, emailQueue } from '../modules/scheduling/queue';
import { reserveHourlyQuota, reserveMinimumDelaySlot } from '../modules/scheduling/rate-limiter';
import { SmtpService, SmtpConfig } from '../modules/emails/smtp-service';
import { decryptToken } from '../lib/crypto';
import { SlackService } from '../modules/slack/slack-service';
import { SearchService } from '../modules/search/search-service';

function parseRedisUrl(url: string) {
  const parsed = new URL(url);
  return {
    host: parsed.hostname || 'localhost',
    port: Number(parsed.port) || 6379,
    username: parsed.username || undefined,
    password: parsed.password || undefined,
    maxRetriesPerRequest: null,
  };
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createEmailWorker(): Worker<EmailDispatchJobData> {
  const concurrency = env.WORKER_CONCURRENCY;

  logger.info(
    {
      concurrency,
      minDelayMs: env.MIN_DELAY_BETWEEN_EMAILS_MS,
      hourlyLimit: env.MAX_EMAILS_PER_HOUR_PER_SENDER,
    },
    'Initializing BullMQ Email Worker'
  );

  const worker = new Worker<EmailDispatchJobData>(
    QUEUE_NAMES.EMAIL_DISPATCH,
    async (job: Job<EmailDispatchJobData>) => {
      const { scheduledEmailId, senderId, userId, campaignId, recipient, subject, body } = job.data;
      logger.info({ scheduledEmailId, recipient, jobId: job.id }, 'Worker received dispatch job');

      // 1. Atomic database state claim
      // Only process if status is SCHEDULED or PROCESSING (un-stuck). Skip if SENT or CANCELLED.
      const emailRecord = await prisma.scheduledEmail.findUnique({
        where: { id: scheduledEmailId },
        include: {
          campaign: true,
          sender: true,
        },
      });

      if (!emailRecord) {
        logger.warn({ scheduledEmailId }, 'Scheduled email not found in database; skipping.');
        return;
      }

      if (emailRecord.status === EmailStatus.SENT) {
        logger.info({ scheduledEmailId }, 'Email already sent; skipping duplicate processing.');
        return;
      }

      if (emailRecord.status === EmailStatus.CANCELLED) {
        logger.info({ scheduledEmailId }, 'Email was cancelled; skipping processing.');
        return;
      }

      // Claim record by setting status to PROCESSING and incrementing attempt count
      await prisma.scheduledEmail.update({
        where: { id: scheduledEmailId },
        data: {
          status: EmailStatus.PROCESSING as unknown as import('@prisma/client').EmailStatus,
          attemptCount: { increment: 1 },
        },
      });

      // 2. Fetch and decrypt sender SMTP credentials
      const sender = emailRecord.sender;
      if (!sender || !sender.isActive) {
        const errorMsg = 'Sender account not found or inactive';
        await prisma.scheduledEmail.update({
          where: { id: scheduledEmailId },
          data: {
            status: EmailStatus.FAILED as unknown as import('@prisma/client').EmailStatus,
            lastError: errorMsg,
          },
        });
        await SearchService.updateStatus(scheduledEmailId, EmailStatus.FAILED);
        return;
      }

      let decryptedSmtpPass = '';
      try {
        decryptedSmtpPass = decryptToken(sender.encryptedSmtpPass, env.TOKEN_ENCRYPTION_KEY);
      } catch (decErr) {
        logger.error({ err: decErr }, 'Failed to decrypt sender SMTP credentials');
        await prisma.scheduledEmail.update({
          where: { id: scheduledEmailId },
          data: {
            status: EmailStatus.FAILED as unknown as import('@prisma/client').EmailStatus,
            lastError: 'Sender credentials corrupted',
          },
        });
        await SearchService.updateStatus(scheduledEmailId, EmailStatus.FAILED);
        return;
      }

      // 3. Distributed Hourly Rate Limiting check
      const configuredHourlyLimit = emailRecord.campaign.hourlyLimit || env.MAX_EMAILS_PER_HOUR_PER_SENDER;
      const rateLimitResult = await reserveHourlyQuota(sender.id, configuredHourlyLimit, new Date());

      if (!rateLimitResult.allowed) {
        // Hourly limit reached!
        logger.warn(
          {
            senderEmail: sender.senderEmail,
            limit: configuredHourlyLimit,
            window: rateLimitResult.windowKey,
            nextEligible: rateLimitResult.nextEligibleTime,
          },
          'Hourly limit exhausted for sender. Deferring email job to next UTC hour window.'
        );

        // Update database record with new scheduled time and reset to SCHEDULED
        await prisma.scheduledEmail.update({
          where: { id: scheduledEmailId },
          data: {
            scheduledAt: rateLimitResult.nextEligibleTime,
            status: EmailStatus.SCHEDULED as unknown as import('@prisma/client').EmailStatus,
            lastError: `Rate limit (${configuredHourlyLimit}/hr) reached for window ${rateLimitResult.windowKey}. Deferred to ${rateLimitResult.nextEligibleTime.toISOString()}`,
          },
        });

        // Re-enqueue BullMQ delayed job for the next UTC hour
        const delayMs = Math.max(0, rateLimitResult.nextEligibleTime.getTime() - Date.now());
        await emailQueue.add(
          'dispatch-email',
          {
            ...job.data,
            attemptCount: emailRecord.attemptCount + 1,
          },
          {
            jobId: `email_${scheduledEmailId}_deferred_${rateLimitResult.windowKey}`,
            delay: delayMs,
          }
        );

        // Dispatch Slack alert (deduplicated per window)
        SlackService.sendRateLimitNotification({
          tenantId: userId,
          senderId: sender.id,
          senderEmail: sender.senderEmail,
          hourlyLimit: configuredHourlyLimit,
          windowKey: rateLimitResult.windowKey,
          nextEligibleTime: rateLimitResult.nextEligibleTime,
        }).catch((err) => logger.warn({ err }, 'Background Slack alert dispatch error'));

        return;
      }

      // 4. Distributed Minimum Delay Throttling
      const minDelayMs = emailRecord.campaign.configuredDelayMs || env.MIN_DELAY_BETWEEN_EMAILS_MS;
      let throttle = await reserveMinimumDelaySlot(sender.id, minDelayMs, Date.now());

      if (!throttle.allowed) {
        if (throttle.waitMs <= 3000) {
          // If wait is brief (under 3 seconds), sleep locally and then proceed
          logger.debug({ waitMs: throttle.waitMs }, 'Sleeping briefly for sender throttle spacing');
          await sleep(throttle.waitMs);
          await reserveMinimumDelaySlot(sender.id, minDelayMs, Date.now());
        } else {
          // Re-enqueue job with precise delay to allow other worker jobs to progress
          logger.debug({ waitMs: throttle.waitMs }, 'Re-enqueueing job due to minimum delay throttle');
          await emailQueue.add('dispatch-email', job.data, {
            delay: throttle.waitMs,
          });
          return;
        }
      }

      // 5. SMTP Delivery via Nodemailer
      const smtpConfig: SmtpConfig = {
        host: sender.smtpHost,
        port: sender.smtpPort,
        secure: sender.smtpSecure,
        user: sender.smtpUser,
        pass: decryptedSmtpPass,
        fromName: sender.displayName,
        fromEmail: sender.senderEmail,
      };

      try {
        const sendResult = await SmtpService.sendMail(smtpConfig, {
          to: recipient,
          subject: subject || emailRecord.subject,
          body: body || emailRecord.body,
        });

        const sentAt = new Date();

        // 6. Update database status to SENT
        await prisma.scheduledEmail.update({
          where: { id: scheduledEmailId },
          data: {
            status: EmailStatus.SENT as unknown as import('@prisma/client').EmailStatus,
            sentAt,
            smtpMessageId: sendResult.messageId,
            etherealPreviewUrl: sendResult.previewUrl,
            lastError: null,
          },
        });

        // Increment campaign sent count
        await prisma.emailCampaign.update({
          where: { id: campaignId },
          data: { sentCount: { increment: 1 } },
        });

        // Update Elasticsearch
        await SearchService.updateStatus(scheduledEmailId, EmailStatus.SENT, sentAt);

        logger.info(
          {
            scheduledEmailId,
            recipient,
            previewUrl: sendResult.previewUrl,
          },
          'Email dispatch cycle completed successfully'
        );
      } catch (smtpError) {
        const errorMsg = (smtpError as Error).message || 'Unknown SMTP error';
        logger.error({ error: errorMsg, scheduledEmailId, recipient }, 'SMTP sending failed');

        await prisma.scheduledEmail.update({
          where: { id: scheduledEmailId },
          data: {
            status: EmailStatus.FAILED as unknown as import('@prisma/client').EmailStatus,
            lastError: errorMsg,
          },
        });

        await prisma.emailCampaign.update({
          where: { id: campaignId },
          data: { failedCount: { increment: 1 } },
        });

        await SearchService.updateStatus(scheduledEmailId, EmailStatus.FAILED);
      }
    },
    {
      connection: parseRedisUrl(env.REDIS_URL),
      concurrency,
    }
  );

  worker.on('error', (err) => {
    logger.error({ err: err.message }, 'BullMQ Worker Error');
  });

  return worker;
}

// Standalone execution entrypoint when run as separate worker process
if (require.main === module) {
  const worker = createEmailWorker();

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Stopping email worker gracefully...');
    await worker.close();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
