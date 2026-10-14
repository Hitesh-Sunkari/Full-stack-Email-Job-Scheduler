import { prisma } from '../../config/database';
import { emailQueue, EmailDispatchJobData } from './queue';
import { logger } from '../../config/logger';
import { generateHash } from '../../lib/crypto';
import { ScheduleEmailInput, EmailStatus, CampaignStatus } from '@reachinbox/shared';
import { SearchService } from '../search/search-service';

export interface ScheduleResult {
  campaignId: string;
  totalScheduled: number;
  firstSendTime: string;
  estimatedCompletionTime: string;
}

export class SchedulerService {
  /**
   * Schedules a campaign and its recipient emails with BullMQ delayed jobs.
   * Handles large lead lists (up to 5,000) with batching and transaction safety.
   */
  static async scheduleCampaign(userId: string, input: ScheduleEmailInput): Promise<ScheduleResult> {
    const { subject, body, senderId, startTime, configuredDelayMs, hourlyLimit, recipients } = input;

    // 1. Verify Sender ownership and active status
    const sender = await prisma.senderAccount.findFirst({
      where: { id: senderId, userId, isActive: true },
    });

    if (!sender) {
      throw new Error('Sender account not found, inactive, or not authorized for this tenant');
    }

    const startDate = new Date(startTime);
    const startMs = startDate.getTime();

    // 2. Create EmailCampaign record
    const campaign = await prisma.emailCampaign.create({
      data: {
        userId,
        senderId,
        subject,
        body,
        startTime: startDate,
        configuredDelayMs,
        hourlyLimit,
        status: CampaignStatus.ACTIVE,
        totalRecipients: recipients.length,
      },
    });

    logger.info(
      { campaignId: campaign.id, recipientCount: recipients.length },
      'Created email campaign in database'
    );

    // 3. Prepare ScheduledEmail records with stable timestamps and idempotency keys
    const emailRecordsToInsert = recipients.map((recipient, index) => {
      // Calculate earliest eligible send time based on index and configured inter-send delay
      const sendTimeMs = startMs + index * configuredDelayMs;
      const scheduledAt = new Date(sendTimeMs);
      const idempotencyKey = generateHash(
        `campaign:${campaign.id}:recipient:${recipient.toLowerCase()}:idx:${index}`
      );

      return {
        campaignId: campaign.id,
        userId,
        senderId,
        recipient: recipient.toLowerCase().trim(),
        subject,
        body,
        scheduledAt,
        status: EmailStatus.SCHEDULED as unknown as import('@prisma/client').EmailStatus,
        idempotencyKey,
      };
    });

    // 4. Batch insert recipients into PostgreSQL (chunks of 1,000 for database query parameter limits)
    const CHUNK_SIZE = 1000;
    for (let i = 0; i < emailRecordsToInsert.length; i += CHUNK_SIZE) {
      const chunk = emailRecordsToInsert.slice(i, i + CHUNK_SIZE);
      await prisma.scheduledEmail.createMany({
        data: chunk,
        skipDuplicates: true,
      });
    }

    // 5. Retrieve persisted records to obtain stable database IDs for BullMQ job IDs
    const persistedEmails = await prisma.scheduledEmail.findMany({
      where: { campaignId: campaign.id },
      select: { id: true, recipient: true, scheduledAt: true, attemptCount: true },
      orderBy: { scheduledAt: 'asc' },
    });

    // 6. Bulk enqueue BullMQ delayed jobs
    const now = Date.now();
    const bullJobs = persistedEmails.map((email) => {
      const delay = Math.max(0, email.scheduledAt.getTime() - now);
      const jobId = `email_${email.id}`;

      return {
        name: 'dispatch-email',
        data: {
          scheduledEmailId: email.id,
          campaignId: campaign.id,
          userId,
          senderId,
          recipient: email.recipient,
          subject,
          body,
          attemptCount: email.attemptCount,
        } as EmailDispatchJobData,
        opts: {
          jobId,
          delay,
        },
      };
    });

    try {
      // Add in chunks of 500 to Redis
      const REDIS_CHUNK = 500;
      for (let i = 0; i < bullJobs.length; i += REDIS_CHUNK) {
        const chunk = bullJobs.slice(i, i + REDIS_CHUNK);
        await emailQueue.addBulk(chunk);
      }

      // Update bullJobId in database
      // Bulk update using raw query or chunked update
      await prisma.$executeRawUnsafe(
        `UPDATE scheduled_emails SET bull_job_id = CONCAT('email_', id::text) WHERE campaign_id = $1::uuid`,
        campaign.id
      );

      logger.info(
        { campaignId: campaign.id, count: bullJobs.length },
        'Successfully enqueued all delayed BullMQ jobs'
      );
    } catch (queueError) {
      // PARTIAL FAILURE MITIGATION:
      // Even if Redis connection dropped mid-enqueue, the durable records are already committed in PostgreSQL.
      // The background startup / recovery routine will reconcile un-enqueued records.
      logger.error(
        { err: (queueError as Error).message, campaignId: campaign.id },
        'Partial failure enqueuing jobs into BullMQ. Database records are safe; recovery service will reconcile.'
      );
    }

    // 7. Asynchronously trigger Elasticsearch indexing for new scheduled records
    const senderEmail = sender.senderEmail;
    persistedEmails.forEach((email) => {
      SearchService.indexEmail({
        emailId: email.id,
        campaignId: campaign.id,
        tenantId: userId,
        senderId,
        senderEmail,
        recipient: email.recipient,
        subject,
        status: EmailStatus.SCHEDULED,
        attemptCount: email.attemptCount,
        scheduledAt: email.scheduledAt.toISOString(),
        sentAt: null,
        createdAt: new Date().toISOString(),
      }).catch((err) => logger.warn({ err }, 'Background ES index failed'));
    });

    const firstSendTime = persistedEmails[0]?.scheduledAt.toISOString() || startDate.toISOString();
    const lastSendTime =
      persistedEmails[persistedEmails.length - 1]?.scheduledAt.toISOString() ||
      new Date(startMs + (recipients.length - 1) * configuredDelayMs).toISOString();

    return {
      campaignId: campaign.id,
      totalScheduled: persistedEmails.length,
      firstSendTime,
      estimatedCompletionTime: lastSendTime,
    };
  }

  /**
   * Safely cancels a scheduled email if it has not yet been processed or sent.
   */
  static async cancelEmail(userId: string, emailId: string): Promise<boolean> {
    const email = await prisma.scheduledEmail.findFirst({
      where: { id: emailId, userId },
    });

    if (!email) {
      throw new Error('Email not found or unauthorized');
    }

    if (email.status === EmailStatus.SENT) {
      throw new Error('Cannot cancel an email that has already been sent');
    }

    // Update status to CANCELLED in DB
    await prisma.scheduledEmail.update({
      where: { id: emailId },
      data: { status: EmailStatus.CANCELLED as unknown as import('@prisma/client').EmailStatus },
    });

    // Remove from BullMQ if present
    if (email.bullJobId) {
      try {
        const job = await emailQueue.getJob(email.bullJobId);
        if (job) {
          await job.remove();
        }
      } catch (err) {
        logger.warn({ err, jobId: email.bullJobId }, 'Could not remove BullMQ job upon cancellation');
      }
    }

    // Update Elasticsearch
    await SearchService.updateStatus(emailId, EmailStatus.CANCELLED);

    return true;
  }
}
