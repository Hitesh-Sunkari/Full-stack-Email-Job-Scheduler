import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { UserProfile } from '@reachinbox/shared';

// Extend Express Session & Request types
declare module 'express-session' {
  interface SessionData {
    userId?: string;
    oauthState?: string;
    slackOAuthState?: string;
  }
}

declare global {
  namespace Express {
    interface Request {
      user?: UserProfile;
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const userId = req.session?.userId;

  if (!userId) {
    res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required. Please log in.',
      },
    });
    return;
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        googleSub: true,
        email: true,
        name: true,
        avatarUrl: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      req.session.destroy(() => {});
      res.status(401).json({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'The authenticated user session is no longer valid.',
        },
      });
      return;
    }

    req.user = {
      ...user,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    };

    next();
  } catch (error) {
    next(error);
  }
}
