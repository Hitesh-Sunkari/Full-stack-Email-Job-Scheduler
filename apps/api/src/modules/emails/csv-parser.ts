import { parse } from 'csv-parse/sync';
import { LeadParseResult, RECOGNIZED_EMAIL_HEADERS } from '@reachinbox/shared';

// Standard RFC 5322 compatible regex for email format validation
const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

export class CsvLeadParser {
  /**
   * Parses CSV or raw plain text lead content, validates syntax, and de-duplicates emails.
   */
  static parse(content: string): LeadParseResult {
    if (!content || !content.trim()) {
      return {
        validEmails: [],
        invalidRows: [],
        duplicateCount: 0,
        totalRows: 0,
      };
    }

    const trimmed = content.trim();

    // Check if simple line-by-line list of emails without commas
    if (!trimmed.includes(',') && !trimmed.includes('\t') && trimmed.includes('\n')) {
      return this.parseLineByLine(trimmed);
    }

    try {
      const records = parse(content, {
        columns: false,
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true,
      }) as string[][];

      if (records.length === 0) {
        return { validEmails: [], invalidRows: [], duplicateCount: 0, totalRows: 0 };
      }

      // Check header row
      const firstRow = records[0].map((c) => c.toLowerCase().trim().replace(/[\s_-]+/g, '_'));
      let emailColIdx = -1;

      for (let i = 0; i < firstRow.length; i++) {
        if (RECOGNIZED_EMAIL_HEADERS.includes(firstRow[i] as (typeof RECOGNIZED_EMAIL_HEADERS)[number])) {
          emailColIdx = i;
          break;
        }
      }

      let dataRows: string[][];
      let rowOffset = 1;

      if (emailColIdx !== -1) {
        // First row is header
        dataRows = records.slice(1);
        rowOffset = 2; // Line 2 is first data row
      } else {
        // Fallback: check if column 0 of row 0 is an email. If so, treat row 0 as data row without header
        if (EMAIL_REGEX.test(records[0][0])) {
          emailColIdx = 0;
          dataRows = records;
          rowOffset = 1;
        } else {
          // Look for any column in row 0 that matches an email
          const colWithEmail = records[0].findIndex((val) => EMAIL_REGEX.test(val));
          if (colWithEmail !== -1) {
            emailColIdx = colWithEmail;
            dataRows = records;
            rowOffset = 1;
          } else {
            // First row isn't data and header isn't recognized
            throw new Error(
              `No recognized email column header found. Supported headers: ${RECOGNIZED_EMAIL_HEADERS.join(', ')}`
            );
          }
        }
      }

      const seenEmails = new Set<string>();
      const validEmails: string[] = [];
      const invalidRows: { row: number; raw: string; reason: string }[] = [];
      let duplicateCount = 0;

      dataRows.forEach((row, idx) => {
        const rowNumber = idx + rowOffset;
        const rawEmail = row[emailColIdx]?.trim() || '';

        if (!rawEmail) {
          invalidRows.push({
            row: rowNumber,
            raw: row.join(','),
            reason: 'Empty email value',
          });
          return;
        }

        const normalizedEmail = rawEmail.toLowerCase();

        if (!EMAIL_REGEX.test(normalizedEmail) || normalizedEmail.length > 254) {
          invalidRows.push({
            row: rowNumber,
            raw: rawEmail,
            reason: 'Invalid email syntax format',
          });
          return;
        }

        if (seenEmails.has(normalizedEmail)) {
          duplicateCount++;
          return;
        }

        seenEmails.add(normalizedEmail);
        validEmails.push(normalizedEmail);
      });

      return {
        validEmails,
        invalidRows,
        duplicateCount,
        totalRows: dataRows.length,
      };
    } catch (parseErr) {
      // If CSV parser fails due to malformed text, fall back to line-by-line scanner
      return this.parseLineByLine(content);
    }
  }

  /**
   * Fallback line-by-line plain text parser.
   */
  private static parseLineByLine(content: string): LeadParseResult {
    const lines = content.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const seenEmails = new Set<string>();
    const validEmails: string[] = [];
    const invalidRows: { row: number; raw: string; reason: string }[] = [];
    let duplicateCount = 0;

    lines.forEach((line, idx) => {
      const rowNumber = idx + 1;
      const clean = line.replace(/^[,"']+|[,"']+$/g, '').trim().toLowerCase();

      // Skip header if line matches "email"
      if (idx === 0 && RECOGNIZED_EMAIL_HEADERS.includes(clean as (typeof RECOGNIZED_EMAIL_HEADERS)[number])) {
        return;
      }

      if (!EMAIL_REGEX.test(clean) || clean.length > 254) {
        invalidRows.push({
          row: rowNumber,
          raw: line,
          reason: 'Invalid email syntax format',
        });
        return;
      }

      if (seenEmails.has(clean)) {
        duplicateCount++;
        return;
      }

      seenEmails.add(clean);
      validEmails.push(clean);
    });

    return {
      validEmails,
      invalidRows,
      duplicateCount,
      totalRows: lines.length,
    };
  }
}
