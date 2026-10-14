import { describe, it, expect } from 'vitest';
import { CsvLeadParser } from '../src/modules/emails/csv-parser';

describe('CSV Lead Parser & Deduplication', () => {
  it('should parse standard CSV with "email" header', () => {
    const csv = `email,first_name,company
alex@example.com,Alex,Acme Corp
sarah@startup.io,Sarah,Tech Inc
alex@example.com,Alex,Duplicate Entry
invalid-email,Bad,Syntax
jordan@reachinbox.ai,Jordan,ReachInbox`;

    const result = CsvLeadParser.parse(csv);

    expect(result.validEmails).toEqual([
      'alex@example.com',
      'sarah@startup.io',
      'jordan@reachinbox.ai',
    ]);
    expect(result.duplicateCount).toBe(1);
    expect(result.invalidRows).toHaveLength(1);
    expect(result.invalidRows[0].raw).toBe('invalid-email');
  });

  it('should support various recognized email headers (Email, recipient_email, to)', () => {
    const csv1 = `Recipient_Email,Name\nclient@domain.com,Client`;
    const res1 = CsvLeadParser.parse(csv1);
    expect(res1.validEmails).toEqual(['client@domain.com']);

    const csv2 = `TO,Subject\nrecipient@corp.org,Hello`;
    const res2 = CsvLeadParser.parse(csv2);
    expect(res2.validEmails).toEqual(['recipient@corp.org']);
  });

  it('should fallback to plain line-by-line emails without headers', () => {
    const plain = `first@company.com\nsecond@company.com\nfirst@company.com\nnotanemail`;
    const result = CsvLeadParser.parse(plain);

    expect(result.validEmails).toEqual(['first@company.com', 'second@company.com']);
    expect(result.duplicateCount).toBe(1);
    expect(result.invalidRows).toHaveLength(1);
  });

  it('should efficiently process a large upload of 1,000+ recipients', () => {
    const rows = ['email'];
    for (let i = 0; i < 1200; i++) {
      rows.push(`lead_${i}@enterprise${i % 10}.com`);
    }
    // Add 100 duplicates
    for (let i = 0; i < 100; i++) {
      rows.push(`lead_${i}@enterprise${i % 10}.com`);
    }

    const start = performance.now();
    const result = CsvLeadParser.parse(rows.join('\n'));
    const elapsed = performance.now() - start;

    expect(result.validEmails).toHaveLength(1200);
    expect(result.duplicateCount).toBe(100);
    expect(elapsed).toBeLessThan(150); // Less than 150ms for 1,300 rows
  });
});
