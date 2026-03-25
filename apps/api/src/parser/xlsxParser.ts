import ExcelJS from 'exceljs';
import { createHash } from 'crypto';
import { readFile } from 'fs/promises';
import type { ParseResult, RawRow } from './adapter.interface';
import { detectAdapter } from './adapterRegistry';
import { logger } from '../config/logger';

// ─────────────────────────────────────────────────────────────────────────────
// XlsxParser
//
// Entry point for all xlsx parsing. Reads the file, auto-detects the adapter,
// and returns a normalised ParseResult + file metadata.
// ─────────────────────────────────────────────────────────────────────────────

export interface XlsxParseOutput {
  result: ParseResult;
  fileHash: string;
  adapterUsed: string;
  filename: string;
}

export async function parseXlsxFile(filepath: string, filename: string): Promise<XlsxParseOutput> {
  logger.info({ filepath, filename }, '[Parser] Starting xlsx parse');

  // Hash the file for dedup
  const fileBytes = await readFile(filepath);
  const fileHash = createHash('sha256').update(fileBytes).digest('hex');

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(fileBytes);

  // Use the first non-empty worksheet
  let worksheet: ExcelJS.Worksheet | undefined;
  workbook.eachSheet((sheet) => {
    if (!worksheet && sheet.rowCount > 1) {
      worksheet = sheet;
    }
  });

  if (!worksheet) {
    throw new Error('No data found in xlsx file — all sheets are empty');
  }

  logger.info({ sheetName: worksheet.name, rowCount: worksheet.rowCount }, '[Parser] Sheet found');

  // Extract header row
  const headerRow = worksheet.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell({ includeEmpty: false }, (cell) => {
    headers.push(String(cell.value ?? '').trim());
  });

  if (headers.length === 0) {
    throw new Error('Header row is empty');
  }

  // Auto-detect adapter
  const adapter = detectAdapter(headers);
  logger.info({ adapter: adapter.name, headers }, '[Parser] Adapter selected');

  // Extract data rows
  const rawRows: RawRow[] = [];
  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return; // skip header
    const rawRow: RawRow = {};
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const header = headers[colNumber - 1];
      if (!header) return;
      // Unwrap rich text, formulas, hyperlinks
      let value: string | number | Date | null = null;
      if (cell.type === ExcelJS.ValueType.Date) {
        value = cell.value as Date;
      } else if (cell.type === ExcelJS.ValueType.Number) {
        value = cell.value as number;
      } else if (cell.type === ExcelJS.ValueType.Formula) {
        value = cell.result != null ? String(cell.result) : null;
      } else if (cell.type === ExcelJS.ValueType.RichText) {
        const rt = cell.value as ExcelJS.CellRichTextValue;
        value = rt.richText.map((r) => r.text).join('');
      } else {
        value = cell.value != null ? String(cell.value) : null;
      }
      rawRow[header] = value;
    });

    // Skip completely empty rows
    const hasContent = Object.values(rawRow).some((v) => v != null && v !== '');
    if (hasContent) rawRows.push(rawRow);
  });

  logger.info({ rawRows: rawRows.length }, '[Parser] Raw rows extracted');

  const result = await adapter.parse(rawRows, filename);

  logger.info(
    {
      total: result.totalRawRows,
      parsed: result.rows.length,
      errors: result.errors.length,
    },
    '[Parser] Parse complete',
  );

  return { result, fileHash, adapterUsed: adapter.name, filename };
}

// Compute a deterministic hash for a single attendance row (for dedup)
export function computeRowHash(
  studentId: string,
  date: Date,
  firstPunchIn: Date | null,
): string {
  const key = `${studentId}|${date.toISOString().split('T')[0]}|${firstPunchIn?.toISOString() ?? 'null'}`;
  return createHash('sha256').update(key).digest('hex');
}
