import { EmailStatus, CampaignStatus, NotificationStatus } from './constants';

export interface UserProfile {
  id: string;
  googleSub: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SenderAccount {
  id: string;
  userId: string;
  senderEmail: string;
  displayName: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface EmailCampaign {
  id: string;
  userId: string;
  senderId: string;
  subject: string;
  body: string;
  startTime: string;
  configuredDelayMs: number;
  hourlyLimit: number;
  status: CampaignStatus;
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduledEmailItem {
  id: string;
  campaignId: string;
  userId: string;
  senderId: string;
  senderEmail?: string;
  recipient: string;
  subject: string;
  body: string;
  scheduledAt: string;
  sentAt: string | null;
  status: EmailStatus;
  attemptCount: number;
  idempotencyKey: string;
  bullJobId: string | null;
  smtpMessageId: string | null;
  etherealPreviewUrl: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SlackConnectionInfo {
  id: string;
  userId: string;
  slackTeamId: string;
  slackTeamName: string | null;
  channelName: string | null;
  isConnected: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationEventItem {
  id: string;
  tenantId: string;
  senderId: string;
  rateLimitWindow: string;
  eventKey: string;
  status: NotificationStatus;
  lastError: string | null;
  createdAt: string;
}

export interface EmailStatsSummary {
  totalScheduled: number;
  totalSent: number;
  totalFailed: number;
  totalPending: number;
  activeSendersCount: number;
}

export interface LeadParseResult {
  validEmails: string[];
  invalidRows: { row: number; raw: string; reason: string }[];
  duplicateCount: number;
  totalRows: number;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    timestamp: string;
    requestId?: string;
  };
}
