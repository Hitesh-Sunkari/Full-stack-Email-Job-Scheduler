import { RecoveryService } from '../modules/scheduling/recovery-service';
import { prisma } from '../config/database';
import { closeRedisConnection } from '../config/redis';
import { logger } from '../config/logger';

async function run() {
  try {
    logger.info('Executing explicit database-to-queue recovery CLI...');
    const result = await RecoveryService.reconcile();
    console.log('\n--- Recovery Summary ---');
    console.log(`Reconciled Pending Queue Jobs : ${result.reconciledCount}`);
    console.log(`Un-stuck Stale Processing Jobs: ${result.unStuckCount}`);
    console.log('------------------------\n');
  } catch (error) {
    logger.error({ error }, 'Recovery CLI failed');
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    await closeRedisConnection();
    process.exit(0);
  }
}

run();
