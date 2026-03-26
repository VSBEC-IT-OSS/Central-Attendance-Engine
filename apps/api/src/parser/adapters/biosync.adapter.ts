import type {
  IAttendanceAdapter,
  NormalisedRow,
  ParseResult,
  RawRow,
  RowError,
} from '../adapter.interface';
import { AttendanceStatus } from '@attendance-engine/schema';

// ─────────────────────────────────────────────────────────────────────────────
// BioSyncAdapter
//
// Handles the xlsx format produced by the BioSync aggregator server.
//
// File format characteristics:
//   - One sheet per class, sheet name encodes year + dept + section
//     e.g. "I IT A", "III IT B", "IV CSE C"
//   - NO date column — date is extracted from the filename (DD-MM-YYYY.xlsx)
//   - NO department/class/section columns — parsed from sheet name
//   - Columns: SNo. | Emp Code | (merged) | Name | Last Punch | (merged) |
//              Direction | Punch Records | (merged) | Status
//
// Department filter: set BIOSYNC_DEPARTMENTS env var to comma-separated list
// e.g. "IT" to process only IT sheets. Leave unset to process all departments.
// ─────────────────────────────────────────────────────────────────────────────

// Which departments to import. Empty = all departments.
const DEPT_FILTER: string[] = process.env.BIOSYNC_DEPARTMENTS
  ? process.env.BIOSYNC_DEPARTMENTS.split(',').map((d) => d.trim().toUpperCase())
  : [];

const STATUS_MAP: Record<string, AttendanceStatus> = {
  present: 'PRESENT',
  p: 'PRESENT',
  '1': 'PRESENT',
  absent: 'ABSENT',
  a: 'ABSENT',
  '0': 'ABSENT',
  late: 'LATE',
  l: 'LATE',
  half_day: 'HALF_DAY',
  halfday: 'HALF_DAY',
  half: 'HALF_DAY',
  h: 'HALF_DAY',
  holiday: 'HOLIDAY',
  excused: 'EXCUSED',
  od: 'EXCUSED',
  leave: 'EXCUSED',
  e: 'EXCUSED',
};

// ── Sheet name parser ─────────────────────────────────────────────────────────
// Handles: "I IT A", "III AIML B", "IV CSE C", "II AIDS A", "I ECE F" etc.
interface SheetMeta {
  year: string;        // "I", "II", "III", "IV"
  department: string;  // "IT", "CSE", "ECE", etc.
  section: string;     // "A", "B", "C", etc.
}

function parseSheetName(sheetName: string): SheetMeta | null {
  const parts = sheetName.trim().split(/\s+/);
  if (parts.length < 2) return null;

  const romanNumerals = ['I', 'II', 'III', 'IV', 'V'];
  const year = parts[0].toUpperCase();
  if (!romanNumerals.includes(year)) return null;

  // Last part is section (single letter), middle parts are department name
  const lastPart = parts[parts.length - 1].toUpperCase();
  const isSection = /^[A-Z]$/.test(lastPart) && parts.length >= 3;

  const department = isSection
    ? parts.slice(1, -1).join(' ').toUpperCase()
    : parts.slice(1).join(' ').toUpperCase();
  const section = isSection ? lastPart : 'A';

  return { year, department, section };
}

// ── Filename date parser ──────────────────────────────────────────────────────
// Handles: "09-03-2026.xlsx", "2026-03-09.xlsx", "09_03_2026.xlsx"
function parseDateFromFilename(filename: string): Date | null {
  // Strip path and extension
  const base = filename.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '');

  // Try DD-MM-YYYY or DD_MM_YYYY
  const dmyMatch = base.match(/(\d{1,2})[-_](\d{1,2})[-_](\d{4})/);
  if (dmyMatch) {
    const [, d, m, y] = dmyMatch;
    const date = new Date(`${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}T00:00:00.000Z`);
    if (!isNaN(date.getTime())) return date;
  }

  // Try YYYY-MM-DD
  const ymdMatch = base.match(/(\d{4})[-_](\d{1,2})[-_](\d{1,2})/);
  if (ymdMatch) {
    const [, y, m, d] = ymdMatch;
    const date = new Date(`${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}T00:00:00.000Z`);
    if (!isNaN(date.getTime())) return date;
  }

  return null;
}

// ── Punch time parser ─────────────────────────────────────────────────────────
// "09:12,13:07," → first = 09:12, last = 13:07
function parsePunchRecords(
  punchRecords: string,
  baseDate: Date,
): { first: Date | null; last: Date | null } {
  if (!punchRecords) return { first: null, last: null };

  const times = punchRecords
    .split(',')
    .map((t) => t.trim())
    .filter((t) => /^\d{1,2}:\d{2}$/.test(t));

  if (times.length === 0) return { first: null, last: null };

  const toDate = (timeStr: string): Date => {
    const [h, m] = timeStr.split(':').map(Number);
    const d = new Date(baseDate);
    d.setUTCHours(h, m, 0, 0);
    return d;
  };

  return {
    first: toDate(times[0]),
    last: toDate(times[times.length - 1]),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// BioSyncAdapter — multi-sheet aware
//
// The xlsxParser calls parse() once per sheet (after this change).
// Each call receives rows from one sheet + the sheet name via filename param
// encoded as "SHEETNAME|||FILENAME".
// ─────────────────────────────────────────────────────────────────────────────

export class BioSyncAdapter implements IAttendanceAdapter {
  readonly name = 'BioSyncAdapter';

  canHandle(headers: string[]): boolean {
    const normalised = headers.map((h) => h.toLowerCase().trim().replace(/\s+/g, '_'));
    // BioSync files have "emp_code" and "punch_records" — distinctive enough
    const hasEmpCode = normalised.some((h) => h.includes('emp') && h.includes('code'));
    const hasPunchRecords = normalised.some((h) => h.includes('punch') && h.includes('record'));
    return hasEmpCode && hasPunchRecords;
  }

  async parse(rows: RawRow[], filenameWithSheet: string): Promise<ParseResult> {
    if (rows.length === 0) return { rows: [], errors: [], totalRawRows: 0 };

    // Decode "SHEETNAME|||FILENAME" passed by the multi-sheet parser
    const separatorIdx = filenameWithSheet.indexOf('|||');
    const sheetName = separatorIdx !== -1
      ? filenameWithSheet.slice(0, separatorIdx)
      : '';
    const filename = separatorIdx !== -1
      ? filenameWithSheet.slice(separatorIdx + 3)
      : filenameWithSheet;

    // Parse sheet metadata
    const sheetMeta = parseSheetName(sheetName);
    if (!sheetMeta) {
      return { rows: [], errors: [], totalRawRows: rows.length };
    }

    // Apply department filter
    if (DEPT_FILTER.length > 0 && !DEPT_FILTER.includes(sheetMeta.department)) {
      return { rows: [], errors: [], totalRawRows: rows.length };
    }

    // Parse date from filename
    const date = parseDateFromFilename(filename);
    if (!date) {
      return {
        rows: [],
        errors: [{
          rowNumber: 0,
          rawData: {},
          errorCode: 'INVALID_FILENAME_DATE',
          errorMessage: `Cannot extract date from filename: "${filename}". Expected format: DD-MM-YYYY.xlsx`,
        }],
        totalRawRows: rows.length,
      };
    }

    // Build column map from first row headers
    const headers = Object.keys(rows[0]);
    const empCodeCol = headers.find((h) => /emp.?code/i.test(h));
    const nameCol = headers.find((h) => /^name$/i.test(h));
    const punchRecordsCol = headers.find((h) => /punch.?record/i.test(h));
    const statusCol = headers.find((h) => /^status$/i.test(h));

    // Strip trailing empty rows and BioSync footer.
    // Stop at the first all-empty row (real student rows always have an emp code)
    // or when we hit a known footer marker line.
    const FOOTER_MARKERS = ['biosync', 'class :', 'report date :', 'generated :', 'present :', 'absent :', 'attendance %'];
    const dataRows: RawRow[] = [];
    for (const raw of rows) {
      const values = Object.values(raw);
      const allEmpty = values.every((v) => v == null || String(v).trim() === '');
      if (allEmpty) break;
      const firstVal = String(values[0] ?? '').trim().toLowerCase();
      if (FOOTER_MARKERS.some((m) => firstVal.startsWith(m))) break;
      dataRows.push(raw);
    }

    const normalised: NormalisedRow[] = [];
    const errors: RowError[] = [];

    // Carry-forward state for merged cells.
    // BioSync exports merge the Emp Code and Name cells vertically across
    // all punch-record rows belonging to the same student. ExcelJS only
    // populates the top cell of a merged range; subsequent cells in the
    // merge are null. We remember the last non-empty value so every
    // punch-record row is attributed to the correct student.
    let lastEmpCode = '';
    let lastName = '';

    dataRows.forEach((raw, idx) => {
      const rowNumber = idx + 2;
      try {
        const empCodeRaw = empCodeCol ? String(raw[empCodeCol] ?? '').trim() : '';
        const nameRaw    = nameCol    ? String(raw[nameCol]    ?? '').trim() : '';

        // Update carry-forward only when the cell actually has a value
        if (empCodeRaw) lastEmpCode = empCodeRaw;
        if (nameRaw)    lastName    = nameRaw;

        const studentId = lastEmpCode;
        if (!studentId) {
          errors.push({
            rowNumber,
            rawData: raw as Record<string, unknown>,
            errorCode: 'MISSING_EMP_CODE',
            errorMessage: `Row ${rowNumber}: missing Emp Code`,
          });
          return;
        }

        const studentName = lastName || 'Unknown';
        const punchRaw = punchRecordsCol ? String(raw[punchRecordsCol] ?? '').trim() : '';
        const statusRaw = statusCol ? String(raw[statusCol] ?? '').trim() : '';

        const { first: firstPunchIn, last: lastPunchOut } = parsePunchRecords(punchRaw, date);
        const status = this.parseStatus(statusRaw, firstPunchIn);

        normalised.push({
          studentId,
          studentName: studentName || 'Unknown',
          rollNumber: studentId,
          department: sheetMeta.department,
          className: sheetMeta.year,
          section: sheetMeta.section,
          date,
          firstPunchIn,
          lastPunchOut,
          status,
        });
      } catch (err) {
        errors.push({
          rowNumber,
          rawData: raw as Record<string, unknown>,
          errorCode: 'PARSE_ERROR',
          errorMessage: (err as Error).message,
        });
      }
    });

    return { rows: normalised, errors, totalRawRows: dataRows.length };
  }

  private parseStatus(raw: string, firstPunchIn: Date | null): AttendanceStatus {
    if (raw) {
      const key = raw.toLowerCase().trim().replace(/[^a-z0-9_]/g, '');
      if (STATUS_MAP[key]) return STATUS_MAP[key];
    }
    return firstPunchIn ? 'PRESENT' : 'ABSENT';
  }
}
