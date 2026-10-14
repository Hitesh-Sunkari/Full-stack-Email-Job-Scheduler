import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RecoveryService } from '../src/modules/scheduling/recovery-service';
import { prisma } from '../src/config/database';
import { emailQueue } from '../src/modules/scheduling/queue';
import { EmailStatus } from '@reachinbox/shared';

describe('Database-Backed Queue Recovery Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should reset stale PROCESSING jobs older than 5 minutes to SCHEDULED', async () => {
    vi.spyOn(prisma.scheduledEmail, 'updateMany').mockResolvedValue({ count: 3 });
    vi.spyOn(prisma.scheduledEmail, 'findMany').mockResolvedValue([]);

    const result = await RecoveryService.reconcile();

    expect(result.unStuckCount).toBe(3);
    expect(prisma.scheduledEmail.updateMany).toHaveBeenCalledWith({
      where: {
        status: EmailStatus.PROCESSING as unknown as import('@prisma/client').EmailStatus,
        updatedAt: { lt: expect.any(Date) },
      },
      data: {
        status: EmailStatus.SCHEDULED as unknown as import('@prisma/client').EmailStatus,
        lastError: 'Worker lease expired; reset to SCHEDULED by recovery service',
      },
    });
  });

  it('should detect un-enqueued SCHEDULED emails and re-enqueue them into BullMQ', async () => {
    vi.spyOn(prisma.scheduledEmail, 'updateMany').mockResolvedValue({ count: 0 });

    const sampleEmail = {
      id: 'email-recovery-1',
      campaignId: 'camp-1',
      userId: 'user-1',
      senderId: 'sender-1',
      recipient: 'recovered@example.com',
      subject: 'Recovered Subject',
      body: 'Recovered Body',
      scheduledAt: new Date(Date.now() + 10000),
      status: EmailStatus.SCHEDULED as unknown as import('@prisma/client').EmailStatus,
      attemptCount: 0,
      bullJobId: null,
      campaign: { subject: 'Campaign Sub', body: 'Campaign Body' },
    };

    // @ts-expect-error test mock
    vi.spyOn(prisma.scheduledEmail, 'findMany').mockResolvedValue([sampleEmail]);
    vi.spyOn(prisma.scheduledEmail, 'update').mockResolvedValue(sampleEmail as unknown as import('@prisma/client').ScheduledEmail);

    // Mock BullMQ job missing
    vi.spyOn(emailQueue, 'getJob').mockResolvedValue(null);
    const addSpy = vi.spyOn(emailQueue, 'add').mockResolvedValue({ id: 'email_email-recovery-1' } as unknown as import('bullmq').Job);

    const result = await RecoveryService.reconcile();

    expect(result.reconciledCount).toBe(1);
    expect(addSpy).toHaveBeenCalledWith(
      'dispatch-email',
      expect.objectContaining({
        scheduledEmailId: 'email-recovery-1',
        recipient: 'recovered@example.com',
      }),
      expect.objectContaining({
        jobId: 'email_email-recovery-1',
      })
    );
  });
});
