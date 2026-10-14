import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../../middleware/auth-middleware';
import { prisma } from '../../config/database';
import { ScheduleEmailSchema, EmailStatus } from '@reachinbox/shared';
import { SchedulerService } from '../scheduling/scheduler-service';

export const emailsRouter = Router();

emailsRouter.use(requireAuth);

// POST /api/emails/schedule
emailsRouter.post('/schedule', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const input = ScheduleEmailSchema.parse(req.body);

    const result = await SchedulerService.scheduleCampaign(userId, input);

    res.status(201).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/emails/scheduled
emailsRouter.get('/scheduled', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const where = {
      userId,
      status: {
        in: [
          EmailStatus.SCHEDULED as unknown as import('@prisma/client').EmailStatus,
          EmailStatus.PROCESSING as unknown as import('@prisma/client').EmailStatus,
        ],
      },
    };

    const [total, emails] = await Promise.all([
      prisma.scheduledEmail.count({ where }),
      prisma.scheduledEmail.findMany({
        where,
        skip,
        take: limit,
        orderBy: { scheduledAt: 'asc' },
        include: {
          sender: { select: { senderEmail: true, displayName: true } },
        },
      }),
    ]);

    const formatted = emails.map((e) => ({
      id: e.id,
      campaignId: e.campaignId,
      userId: e.userId,
      senderId: e.senderId,
      senderEmail: e.sender.senderEmail,
      recipient: e.recipient,
      subject: e.subject,
      body: e.body,
      scheduledAt: e.scheduledAt.toISOString(),
      sentAt: e.sentAt ? e.sentAt.toISOString() : null,
      status: e.status,
      attemptCount: e.attemptCount,
      idempotencyKey: e.idempotencyKey,
      bullJobId: e.bullJobId,
      smtpMessageId: e.smtpMessageId,
      etherealPreviewUrl: e.etherealPreviewUrl,
      lastError: e.lastError,
      createdAt: e.createdAt.toISOString(),
      updatedAt: e.updatedAt.toISOString(),
    }));

    res.json({
      success: true,
      data: formatted,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/emails/sent
emailsRouter.get('/sent', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const where = {
      userId,
      status: {
        in: [
          EmailStatus.SENT as unknown as import('@prisma/client').EmailStatus,
          EmailStatus.FAILED as unknown as import('@prisma/client').EmailStatus,
          EmailStatus.CANCELLED as unknown as import('@prisma/client').EmailStatus,
        ],
      },
    };

    const [total, emails] = await Promise.all([
      prisma.scheduledEmail.count({ where }),
      prisma.scheduledEmail.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ sentAt: 'desc' }, { updatedAt: 'desc' }],
        include: {
          sender: { select: { senderEmail: true, displayName: true } },
        },
      }),
    ]);

    const formatted = emails.map((e) => ({
      id: e.id,
      campaignId: e.campaignId,
      userId: e.userId,
      senderId: e.senderId,
      senderEmail: e.sender.senderEmail,
      recipient: e.recipient,
      subject: e.subject,
      body: e.body,
      scheduledAt: e.scheduledAt.toISOString(),
      sentAt: e.sentAt ? e.sentAt.toISOString() : null,
      status: e.status,
      attemptCount: e.attemptCount,
      idempotencyKey: e.idempotencyKey,
      bullJobId: e.bullJobId,
      smtpMessageId: e.smtpMessageId,
      etherealPreviewUrl: e.etherealPreviewUrl,
      lastError: e.lastError,
      createdAt: e.createdAt.toISOString(),
      updatedAt: e.updatedAt.toISOString(),
    }));

    res.json({
      success: true,
      data: formatted,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/emails/stats/summary
emailsRouter.get('/stats/summary', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;

    const [totalScheduled, totalSent, totalFailed, totalPending, activeSendersCount] =
      await Promise.all([
        prisma.scheduledEmail.count({ where: { userId } }),
        prisma.scheduledEmail.count({
          where: {
            userId,
            status: EmailStatus.SENT as unknown as import('@prisma/client').EmailStatus,
          },
        }),
        prisma.scheduledEmail.count({
          where: {
            userId,
            status: EmailStatus.FAILED as unknown as import('@prisma/client').EmailStatus,
          },
        }),
        prisma.scheduledEmail.count({
          where: {
            userId,
            status: {
              in: [
                EmailStatus.SCHEDULED as unknown as import('@prisma/client').EmailStatus,
                EmailStatus.PROCESSING as unknown as import('@prisma/client').EmailStatus,
              ],
            },
          },
        }),
        prisma.senderAccount.count({ where: { userId, isActive: true } }),
      ]);

    res.json({
      success: true,
      data: {
        totalScheduled,
        totalSent,
        totalFailed,
        totalPending,
        activeSendersCount,
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/emails/:id
emailsRouter.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const email = await prisma.scheduledEmail.findFirst({
      where: { id: req.params.id, userId },
      include: {
        sender: { select: { senderEmail: true, displayName: true } },
        campaign: true,
      },
    });

    if (!email) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Email record not found' },
      });
      return;
    }

    res.json({
      success: true,
      data: email,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/emails/:id/cancel
emailsRouter.post('/:id/cancel', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    await SchedulerService.cancelEmail(userId, req.params.id);

    res.json({
      success: true,
      data: { message: 'Scheduled email cancelled successfully' },
    });
  } catch (error) {
    next(error);
  }
});
