import { Queue, QueueEvents } from 'bullmq';
import { QUEUE_NAMES } from '@reachinbox/shared';
import { env } from '../../config/env';
import { logger } from '../../config/logger';

export interface EmailDispatchJobData {
  scheduledEmailId: string;
  campaignId: string;
  userId: string;
  senderId: string;
  recipient: string;
  subject: string;
  body: string;
  attemptCount: number;
}

// BullMQ connection options directly via Redis URL parsing
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

export const emailQueue = new Queue<EmailDispatchJobData>(QUEUE_NAMES.EMAIL_DISPATCH, {
  connection: parseRedisUrl(env.REDIS_URL),
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: {
      count: 10000,
    },
    removeOnFail: {
      count: 10000,
    },
  },
});

export const emailQueueEvents = new QueueEvents(QUEUE_NAMES.EMAIL_DISPATCH, {
  connection: parseRedisUrl(env.REDIS_URL),
});

emailQueueEvents.on('completed', ({ jobId }) => {
  logger.debug({ jobId }, 'BullMQ Job completed');
});

emailQueueEvents.on('failed', ({ jobId, failedReason }) => {
  logger.warn({ jobId, failedReason }, 'BullMQ Job failed');
});
