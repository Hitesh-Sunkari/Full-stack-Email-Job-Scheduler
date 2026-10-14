import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { AuthService } from './auth-service';
import { requireAuth } from '../../middleware/auth-middleware';
import { env, isGoogleOAuthConfigured } from '../../config/env';
import { prisma } from '../../config/database';

export const authRouter = Router();

// GET /api/auth/google
authRouter.get('/google', (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!isGoogleOAuthConfigured()) {
      res.status(503).json({
        success: false,
        error: {
          code: 'GOOGLE_OAUTH_NOT_CONFIGURED',
          message:
            'Google OAuth is not configured. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in the server .env configuration.',
        },
      });
      return;
    }

    const state = crypto.randomBytes(24).toString('hex');
    req.session.oauthState = state;

    const redirectUrl = AuthService.getGoogleAuthUrl(state);
    res.redirect(redirectUrl);
  } catch (error) {
    next(error);
  }
});

// GET /api/auth/google/callback
authRouter.get('/google/callback', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { code, state, error: googleError } = req.query;

    if (googleError) {
      res.redirect(`${env.FRONTEND_URL}/login?error=${encodeURIComponent(String(googleError))}`);
      return;
    }

    if (!code || typeof code !== 'string') {
      res.redirect(`${env.FRONTEND_URL}/login?error=missing_code`);
      return;
    }

    // Validate CSRF state
    if (!state || state !== req.session.oauthState) {
      res.redirect(`${env.FRONTEND_URL}/login?error=invalid_state`);
      return;
    }

    delete req.session.oauthState;

    const user = await AuthService.handleGoogleCallback(code);
    req.session.userId = user.id;

    // Persist session before redirect
    req.session.save((err) => {
      if (err) {
        return next(err);
      }
      res.redirect(`${env.FRONTEND_URL}/dashboard`);
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/auth/me
authRouter.get('/me', requireAuth, (req: Request, res: Response) => {
  res.json({
    success: true,
    data: req.user,
  });
});

// POST /api/auth/logout
authRouter.post('/logout', (req: Request, res: Response, next: NextFunction) => {
  req.session.destroy((err) => {
    if (err) {
      return next(err);
    }
    res.clearCookie('reachinbox_sid');
    res.json({
      success: true,
      data: { message: 'Successfully logged out' },
    });
  });
});

// GET /api/auth/status
authRouter.get('/status', (req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      isGoogleConfigured: isGoogleOAuthConfigured(),
      isAuthenticated: Boolean(req.session?.userId),
    },
  });
});

// POST /api/auth/dev-login (Instant 1-click login for evaluation and local demo)
authRouter.post('/dev-login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (env.NODE_ENV === 'production') {
      res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Dev login is disabled in production environments' },
      });
      return;
    }

    const demoUser = await prisma.user.upsert({
      where: { googleSub: 'google-demo-reachinbox-sub-001' },
      create: {
        googleSub: 'google-demo-reachinbox-sub-001',
        email: 'demo@reachinbox.ai',
        name: 'ReachInbox Demo User',
        avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=128&fit=crop&crop=faces',
      },
      update: {},
    });

    req.session.userId = demoUser.id;
    req.session.save((err) => {
      if (err) return next(err);
      res.json({
        success: true,
        data: demoUser,
      });
    });
  } catch (error) {
    next(error);
  }
});

