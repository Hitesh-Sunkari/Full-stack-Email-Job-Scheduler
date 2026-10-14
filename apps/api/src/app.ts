import express, { Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import rateLimit from 'express-rate-limit';
import { v4 as uuidv4 } from 'uuid';
import { env } from './config/env';
import { errorHandler } from './middleware/error-middleware';
import { authRouter } from './modules/auth/auth-controller';
import { sendersRouter } from './modules/senders/senders-controller';
import { emailsRouter } from './modules/emails/emails-controller';
import { campaignsRouter } from './modules/campaigns/campaigns-controller';
import { searchRouter } from './modules/search/search-controller';
import { slackRouter } from './modules/slack/slack-controller';
import { healthRouter } from './modules/health/health-controller';
import { bullBoardRouter, adminAuthMiddleware } from './modules/queue/bull-board';

export function createApp(): Express {
  const app = express();

  // Security headers with Helmet
  app.use(
    helmet({
      contentSecurityPolicy: false, // Bull Board and dev dashboard styles
      crossOriginEmbedderPolicy: false,
    })
  );

  // CORS configuration
  app.use(
    cors({
      origin: [env.FRONTEND_URL, 'http://localhost:5173', 'http://127.0.0.1:5173'],
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
    })
  );

  // Request ID tracking
  app.use((req, res, next) => {
    const requestId = (req.headers['x-request-id'] as string) || uuidv4();
    res.setHeader('X-Request-Id', requestId);
    next();
  });

  // Body parsers
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use(cookieParser(env.SESSION_SECRET));

  // Express Session configuration
  app.use(
    session({
      name: 'reachinbox_sid',
      secret: env.SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: env.NODE_ENV === 'production',
        sameSite: env.NODE_ENV === 'production' ? 'none' : 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      },
    })
  );

  // API rate limiting
  const apiLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      error: {
        code: 'TOO_MANY_REQUESTS',
        message: 'Too many requests from this client. Please slow down.',
      },
    },
  });

  app.use('/api', apiLimiter);

  // Mount API modules
  app.use('/api/auth', authRouter);
  app.use('/api/senders', sendersRouter);
  app.use('/api/emails', emailsRouter);
  app.use('/api/campaigns', campaignsRouter);
  app.use('/api/search', searchRouter);
  app.use('/api/integrations/slack', slackRouter);
  app.use('/api', healthRouter);

  // Mount Bull Board queue dashboard
  app.use('/admin/queues', adminAuthMiddleware, bullBoardRouter);

  // Global error handler
  app.use(errorHandler);

  return app;
}
