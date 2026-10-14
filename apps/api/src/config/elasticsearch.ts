import { Client } from '@elastic/elasticsearch';
import { env } from './env';
import { logger } from './logger';

let esClient: Client | null = null;

export function getElasticsearchClient(): Client {
  if (!esClient) {
    const clientOptions: ConstructorParameters<typeof Client>[0] = {
      node: env.ELASTICSEARCH_URL,
      maxRetries: 3,
      requestTimeout: 10000,
    };

    if (env.ELASTICSEARCH_USERNAME && env.ELASTICSEARCH_PASSWORD) {
      clientOptions.auth = {
        username: env.ELASTICSEARCH_USERNAME,
        password: env.ELASTICSEARCH_PASSWORD,
      };
    }

    esClient = new Client(clientOptions);
  }

  return esClient;
}

export async function checkElasticsearchConnection(): Promise<boolean> {
  try {
    const client = getElasticsearchClient();
    const health = await client.cluster.health({});
    return ['green', 'yellow'].includes(health.status);
  } catch (error) {
    logger.warn({ err: (error as Error).message }, 'Elasticsearch is not reachable');
    return false;
  }
}

export async function initElasticsearchIndex(): Promise<void> {
  const client = getElasticsearchClient();
  const indexName = env.ELASTICSEARCH_INDEX;

  try {
    const exists = await client.indices.exists({ index: indexName });
    if (!exists) {
      logger.info({ indexName }, 'Creating Elasticsearch index with custom mappings');
      await client.indices.create({
        index: indexName,
        mappings: {
          properties: {
            emailId: { type: 'keyword' },
            campaignId: { type: 'keyword' },
            tenantId: { type: 'keyword' },
            senderId: { type: 'keyword' },
            senderEmail: { type: 'keyword' },
            recipient: {
              type: 'text',
              fields: {
                keyword: { type: 'keyword', ignore_above: 256 },
              },
            },
            subject: {
              type: 'text',
              analyzer: 'standard',
              fields: {
                keyword: { type: 'keyword', ignore_above: 512 },
              },
            },
            status: { type: 'keyword' },
            attemptCount: { type: 'integer' },
            scheduledAt: { type: 'date' },
            sentAt: { type: 'date' },
            createdAt: { type: 'date' },
          },
        },
      });
      logger.info({ indexName }, 'Elasticsearch index created successfully');
    }
  } catch (error) {
    logger.error({ error, indexName }, 'Failed to initialize Elasticsearch index');
  }
}
