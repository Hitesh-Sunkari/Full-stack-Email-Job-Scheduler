import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../../middleware/auth-middleware';
import { prisma } from '../../config/database';

export const campaignsRouter = Router();

campaignsRouter.use(requireAuth);

// GET /api/campaigns
campaignsRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const campaigns = await prisma.emailCampaign.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        sender: {
          select: {
            id: true,
            senderEmail: true,
            displayName: true,
          },
        },
      },
    });

    res.json({
      success: true,
      data: campaigns,
    });
  } catch (error) {
    next(error);
  }
});
