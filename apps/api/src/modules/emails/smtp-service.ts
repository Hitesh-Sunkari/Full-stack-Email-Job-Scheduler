import nodemailer, { Transporter } from 'nodemailer';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { decryptToken } from '../../lib/crypto';

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  fromName: string;
  fromEmail: string;
}

export interface SendMailOptions {
  to: string;
  subject: string;
  body: string;
}

export interface SendMailResult {
  messageId: string;
  previewUrl: string | null;
  accepted: string[];
}

export class SmtpService {
  /**
   * Builds a reusable Nodemailer Transporter.
   */
  static createTransporter(config: SmtpConfig): Transporter {
    return nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: {
        user: config.user,
        pass: config.pass,
      },
      tls: {
        rejectUnauthorized: env.NODE_ENV === 'production',
      },
    });
  }

  /**
   * Verifies SMTP connection and credentials.
   */
  static async verifyConnection(config: SmtpConfig): Promise<boolean> {
    const transporter = this.createTransporter(config);
    try {
      await transporter.verify();
      return true;
    } catch (error) {
      logger.error({ host: config.host, port: config.port, user: config.user, error: (error as Error).message }, 'SMTP Verification failed');
      return false;
    }
  }

  /**
   * Dispatches email via SMTP and extracts Ethereal preview link if available.
   */
  static async sendMail(config: SmtpConfig, options: SendMailOptions): Promise<SendMailResult> {
    const transporter = this.createTransporter(config);

    const fromAddress = config.fromName
      ? `"${config.fromName}" <${config.fromEmail}>`
      : config.fromEmail;

    const info = await transporter.sendMail({
      from: fromAddress,
      to: options.to,
      subject: options.subject,
      html: options.body,
      text: options.body.replace(/<[^>]*>?/gm, ''), // fallback plain text
    });

    // Obtain ethereal preview URL for test emails
    const previewUrl = nodemailer.getTestMessageUrl(info) || null;

    logger.info(
      {
        to: options.to,
        messageId: info.messageId,
        previewUrl,
      },
      'Email successfully accepted by SMTP server'
    );

    return {
      messageId: info.messageId,
      previewUrl: typeof previewUrl === 'string' ? previewUrl : null,
      accepted: (info.accepted as string[]) || [options.to],
    };
  }

  /**
   * Generates a new Ethereal test account dynamically for testing or development.
   */
  static async createEtherealAccount(): Promise<{ user: string; pass: string; host: string; port: number }> {
    const testAccount = await nodemailer.createTestAccount();
    return {
      user: testAccount.user,
      pass: testAccount.pass,
      host: testAccount.smtp.host,
      port: testAccount.smtp.port,
    };
  }
}
