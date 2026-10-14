import { z } from 'zod';
import { EMAIL_STATUS } from './constants';

export const EmailStringSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email('Invalid email address format')
  .max(254, 'Email address must not exceed 254 characters');

export const ScheduleEmailSchema = z.object({
  subject: z
    .string()
    .trim()
    .min(1, 'Email subject is required')
    .max(500, 'Email subject cannot exceed 500 characters'),
  body: z
    .string()
    .trim()
    .min(1, 'Email body is required')
    .max(50000, 'Email body cannot exceed 50,000 characters'),
  senderId: z.string().uuid('Valid sender ID is required'),
  startTime: z
    .string()
    .datetime({ message: 'Start time must be a valid ISO 8601 UTC timestamp' })
    .refine((val) => new Date(val).getTime() > Date.now() - 60000, {
      message: 'Start time cannot be in the past (more than 1 minute ago)',
    }),
  configuredDelayMs: z
    .number()
    .int('Delay must be an integer')
    .min(500, 'Minimum delay between sends is 500ms')
    .max(60000, 'Maximum delay is 60,000ms (1 minute)')
    .default(2000),
  hourlyLimit: z
    .number()
    .int('Hourly limit must be an integer')
    .min(1, 'Hourly limit must be at least 1')
    .max(10000, 'Hourly limit cannot exceed 10,000')
    .default(200),
  recipients: z
    .array(EmailStringSchema)
    .min(1, 'At least one recipient email is required')
    .max(5000, 'Maximum 5,000 recipients allowed per schedule request'),
  idempotencyKey: z
    .string()
    .trim()
    .min(1, 'Idempotency key is required')
    .max(128, 'Idempotency key cannot exceed 128 characters')
    .optional(),
});

export type ScheduleEmailInput = z.infer<typeof ScheduleEmailSchema>;

export const CreateSenderSchema = z.object({
  senderEmail: EmailStringSchema,
  displayName: z.string().trim().min(1, 'Display name is required').max(100),
  smtpHost: z.string().trim().min(1, 'SMTP host is required'),
  smtpPort: z.number().int().min(1).max(65535).default(587),
  smtpSecure: z.boolean().default(false),
  smtpUser: z.string().trim().min(1, 'SMTP username is required'),
  smtpPass: z.string().min(1, 'SMTP password is required'),
});

export type CreateSenderInput = z.infer<typeof CreateSenderSchema>;

export const SearchEmailsSchema = z.object({
  q: z.string().trim().optional(),
  status: z.enum([
    EMAIL_STATUS.SCHEDULED,
    EMAIL_STATUS.PROCESSING,
    EMAIL_STATUS.SENT,
    EMAIL_STATUS.FAILED,
    EMAIL_STATUS.CANCELLED,
  ]).optional(),
  senderId: z.string().uuid().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type SearchEmailsQuery = z.infer<typeof SearchEmailsSchema>;

export const CancelEmailSchema = z.object({
  emailId: z.string().uuid('Valid scheduled email ID is required'),
});

export type CancelEmailInput = z.infer<typeof CancelEmailSchema>;
