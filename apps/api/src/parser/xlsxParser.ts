import ExcelJS from 'exceljs';
const JSZip = require('jszip');
import { createHash } from 'crypto';
import { readFile } from 'fs/promises';
import type { ParseResult, RawRow } from './adapter.interface';
import { detectAdapter } from './adapterRegistry';
import { logger } from '../config/logger';

export interface XlsxParseOutput {
  result: ParseResult;
  fileHash: string;
  adapterUsed: string;
  filename: string;
}

async function stripDrawings(fileBytes: Buffer): Promise<Buffer> {
  const zip = await JSZip.loadAsync(fileBytes);
  const names: string[] = Object.keys(zip.files);

  names.filter((n) => n.startsWith('xl/drawings/')).forEach((n) => zip.remove(n));

  const sheetFiles = names.filter((n) => /xl\/worksheets\/sheet\d+\.xml$/.test(n));
  await Promise.all(
    sheetFiles.map(async (sheetFile) => {
      const content: string = await zip.files[sheetFile].async('text');
      if (content.includes('drawing')) {
        zip.file(sheetFile, content.replace(/<drawing\s[^>]*\/>/g, ''));
      }
    }),
  );

  const relFiles = names.filter((n) => n.includes('worksheets/_rels') && n.endsWith('.rels'));
  await Promise.all(
    relFiles.map(async (relFile) => {
      const content: string = await zip.files[relFile].async('text');
      if (content.includes('/drawing')) {
        zip.file(relFile, content.replace(/<Relationship[^>]*\/drawing[^>]*\/>/g, ''));
      }
    }),
  );

  const output = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  // THE FIX: Create a fresh Buffer from a new Uint8Array to reset the internal prototype
  return Buffer.from(new Uint8Array(output));
}

export async function parseXlsxFile(filepath: string, filename: string): Promise<XlsxParseOutput> {
  logger.info({ filepath, filename }, '[Parser] Starting xlsx parse');

  const fileBytes = await readFile(filepath);
  const fileHash = createHash('sha256').update(fileBytes).digest('hex');
  const cleanBytes = await stripDrawings(fileBytes);

  const workbook = new ExcelJS.Workbook();
  // THE FIX: Explicit cast to 'any' before 'Buffer' to break the type-check loop
  await workbook.xlsx.load(Buffer.from(new Uint8Array(cleanBytes)) as any);

  const worksheets: ExcelJS.Worksheet[] = [];
  workbook.eachSheet((sheet) => { if (sheet.rowCount > 1) worksheets.push(sheet); });

  if (worksheets.length === 0) throw new Error('No data found in xlsx file');

  const firstSheet = worksheets[0];
  const firstHeaders: string[] = [];
  firstSheet.getRow(1).eachCell({ includeEmpty: false }, (cell) => {
    firstHeaders.push(String(cell.value ?? '').trim());
  });

  const adapter = detectAdapter(firstHeaders);

  function extractRows(worksheet: ExcelJS.Worksheet): RawRow[] {
    const headerRow = worksheet.getRow(1);
    const headerMap = new Map<number, string>();
    headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const name = String(cell.value ?? '').trim();
      if (name) headerMap.set(colNumber, name);
    });

    const rawRows: RawRow[] = [];
    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return;
      const rawRow: RawRow = {};
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        const header = headerMap.get(colNumber);
        if (!header) return;
        let value: any = null;
        if (cell.type === ExcelJS.ValueType.Date) value = cell.value;
        else if (cell.type === ExcelJS.ValueType.Number) value = cell.value;
        else if (cell.type === ExcelJS.ValueType.Formula) value = cell.result;
        else value = cell.value != null ? String(cell.value) : null;
        rawRow[header] = value;
      });
      if (Object.values(rawRow).some(v => v != null)) rawRows.push(rawRow);
    });
    return rawRows;
  }

  const mergedResult: ParseResult = { rows: [], errors: [], totalRawRows: 0 };
  for (const worksheet of worksheets) {
    const rawRows = extractRows(worksheet);
    if (rawRows.length === 0) continue;
    const sheetResult = await adapter.parse(rawRows, `${worksheet.name}|||${filename}`);
    mergedResult.rows.push(...sheetResult.rows);
    mergedResult.errors.push(...sheetResult.errors);
    mergedResult.totalRawRows += sheetResult.totalRawRows;
  }

  return { result: mergedResult, fileHash, adapterUsed: adapter.name, filename };
}

export function computeRowHash(
  studentId: string,
  date: Date,
  firstPunchIn: Date | null,
): string {
  const dateStr = date instanceof Date ? date.toISOString().split('T')[0] : String(date);
  const punchStr = firstPunchIn instanceof Date ? firstPunchIn.toISOString() : 'null';
  const key = `${studentId}|${dateStr}|${punchStr}`;
  return createHash('sha256').update(key).digest('hex');
}