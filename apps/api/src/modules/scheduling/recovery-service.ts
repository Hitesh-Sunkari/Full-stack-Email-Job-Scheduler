import { prisma } from '../../config/database';
import { emailQueue, EmailDispatchJobData } from './queue';
import { logger } from '../../config/logger';
import { EmailStatus } from '@reachinbox/shared';

export class RecoveryService {
  /**
   * Reconciles database records with Redis BullMQ queue.
   * Runs at startup or via explicit CLI command (npm run recover).
   * Does NOT rely on cron or polling schedulers.
   */
  static async reconcile(): Promise<{ reconciledCount: number; unStuckCount: number }> {
    logger.info('Starting database-backed recovery and queue reconciliation...');

    let reconciledCount = 0;
    let unStuckCount = 0;

    // 1. Un-stick jobs left in 'PROCESSING' for more than 5 minutes (due to ungraceful worker termination)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const stuckJobs = await prisma.scheduledEmail.updateMany({
      where: {
        status: EmailStatus.PROCESSING as unknown as import('@prisma/client').EmailStatus,
        updatedAt: { lt: fiveMinutesAgo },
      },
      data: {
        status: EmailStatus.SCHEDULED as unknown as import('@prisma/client').EmailStatus,
        lastError: 'Worker lease expired; reset to SCHEDULED by recovery service',
      },
    });

    unStuckCount = stuckJobs.count;
    if (unStuckCount > 0) {
      logger.warn({ count: unStuckCount }, 'Reset stale PROCESSING emails to SCHEDULED status');
    }

    // 2. Find all pending SCHEDULED emails
    const pendingEmails = await prisma.scheduledEmail.findMany({
      where: {
        status: EmailStatus.SCHEDULED as unknown as import('@prisma/client').EmailStatus,
      },
      include: {
        campaign: { select: { subject: true, body: true } },
      },
      orderBy: { scheduledAt: 'asc' },
      take: 2000,
    });

    logger.info({ pendingCount: pendingEmails.length }, 'Scanning pending scheduled emails for queue health');

    const now = Date.now();
    for (const email of pendingEmails) {
      const jobId = `email_${email.id}`;

      try {
        const existingJob = await emailQueue.getJob(jobId);

        // If job is missing or finished while DB record says SCHEDULED, re-enqueue
        if (!existingJob) {
          const delay = Math.max(0, email.scheduledAt.getTime() - now);

          await emailQueue.add(
            'dispatch-email',
            {
              scheduledEmailId: email.id,
              campaignId: email.campaignId,
              userId: email.userId,
              senderId: email.senderId,
              recipient: email.recipient,
              subject: email.subject || email.campaign.subject,
              body: email.body || email.campaign.body,
              attemptCount: email.attemptCount,
            } as EmailDispatchJobData,
            {
              jobId,
              delay,
            }
          );

          if (!email.bullJobId) {
            await prisma.scheduledEmail.update({
              where: { id: email.id },
              data: { bullJobId: jobId },
            });
          }

          reconciledCount++;
        }
      } catch (err) {
        logger.error({ err, emailId: email.id }, 'Error reconciling email queue job');
      }
    }

    logger.info(
      { reconciledCount, unStuckCount },
      'Queue reconciliation completed successfully'
    );

    return { reconciledCount, unStuckCount };
  }
}
