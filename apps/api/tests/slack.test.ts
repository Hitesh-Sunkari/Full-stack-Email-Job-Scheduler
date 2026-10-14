import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SlackService } from '../src/modules/slack/slack-service';
import { prisma } from '../src/config/database';
import { NotificationStatus } from '@prisma/client';

describe('Slack Integration & Notification Deduplication', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should skip duplicate Slack notifications for the same sender and window key', async () => {
    const senderId = 'sender-111';
    const windowKey = '2026101411';

    // Mock existing event already in SENT status
    vi.spyOn(prisma.notificationEvent, 'findUnique').mockResolvedValue({
      id: 'event-1',
      tenantId: 'tenant-1',
      senderId,
      rateLimitWindow: windowKey,
      eventKey: `rate_limit:${senderId}:${windowKey}`,
      status: NotificationStatus.SENT,
      lastError: null,
      createdAt: new Date(),
    });

    const dispatched = await SlackService.sendRateLimitNotification({
      tenantId: 'tenant-1',
      senderId,
      senderEmail: 'sales@reachinbox.ai',
      hourlyLimit: 200,
      windowKey,
      nextEligibleTime: new Date(),
    });

    expect(dispatched).toBe(false);
  });

  it('should safely return false without failing if Slack is not connected for tenant', async () => {
    const senderId = 'sender-222';
    const windowKey = '2026101412';

    vi.spyOn(prisma.notificationEvent, 'findUnique').mockResolvedValue(null);
    vi.spyOn(prisma.notificationEvent, 'upsert').mockResolvedValue({
      id: 'event-2',
      tenantId: 'tenant-2',
      senderId,
      rateLimitWindow: windowKey,
      eventKey: `rate_limit:${senderId}:${windowKey}`,
      status: NotificationStatus.PENDING,
      lastError: null,
      createdAt: new Date(),
    });

    // Mock no slack connection found
    vi.spyOn(prisma.slackConnection, 'findUnique').mockResolvedValue(null);

    const dispatched = await SlackService.sendRateLimitNotification({
      tenantId: 'tenant-2',
      senderId,
      senderEmail: 'growth@reachinbox.ai',
      hourlyLimit: 200,
      windowKey,
      nextEligibleTime: new Date(),
    });

    expect(dispatched).toBe(false);
  });
});
