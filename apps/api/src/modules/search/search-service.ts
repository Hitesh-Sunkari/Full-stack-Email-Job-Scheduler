import { getElasticsearchClient, checkElasticsearchConnection } from '../../config/elasticsearch';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { prisma } from '../../config/database';
import { EmailStatus, SearchEmailsQuery } from '@reachinbox/shared';

export interface EmailSearchDocument {
  emailId: string;
  campaignId: string;
  tenantId: string;
  senderId: string;
  senderEmail: string;
  recipient: string;
  subject: string;
  status: string;
  attemptCount: number;
  scheduledAt: string;
  sentAt: string | null;
  createdAt: string;
}

export class SearchService {
  /**
   * Indexes or updates a scheduled email document in Elasticsearch.
   */
  static async indexEmail(doc: EmailSearchDocument): Promise<void> {
    try {
      const client = getElasticsearchClient();
      await client.index({
        index: env.ELASTICSEARCH_INDEX,
        id: doc.emailId,
        document: doc,
      });
      logger.debug({ emailId: doc.emailId }, 'Indexed email document in Elasticsearch');
    } catch (error) {
      logger.warn({ err: (error as Error).message, emailId: doc.emailId }, 'Failed to index email in Elasticsearch');
    }
  }

  /**
   * Updates only status and sentAt fields in Elasticsearch.
   */
  static async updateStatus(emailId: string, status: EmailStatus, sentAt: Date | null = null): Promise<void> {
    try {
      const client = getElasticsearchClient();
      await client.update({
        index: env.ELASTICSEARCH_INDEX,
        id: emailId,
        doc: {
          status,
          sentAt: sentAt ? sentAt.toISOString() : null,
        },
      });
      logger.debug({ emailId, status }, 'Updated email status in Elasticsearch');
    } catch (error) {
      logger.warn({ err: (error as Error).message, emailId }, 'Failed to update email status in Elasticsearch');
    }
  }

  /**
   * Searches emails with tenant isolation, full-text subject/recipient match, and filters.
   */
  static async searchEmails(tenantId: string, query: SearchEmailsQuery) {
    const isEsAvailable = await checkElasticsearchConnection();

    // If Elasticsearch is not available, provide seamless fallback to PostgreSQL queries
    if (!isEsAvailable) {
      logger.warn('Elasticsearch not available; falling back to PostgreSQL for email search');
      return this.searchPostgresFallback(tenantId, query);
    }

    try {
      const client = getElasticsearchClient();
      const page = query.page || 1;
      const limit = query.limit || 20;
      const from = (page - 1) * limit;

      // Must clauses (always filter by tenant)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mustClauses: any[] = [{ term: { tenantId } }];

      if (query.status) {
        mustClauses.push({ term: { status: query.status } });
      }

      if (query.senderId) {
        mustClauses.push({ term: { senderId: query.senderId } });
      }

      if (query.q) {
        mustClauses.push({
          bool: {
            should: [
              { match_phrase_prefix: { recipient: query.q } },
              { match: { subject: { query: query.q, fuzziness: 'AUTO' } } },
            ],
            minimum_should_match: 1,
          },
        });
      }

      if (query.startDate || query.endDate) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const range: any = {};
        if (query.startDate) range.gte = query.startDate;
        if (query.endDate) range.lte = query.endDate;
        mustClauses.push({ range: { scheduledAt: range } });
      }

      const response = await client.search<EmailSearchDocument>({
        index: env.ELASTICSEARCH_INDEX,
        from,
        size: limit,
        sort: [{ scheduledAt: { order: 'desc' } }],
        query: {
          bool: {
            must: mustClauses,
          },
        },
      });

      const total =
        typeof response.hits.total === 'number'
          ? response.hits.total
          : response.hits.total?.value || 0;

      const items = response.hits.hits.map((hit) => hit._source as EmailSearchDocument);

      return {
        items,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      };
    } catch (error) {
      logger.error({ error }, 'Elasticsearch search error; falling back to PostgreSQL');
      return this.searchPostgresFallback(tenantId, query);
    }
  }

  /**
   * Database-backed fallback search when Elasticsearch is recovering.
   */
  private static async searchPostgresFallback(tenantId: string, query: SearchEmailsQuery) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = { userId: tenantId };

    if (query.status) {
      where.status = query.status;
    }

    if (query.senderId) {
      where.senderId = query.senderId;
    }

    if (query.q) {
      where.OR = [
        { recipient: { contains: query.q, mode: 'insensitive' } },
        { subject: { contains: query.q, mode: 'insensitive' } },
      ];
    }

    if (query.startDate || query.endDate) {
      where.scheduledAt = {};
      if (query.startDate) where.scheduledAt.gte = new Date(query.startDate);
      if (query.endDate) where.scheduledAt.lte = new Date(query.endDate);
    }

    const [total, records] = await Promise.all([
      prisma.scheduledEmail.count({ where }),
      prisma.scheduledEmail.findMany({
        where,
        skip,
        take: limit,
        orderBy: { scheduledAt: 'desc' },
        include: { sender: { select: { senderEmail: true } } },
      }),
    ]);

    const items: EmailSearchDocument[] = records.map((r) => ({
      emailId: r.id,
      campaignId: r.campaignId,
      tenantId: r.userId,
      senderId: r.senderId,
      senderEmail: r.sender.senderEmail,
      recipient: r.recipient,
      subject: r.subject,
      status: r.status,
      attemptCount: r.attemptCount,
      scheduledAt: r.scheduledAt.toISOString(),
      sentAt: r.sentAt ? r.sentAt.toISOString() : null,
      createdAt: r.createdAt.toISOString(),
    }));

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Bulk reindexes all scheduled emails from PostgreSQL into Elasticsearch.
   */
  static async reindexAll(): Promise<{ indexedCount: number }> {
    const client = getElasticsearchClient();
    const batchSize = 500;
    let skip = 0;
    let indexedCount = 0;

    logger.info('Starting full reindex from PostgreSQL to Elasticsearch...');

    while (true) {
      const batch = await prisma.scheduledEmail.findMany({
        skip,
        take: batchSize,
        include: { sender: { select: { senderEmail: true } } },
      });

      if (batch.length === 0) break;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const operations: any[] = [];
      for (const email of batch) {
        operations.push({ index: { _index: env.ELASTICSEARCH_INDEX, _id: email.id } });
        operations.push({
          emailId: email.id,
          campaignId: email.campaignId,
          tenantId: email.userId,
          senderId: email.senderId,
          senderEmail: email.sender.senderEmail,
          recipient: email.recipient,
          subject: email.subject,
          status: email.status,
          attemptCount: email.attemptCount,
          scheduledAt: email.scheduledAt.toISOString(),
          sentAt: email.sentAt ? email.sentAt.toISOString() : null,
          createdAt: email.createdAt.toISOString(),
        });
      }

      const bulkResponse = await client.bulk({ refresh: true, operations });
      if (bulkResponse.errors) {
        logger.error('Errors occurred during bulk indexing');
      }

      indexedCount += batch.length;
      skip += batchSize;
      logger.info({ indexedCount }, 'Reindexed batch to Elasticsearch');
    }

    logger.info({ totalIndexed: indexedCount }, 'Completed reindexing to Elasticsearch');
    return { indexedCount };
  }
}
