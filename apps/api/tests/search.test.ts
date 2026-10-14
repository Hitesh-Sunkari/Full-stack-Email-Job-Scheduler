import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SearchService } from '../src/modules/search/search-service';
import * as esConfig from '../src/config/elasticsearch';
import { prisma } from '../src/config/database';
import { EmailStatus } from '@reachinbox/shared';

describe('SearchService & Tenant Isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should enforce tenant isolation when querying Elasticsearch', async () => {
    const mockSearch = vi.fn().mockResolvedValue({
      hits: {
        total: { value: 1 },
        hits: [
          {
            _source: {
              emailId: 'email-1',
              campaignId: 'camp-1',
              tenantId: 'tenant-user-1',
              senderId: 'sender-1',
              senderEmail: 'sales@reachinbox.ai',
              recipient: 'lead@example.com',
              subject: 'Exciting Partnership',
              status: EmailStatus.SCHEDULED,
              attemptCount: 0,
              scheduledAt: new Date().toISOString(),
              sentAt: null,
              createdAt: new Date().toISOString(),
            },
          },
        ],
      },
    });

    vi.spyOn(esConfig, 'checkElasticsearchConnection').mockResolvedValue(true);
    vi.spyOn(esConfig, 'getElasticsearchClient').mockReturnValue({
      search: mockSearch,
    } as any);

    const result = await SearchService.searchEmails('tenant-user-1', {
      q: 'Partnership',
      page: 1,
      limit: 10,
    });

    expect(mockSearch).toHaveBeenCalled();
    const searchCallArg = mockSearch.mock.calls[0][0];

    // Verify tenantId filter is strictly included in the must clauses
    const mustClauses = searchCallArg.query.bool.must;
    expect(mustClauses).toEqual(
      expect.arrayContaining([{ term: { tenantId: 'tenant-user-1' } }])
    );
    expect(result.items).toHaveLength(1);
    expect(result.items[0].emailId).toBe('email-1');
  });

  it('should fallback seamlessly to PostgreSQL if Elasticsearch is offline', async () => {
    vi.spyOn(esConfig, 'checkElasticsearchConnection').mockResolvedValue(false);

    vi.spyOn(prisma.scheduledEmail, 'count').mockResolvedValue(1);
    vi.spyOn(prisma.scheduledEmail, 'findMany').mockResolvedValue([
      {
        id: 'email-fallback-1',
        campaignId: 'camp-1',
        userId: 'tenant-user-2',
        senderId: 'sender-1',
        recipient: 'fallback.lead@domain.com',
        subject: 'Fallback Subject',
        status: EmailStatus.SENT as any,
        attemptCount: 1,
        scheduledAt: new Date(),
        sentAt: new Date(),
        createdAt: new Date(),
        sender: { senderEmail: 'sender@domain.com' },
      } as any,
    ]);

    const result = await SearchService.searchEmails('tenant-user-2', {
      q: 'fallback',
      page: 1,
      limit: 10,
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].emailId).toBe('email-fallback-1');
    expect(result.items[0].tenantId).toBe('tenant-user-2');
  });
});
