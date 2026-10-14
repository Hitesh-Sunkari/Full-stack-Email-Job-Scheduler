import { describe, it, expect } from 'vitest';
import { ScheduleEmailSchema, CreateSenderSchema } from '@reachinbox/shared';

describe('Scheduling and Sender Schema Validation', () => {
  it('should validate valid schedule input payload', () => {
    const validPayload = {
      subject: 'Quarterly Product Update',
      body: '<p>Hello team, here is the update.</p>',
      senderId: '123e4567-e89b-12d3-a456-426614174000',
      startTime: new Date(Date.now() + 60000).toISOString(),
      configuredDelayMs: 2500,
      hourlyLimit: 150,
      recipients: ['alex@domain.com', 'maria@tech.co'],
    };

    const parsed = ScheduleEmailSchema.safeParse(validPayload);
    expect(parsed.success).toBe(true);
  });

  it('should reject invalid recipient email formats', () => {
    const invalidPayload = {
      subject: 'Valid Subject',
      body: 'Valid Body',
      senderId: '123e4567-e89b-12d3-a456-426614174000',
      startTime: new Date(Date.now() + 60000).toISOString(),
      recipients: ['not-an-email'],
    };

    const parsed = ScheduleEmailSchema.safeParse(invalidPayload);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0].message).toContain('Invalid email address format');
    }
  });

  it('should enforce inter-send delay minimum of 500ms', () => {
    const lowDelayPayload = {
      subject: 'Subject',
      body: 'Body',
      senderId: '123e4567-e89b-12d3-a456-426614174000',
      startTime: new Date(Date.now() + 60000).toISOString(),
      configuredDelayMs: 200, // below 500ms minimum
      recipients: ['valid@domain.com'],
    };

    const parsed = ScheduleEmailSchema.safeParse(lowDelayPayload);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0].message).toContain('Minimum delay between sends is 500ms');
    }
  });

  it('should validate CreateSenderSchema with port and host validation', () => {
    const validSender = {
      senderEmail: 'sales@reachinbox.ai',
      displayName: 'Sales Team',
      smtpHost: 'smtp.ethereal.email',
      smtpPort: 587,
      smtpSecure: false,
      smtpUser: 'my_user',
      smtpPass: 'my_secret_pass',
    };

    const parsed = CreateSenderSchema.safeParse(validSender);
    expect(parsed.success).toBe(true);
  });
});
