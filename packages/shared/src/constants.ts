export const QUEUE_NAMES = {
  EMAIL_DISPATCH: 'email-dispatch-queue',
} as const;

export const EMAIL_STATUS = {
  SCHEDULED: 'SCHEDULED',
  PROCESSING: 'PROCESSING',
  SENT: 'SENT',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
} as const;

export type EmailStatus = (typeof EMAIL_STATUS)[keyof typeof EMAIL_STATUS];
export const EmailStatus = EMAIL_STATUS;

export const CAMPAIGN_STATUS = {
  DRAFT: 'DRAFT',
  ACTIVE: 'ACTIVE',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const;

export type CampaignStatus = (typeof CAMPAIGN_STATUS)[keyof typeof CAMPAIGN_STATUS];
export const CampaignStatus = CAMPAIGN_STATUS;

export const NOTIFICATION_STATUS = {
  PENDING: 'PENDING',
  SENT: 'SENT',
  FAILED: 'FAILED',
} as const;

export type NotificationStatus = (typeof NOTIFICATION_STATUS)[keyof typeof NOTIFICATION_STATUS];
export const NotificationStatus = NOTIFICATION_STATUS;

export const DEFAULT_CONFIG = {
  MIN_DELAY_BETWEEN_EMAILS_MS: 2000,
  MAX_EMAILS_PER_HOUR_PER_SENDER: 200,
  WORKER_CONCURRENCY: 2,
  MAX_BATCH_SIZE: 1000,
} as const;

export const RECOGNIZED_EMAIL_HEADERS = [
  'email',
  'email_address',
  'emailaddress',
  'recipient',
  'recipient_email',
  'to',
  'to_email',
  'contact_email',
] as const;
