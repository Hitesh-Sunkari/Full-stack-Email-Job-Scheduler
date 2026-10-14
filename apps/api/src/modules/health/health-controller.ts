import { Router, Request, Response } from 'express';
import { checkDatabaseConnection } from '../../config/database';
import { checkRedisConnection } from '../../config/redis';
import { checkElasticsearchConnection } from '../../config/elasticsearch';

export const healthRouter = Router();

// GET /api/health (Liveness probe)
healthRouter.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// GET /api/ready (Readiness probe)
healthRouter.get('/ready', async (_req: Request, res: Response) => {
  const [dbReady, redisReady, esReady] = await Promise.all([
    checkDatabaseConnection(),
    checkRedisConnection(),
    checkElasticsearchConnection(),
  ]);

  const isReady = dbReady && redisReady;

  res.status(isReady ? 200 : 503).json({
    status: isReady ? 'ready' : 'unhealthy',
    components: {
      database: dbReady ? 'up' : 'down',
      redis: redisReady ? 'up' : 'down',
      elasticsearch: esReady ? 'up' : 'degraded',
    },
    timestamp: new Date().toISOString(),
  });
});
