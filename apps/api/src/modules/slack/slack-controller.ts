import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { requireAuth } from '../../middleware/auth-middleware';
import { SlackService } from './slack-service';
import { env, isSlackOAuthConfigured } from '../../config/env';

export const slackRouter = Router();

// GET /api/integrations/slack (status check)
slackRouter.get('/', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const status = await SlackService.getConnectionStatus(userId);

    res.json({
      success: true,
      data: status,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/integrations/slack/connect (start OAuth)
slackRouter.get('/connect', requireAuth, (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!isSlackOAuthConfigured()) {
      res.status(503).json({
        success: false,
        error: {
          code: 'SLACK_NOT_CONFIGURED',
          message:
            'Slack integration is not configured. Please supply SLACK_CLIENT_ID and SLACK_CLIENT_SECRET in .env.',
        },
      });
      return;
    }

    const state = crypto.randomBytes(24).toString('hex');
    req.session.slackOAuthState = state;

    const authUrl = SlackService.getAuthorizationUrl(state);
    res.redirect(authUrl);
  } catch (error) {
    next(error);
  }
});

// GET /api/integrations/slack/callback (OAuth code exchange)
slackRouter.get('/callback', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { code, state, error: slackError } = req.query;

    if (slackError) {
      res.redirect(`${env.FRONTEND_URL}/dashboard?slack_error=${encodeURIComponent(String(slackError))}`);
      return;
    }

    if (!code || typeof code !== 'string') {
      res.redirect(`${env.FRONTEND_URL}/dashboard?slack_error=missing_code`);
      return;
    }

    if (!state || state !== req.session.slackOAuthState) {
      res.redirect(`${env.FRONTEND_URL}/dashboard?slack_error=invalid_state`);
      return;
    }

    const userId = req.session.userId;
    if (!userId) {
      res.redirect(`${env.FRONTEND_URL}/login?error=session_expired`);
      return;
    }

    delete req.session.slackOAuthState;

    await SlackService.handleOAuthCallback(code, userId);

    res.redirect(`${env.FRONTEND_URL}/dashboard?slack=connected`);
  } catch (error) {
    next(error);
  }
});

// POST /api/integrations/slack/disconnect
slackRouter.post('/disconnect', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    await SlackService.disconnect(userId);

    res.json({
      success: true,
      data: { message: 'Slack integration disconnected successfully' },
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/integrations/slack/test
slackRouter.post('/test', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const result = await SlackService.sendRateLimitNotification({
      tenantId: userId,
      senderId: 'test-sender',
      senderEmail: req.user!.email || 'sender@reachinbox.ai',
      hourlyLimit: 50,
      windowKey: new Date().toISOString().slice(0, 13).replace(/[-:T]/g, ''),
      nextEligibleTime: new Date(Date.now() + 3600000),
      force: true,
    });

    if (!result) {
      res.status(400).json({
        success: false,
        error: {
          code: 'SLACK_NOT_CONNECTED',
          message: 'Slack is not connected for this account. Please connect via OAuth first.',
        },
      });
      return;
    }

    res.json({
      success: true,
      data: { message: 'Test rate-limit alert successfully dispatched to your Slack channel!' },
    });
  } catch (error) {
    next(error);
  }
});
