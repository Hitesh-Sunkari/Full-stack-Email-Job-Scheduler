import { createApp } from './app';
import { env } from './config/env';
import { logger } from './config/logger';
import { prisma } from './config/database';
import { closeRedisConnection } from './config/redis';
import { initElasticsearchIndex } from './config/elasticsearch';
import { RecoveryService } from './modules/scheduling/recovery-service';

async function bootstrap() {
  logger.info({ nodeEnv: env.NODE_ENV, port: env.PORT }, 'Starting ReachInbox API Server...');

  // Initialize Elasticsearch mappings in background
  initElasticsearchIndex().catch((err) => {
    logger.warn({ err: err.message }, 'Elasticsearch index initialization deferred');
  });

  // Run startup database reconciliation (non-blocking)
  RecoveryService.reconcile().catch((err) => {
    logger.error({ err: err.message }, 'Startup queue reconciliation failed');
  });

  const app = createApp();

  const server = app.listen(env.PORT, () => {
    logger.info(`ReachInbox API Server running at http://localhost:${env.PORT}`);
    logger.info(`Bull Board queue dashboard available at http://localhost:${env.PORT}/admin/queues`);
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Received shutdown signal. Closing HTTP server and connections...');

    server.close(async () => {
      try {
        await prisma.$disconnect();
        await closeRedisConnection();
        logger.info('Closed database and Redis connections successfully');
        process.exit(0);
      } catch (err) {
        logger.error({ err }, 'Error during graceful shutdown');
        process.exit(1);
      }
    });

    // Force exit after 10s if stuck
    setTimeout(() => {
      logger.error('Graceful shutdown timeout exceeded. Forcing exit.');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap().catch((err) => {
  logger.fatal({ err }, 'Failed to start API server');
  process.exit(1);
});
