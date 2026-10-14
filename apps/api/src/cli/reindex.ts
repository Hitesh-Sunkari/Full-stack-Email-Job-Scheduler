import { SearchService } from '../modules/search/search-service';
import { prisma } from '../config/database';
import { logger } from '../config/logger';

async function run() {
  try {
    logger.info('Executing Elasticsearch full reindex CLI...');
    const result = await SearchService.reindexAll();
    console.log('\n--- Reindex Summary ---');
    console.log(`Total Documents Indexed into Elasticsearch: ${result.indexedCount}`);
    console.log('-----------------------\n');
  } catch (error) {
    logger.error({ error }, 'Reindex CLI failed');
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    process.exit(0);
  }
}

run();
