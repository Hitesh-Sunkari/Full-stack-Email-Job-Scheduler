import Papa from 'papaparse';
import { LeadParseResult } from '../types/api';

const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

const RECOGNIZED_HEADERS = [
  'email',
  'email_address',
  'emailaddress',
  'recipient',
  'recipient_email',
  'to',
  'to_email',
  'contact_email',
];

export function parseLeadFile(content: string): LeadParseResult {
  if (!content || !content.trim()) {
    return { validEmails: [], invalidRows: [], duplicateCount: 0, totalRows: 0 };
  }

  const trimmed = content.trim();

  // Handle simple line-by-line list
  if (!trimmed.includes(',') && !trimmed.includes('\t') && trimmed.includes('\n')) {
    const lines = trimmed.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const seen = new Set<string>();
    const valid: string[] = [];
    const invalid: { row: number; raw: string; reason: string }[] = [];
    let dups = 0;

    lines.forEach((line, idx) => {
      const clean = line.replace(/^[,"']+|[,"']+$/g, '').trim().toLowerCase();
      if (idx === 0 && RECOGNIZED_HEADERS.includes(clean)) return;

      if (!EMAIL_REGEX.test(clean) || clean.length > 254) {
        invalid.push({ row: idx + 1, raw: line, reason: 'Invalid email format' });
        return;
      }
      if (seen.has(clean)) {
        dups++;
        return;
      }
      seen.add(clean);
      valid.push(clean);
    });

    return { validEmails: valid, invalidRows: invalid, duplicateCount: dups, totalRows: lines.length };
  }

  const parsed = Papa.parse<string[]>(content, {
    skipEmptyLines: true,
  });

  const records = parsed.data;
  if (!records || records.length === 0) {
    return { validEmails: [], invalidRows: [], duplicateCount: 0, totalRows: 0 };
  }

  // Detect header index
  const headerRow = records[0].map((c) => String(c).toLowerCase().trim().replace(/[\s_-]+/g, '_'));
  let emailColIdx = -1;

  for (let i = 0; i < headerRow.length; i++) {
    if (RECOGNIZED_HEADERS.includes(headerRow[i])) {
      emailColIdx = i;
      break;
    }
  }

  let dataRows: string[][];
  let rowOffset = 1;

  if (emailColIdx !== -1) {
    dataRows = records.slice(1);
    rowOffset = 2;
  } else {
    // Check if first column is an email
    if (EMAIL_REGEX.test(records[0][0])) {
      emailColIdx = 0;
      dataRows = records;
      rowOffset = 1;
    } else {
      const colWithEmail = records[0].findIndex((val) => EMAIL_REGEX.test(String(val)));
      if (colWithEmail !== -1) {
        emailColIdx = colWithEmail;
        dataRows = records;
        rowOffset = 1;
      } else {
        emailColIdx = 0;
        dataRows = records.slice(1);
        rowOffset = 2;
      }
    }
  }

  const seen = new Set<string>();
  const valid: string[] = [];
  const invalid: { row: number; raw: string; reason: string }[] = [];
  let dups = 0;

  dataRows.forEach((row, idx) => {
    const rowNum = idx + rowOffset;
    const rawVal = row[emailColIdx]?.trim() || '';

    if (!rawVal) {
      invalid.push({ row: rowNum, raw: row.join(','), reason: 'Empty email value' });
      return;
    }

    const clean = rawVal.toLowerCase();

    if (!EMAIL_REGEX.test(clean) || clean.length > 254) {
      invalid.push({ row: rowNum, raw: rawVal, reason: 'Invalid email syntax format' });
      return;
    }

    if (seen.has(clean)) {
      dups++;
      return;
    }

    seen.add(clean);
    valid.push(clean);
  });

  return {
    validEmails: valid,
    invalidRows: invalid,
    duplicateCount: dups,
    totalRows: dataRows.length,
  };
}
