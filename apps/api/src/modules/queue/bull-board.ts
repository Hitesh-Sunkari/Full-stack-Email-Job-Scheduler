import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { emailQueue } from '../scheduling/queue';
import { Request, Response, NextFunction } from 'express';
import { env } from '../../config/env';

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');

createBullBoard({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  queues: [new BullMQAdapter(emailQueue) as any],
  serverAdapter,
});

// Admin authentication middleware for Bull Board
export function adminAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  const querySecret = req.query.secret as string | undefined;

  if (
    env.NODE_ENV === 'development' ||
    querySecret === env.ADMIN_SECRET ||
    authHeader === `Bearer ${env.ADMIN_SECRET}` ||
    Boolean(req.session?.userId)
  ) {
    return next();
  }

  res.status(401).send('Unauthorized to access Bull Board dashboard. Provide ?secret=reachinbox_admin_queue_2026 or log in.');
}

export const bullBoardRouter = serverAdapter.getRouter();
