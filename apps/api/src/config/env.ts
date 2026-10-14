import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

// Load .env reliably from monorepo root and process.cwd()
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'apps/api/.env') });

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(4000),
  FRONTEND_URL: z.string().url().default('http://localhost:5173'),
  API_BASE_URL: z.string().url().default('http://localhost:4000'),

  // PostgreSQL
  DATABASE_URL: z
    .string()
    .min(1, 'DATABASE_URL is required')
    .default('postgresql://reachinbox:reachinbox_secret@127.0.0.1:5432/reachinbox_db?schema=public'),

  // Redis
  REDIS_URL: z.string().min(1, 'REDIS_URL is required').default('redis://127.0.0.1:6379'),

  // Cryptographic secrets
  SESSION_SECRET: z
    .string()
    .min(16, 'SESSION_SECRET must be at least 16 characters long')
    .default('e7c8b2149dfa2c5a0899015c7e163b7e9f3b55a18a939f60cb05c083658eb1a4'),
  TOKEN_ENCRYPTION_KEY: z
    .string()
    .min(32, 'TOKEN_ENCRYPTION_KEY must be at least 32 characters long')
    .default('4a2e5d9c7f1b8a3e0f5c9d2b7e4a1f8c6e3b0a7d9f2c5e8a1b4d7f0c3e6a9b2d'),

  // Google OAuth
  GOOGLE_CLIENT_ID: z.string().default(''),
  GOOGLE_CLIENT_SECRET: z.string().default(''),
  GOOGLE_CALLBACK_URL: z.string().default('http://localhost:4000/api/auth/google/callback'),

  // SMTP Settings
  SMTP_HOST: z.string().default('smtp.ethereal.email'),
  SMTP_PORT: z.coerce.number().int().default(587),
  SMTP_SECURE: z.coerce.boolean().default(false),
  SMTP_USER: z.string().default(''),
  SMTP_PASS: z.string().default(''),
  SMTP_FROM_NAME: z.string().default('ReachInbox Outbox'),
  SMTP_FROM_EMAIL: z.string().default('outbox@reachinbox.test'),

  // Elasticsearch
  ELASTICSEARCH_URL: z.string().default('http://127.0.0.1:9200'),
  ELASTICSEARCH_USERNAME: z.string().optional(),
  ELASTICSEARCH_PASSWORD: z.string().optional(),
  ELASTICSEARCH_INDEX: z.string().default('reachinbox_emails'),

  // Worker & Rate Limiting
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(20).default(2),
  MIN_DELAY_BETWEEN_EMAILS_MS: z.coerce.number().int().min(100).max(60000).default(2000),
  MAX_EMAILS_PER_HOUR_PER_SENDER: z.coerce.number().int().min(1).max(100000).default(200),

  // Slack Integration
  SLACK_CLIENT_ID: z.string().default(''),
  SLACK_CLIENT_SECRET: z.string().default(''),
  SLACK_CALLBACK_URL: z.string().default('http://localhost:4000/api/integrations/slack/callback'),
  SLACK_SCOPES: z.string().default('chat:write,channels:read,incoming-webhook'),
  SLACK_DEFAULT_CHANNEL: z.string().default('#email-alerts'),

  // Admin access
  ADMIN_SECRET: z.string().default('reachinbox_admin_queue_2026'),
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment configuration:');
  console.error(JSON.stringify(parsed.error.format(), null, 2));
  process.exit(1);
}

export const env = parsed.data;

export const isGoogleOAuthConfigured = (): boolean => {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && !env.GOOGLE_CLIENT_ID.includes('your_google'));
};

export const isSlackOAuthConfigured = (): boolean => {
  return Boolean(env.SLACK_CLIENT_ID && env.SLACK_CLIENT_SECRET && !env.SLACK_CLIENT_ID.includes('your_slack'));
};

export const isSmtpConfigured = (): boolean => {
  return Boolean(env.SMTP_USER && env.SMTP_PASS && !env.SMTP_USER.includes('your_ethereal'));
};
