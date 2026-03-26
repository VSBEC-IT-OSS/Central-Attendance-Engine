import ExcelJS from 'exceljs';
// JSZip is a direct dependency of ExcelJS — always available
// eslint-disable-next-line @typescript-eslint/no-require-imports
const JSZip = require('jszip');
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
// Processes ALL sheets and merges results (required for multi-sheet formats
// like BioSync where each sheet is a separate class).
// ─────────────────────────────────────────────────────────────────────────────

export interface XlsxParseOutput {
  result: ParseResult;
  fileHash: string;
  adapterUsed: string;
  filename: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// stripDrawings
//
// BioSync (and some other xlsx generators) embed drawings/images in every
// sheet using the default XML namespace instead of the 'xdr:' prefix that
// ExcelJS expects. ExcelJS's DrawingXform never initialises model.anchors for
// those nodes, and crashes with:
//   "Cannot read properties of undefined (reading 'anchors')"
//
// We only need cell data — not images — so the safest fix is to strip all
// drawing artefacts from the zip in memory before handing the buffer to
// ExcelJS. JSZip is already a direct dependency of ExcelJS so no extra
// package is needed.
// ─────────────────────────────────────────────────────────────────────────────
async function stripDrawings(fileBytes: Buffer): Promise<Buffer> {
  const zip = await JSZip.loadAsync(fileBytes);
  const names: string[] = Object.keys(zip.files);

  // 1. Remove all xl/drawings/* files (the malformed XMLs)
  names
    .filter((n) => n.startsWith('xl/drawings/'))
    .forEach((n) => zip.remove(n));

  // 2. Remove <drawing .../> elements from every worksheet XML so that
  //    ExcelJS does not try to resolve a drawing rId that no longer exists
  const sheetFiles = names.filter((n) => /xl\/worksheets\/sheet\d+\.xml$/.test(n));
  await Promise.all(
    sheetFiles.map(async (sheetFile) => {
      const content: string = await zip.files[sheetFile].async('text');
      if (content.includes('drawing')) {
        zip.file(sheetFile, content.replace(/<drawing\s[^>]*\/>/g, ''));
      }
    }),
  );

  // 3. Remove drawing <Relationship> entries from worksheet _rels files
  const relFiles = names.filter(
    (n) => n.includes('worksheets/_rels') && n.endsWith('.rels'),
  );
  await Promise.all(
    relFiles.map(async (relFile) => {
      const content: string = await zip.files[relFile].async('text');
      if (content.includes('/drawing')) {
        zip.file(relFile, content.replace(/<Relationship[^>]*\/drawing[^>]*\/>/g, ''));
      }
    }),
  );

  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }) as Promise<Buffer>;
}

export async function parseXlsxFile(filepath: string, filename: string): Promise<XlsxParseOutput> {
  logger.info({ filepath, filename }, '[Parser] Starting xlsx parse');

  // Hash the original file for dedup (before any in-memory stripping)
  const fileBytes = await readFile(filepath);
  const fileHash = createHash('sha256').update(fileBytes).digest('hex');

  // Strip embedded drawings before loading — see stripDrawings() above
  const cleanBytes = await stripDrawings(fileBytes);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(cleanBytes);

  // Collect all non-empty worksheets
  const worksheets: ExcelJS.Worksheet[] = [];
  workbook.eachSheet((sheet) => {
    if (sheet.rowCount > 1) worksheets.push(sheet);
  });

  if (worksheets.length === 0) {
    throw new Error('No data found in xlsx file — all sheets are empty');
  }

  logger.info({ sheetCount: worksheets.length }, '[Parser] Sheets found');

  // Detect adapter from first sheet headers
  const firstSheet = worksheets[0];
  const firstHeaderRow = firstSheet.getRow(1);
  const firstHeaders: string[] = [];
  firstHeaderRow.eachCell({ includeEmpty: false }, (cell) => {
    firstHeaders.push(String(cell.value ?? '').trim());
  });

  if (firstHeaders.length === 0) throw new Error('Header row is empty');

  const adapter = detectAdapter(firstHeaders);
  logger.info({ adapter: adapter.name, sheetCount: worksheets.length }, '[Parser] Adapter selected');

  // Helper: extract raw rows from a worksheet
  function extractRows(worksheet: ExcelJS.Worksheet): RawRow[] {
    const headerRow = worksheet.getRow(1);

    // Map column number → header name.
    // Using a Map (colNumber → name) instead of a compact array is critical
    // for BioSync-style files where the header row contains merged/empty cells
    // (e.g. cols 3, 6, 9 are blank spacers). A compact array shifts every
    // subsequent column left by one, so "Punch Records" in col 8 would land
    // at headers[7] but be looked up as headers[colNumber-1] = headers[7]
    // only if all 7 preceding headers are non-empty — which they are not.
    // Keying by actual column number avoids this entirely.
    const headerMap = new Map<number, string>();
    headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const name = String(cell.value ?? '').trim();
      if (name) headerMap.set(colNumber, name);
    });

    // Keep a flat list for adapter detection (order-preserved, compact)
    const headers: string[] = Array.from(headerMap.values());

    const rawRows: RawRow[] = [];
    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return;
      const rawRow: RawRow = {};
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        const header = headerMap.get(colNumber);
        if (!header) return;
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
      const hasContent = Object.values(rawRow).some((v) => v != null && v !== '');
      if (hasContent) rawRows.push(rawRow);
    });

    return rawRows;
  }

  // Process each sheet and merge results
  const mergedResult: ParseResult = {
    rows: [],
    errors: [],
    totalRawRows: 0,
  };

  for (const worksheet of worksheets) {
    const rawRows = extractRows(worksheet);
    if (rawRows.length === 0) continue;

    // Encode sheet name into filename so adapter can access it: "SHEETNAME|||FILENAME"
    const sheetFilename = `${worksheet.name}|||${filename}`;
    const sheetResult = await adapter.parse(rawRows, sheetFilename);

    mergedResult.rows.push(...sheetResult.rows);
    mergedResult.errors.push(...sheetResult.errors);
    mergedResult.totalRawRows += sheetResult.totalRawRows;
  }

  logger.info(
    {
      total: mergedResult.totalRawRows,
      parsed: mergedResult.rows.length,
      errors: mergedResult.errors.length,
    },
    '[Parser] Parse complete',
  );

  return { result: mergedResult, fileHash, adapterUsed: adapter.name, filename };
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
