import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../../middleware/auth-middleware';
import { prisma } from '../../config/database';
import { CreateSenderSchema } from '@reachinbox/shared';
import { SmtpService } from '../emails/smtp-service';
import { encryptToken } from '../../lib/crypto';
import { env } from '../../config/env';

export const sendersRouter = Router();

// Enforce authentication across all sender routes
sendersRouter.use(requireAuth);

// GET /api/senders
sendersRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const senders = await prisma.senderAccount.findMany({
      where: { userId },
      select: {
        id: true,
        userId: true,
        senderEmail: true,
        displayName: true,
        smtpHost: true,
        smtpPort: true,
        smtpSecure: true,
        smtpUser: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      success: true,
      data: senders,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/senders
sendersRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const input = CreateSenderSchema.parse(req.body);

    // Verify SMTP connection before persisting
    const isValid = await SmtpService.verifyConnection({
      host: input.smtpHost,
      port: input.smtpPort,
      secure: input.smtpSecure,
      user: input.smtpUser,
      pass: input.smtpPass,
      fromName: input.displayName,
      fromEmail: input.senderEmail,
    });

    if (!isValid) {
      res.status(400).json({
        success: false,
        error: {
          code: 'SMTP_VERIFICATION_FAILED',
          message: 'Could not connect to SMTP server with provided credentials.',
        },
      });
      return;
    }

    const encryptedPass = encryptToken(input.smtpPass, env.TOKEN_ENCRYPTION_KEY);

    const sender = await prisma.senderAccount.upsert({
      where: {
        userId_senderEmail: {
          userId,
          senderEmail: input.senderEmail,
        },
      },
      create: {
        userId,
        senderEmail: input.senderEmail,
        displayName: input.displayName,
        smtpHost: input.smtpHost,
        smtpPort: input.smtpPort,
        smtpSecure: input.smtpSecure,
        smtpUser: input.smtpUser,
        encryptedSmtpPass: encryptedPass,
        isActive: true,
      },
      update: {
        displayName: input.displayName,
        smtpHost: input.smtpHost,
        smtpPort: input.smtpPort,
        smtpSecure: input.smtpSecure,
        smtpUser: input.smtpUser,
        encryptedSmtpPass: encryptedPass,
        isActive: true,
      },
      select: {
        id: true,
        userId: true,
        senderEmail: true,
        displayName: true,
        smtpHost: true,
        smtpPort: true,
        smtpSecure: true,
        smtpUser: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    res.status(201).json({
      success: true,
      data: sender,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/senders/ethereal
// Automatically provisions and registers a real Ethereal SMTP sender for frictionless live testing
sendersRouter.post('/ethereal', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const etherealAccount = await SmtpService.createEtherealAccount();
    const encryptedPass = encryptToken(etherealAccount.pass, env.TOKEN_ENCRYPTION_KEY);

    const sender = await prisma.senderAccount.create({
      data: {
        userId,
        senderEmail: etherealAccount.user,
        displayName: 'Ethereal Test Sender',
        smtpHost: etherealAccount.host,
        smtpPort: etherealAccount.port,
        smtpSecure: false,
        smtpUser: etherealAccount.user,
        encryptedSmtpPass: encryptedPass,
        isActive: true,
      },
      select: {
        id: true,
        userId: true,
        senderEmail: true,
        displayName: true,
        smtpHost: true,
        smtpPort: true,
        smtpSecure: true,
        smtpUser: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    res.status(201).json({
      success: true,
      data: sender,
    });
  } catch (error) {
    next(error);
  }
});
