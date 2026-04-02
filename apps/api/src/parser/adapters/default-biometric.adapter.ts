import { AttendanceStatus } from '@attendance-engine/schema';
import { parseISO, isValid, parse as parseFns, format } from 'date-fns';
// FIXED: Ensure the import case matches your filename (usually adapter.interface.ts)
import type {
  IAttendanceAdapter,
  NormalisedRow,
  ParseResult,
  RawRow,
  RowError,
} from '../adapter.interface';

const COLUMN_MAP: Record<string, string[]> = {
  studentId:    ['student_id', 'studentid', 'id', 'emp_id', 'empid'],
  studentName:  ['student_name', 'name', 'full_name', 'fullname', 'student name'],
  rollNumber:   ['roll_no', 'roll', 'roll_number', 'rollno', 'enrollment', 'reg_no'],
  department:   ['department', 'dept', 'branch'],
  className:    ['class', 'year', 'batch', 'programme'],
  section:      ['section', 'sec', 'group', 'div'],
  date:         ['date', 'attendance_date', 'att_date'],
  firstPunchIn: ['punch_in', 'punchin', 'in_time', 'first_in', 'time_in'],
  lastPunchOut: ['punch_out', 'punchout', 'out_time', 'last_out', 'time_out'],
  status:       ['status', 'attendance', 'att_status', 'present_absent'],
};

const STATUS_MAP: Record<string, AttendanceStatus> = {
  p: 'PRESENT', present: 'PRESENT', '1': 'PRESENT',
  a: 'ABSENT',  absent: 'ABSENT',   '0': 'ABSENT',
  l: 'LATE',    late: 'LATE',
  h: 'HALF_DAY', half: 'HALF_DAY', half_day: 'HALF_DAY', halfday: 'HALF_DAY',
  holiday: 'HOLIDAY',
  e: 'EXCUSED', excused: 'EXCUSED', od: 'EXCUSED', leave: 'EXCUSED',
};

export class DefaultBiometricAdapter implements IAttendanceAdapter {
  readonly name = 'DefaultBiometricAdapter';

  canHandle(headers: string[]): boolean {
    const normalised = headers.map((h) => h.toLowerCase().trim().replace(/\s+/g, '_'));
    const hasId = COLUMN_MAP.studentId.some((k) => normalised.includes(k));
    const hasDate = COLUMN_MAP.date.some((k) => normalised.includes(k));
    return hasId && hasDate;
  }

  async parse(rows: RawRow[], _filename: string): Promise<ParseResult> {
    if (rows.length === 0) return { rows: [], errors: [], totalRawRows: 0 };

    const headers = Object.keys(rows[0]).map((h) => h.toLowerCase().trim().replace(/\s+/g, '_'));
    const fieldMap = this.buildFieldMap(headers, Object.keys(rows[0]));

    const normalised: NormalisedRow[] = [];
    const errors: RowError[] = [];

    rows.forEach((rawRow, idx) => {
      const rowNumber = idx + 2; 
      try {
        const row = this.normaliseRow(rawRow, fieldMap, rowNumber);
        if (row) normalised.push(row);
      } catch (err) {
        const e = err as Error;
        errors.push({
          rowNumber,
          rawData: rawRow as Record<string, unknown>,
          errorCode: 'PARSE_ERROR',
          errorMessage: e.message,
        });
      }
    });

    return { rows: normalised, errors, totalRawRows: rows.length };
  }

  private buildFieldMap(normalisedHeaders: string[], originalHeaders: string[]): Record<string, string> {
    const map: Record<string, string> = {};
    for (const [canonical, aliases] of Object.entries(COLUMN_MAP)) {
      const idx = normalisedHeaders.findIndex((h) => aliases.includes(h));
      if (idx !== -1) map[canonical] = originalHeaders[idx];
    }
    return map;
  }

  private normaliseRow(raw: RawRow, fieldMap: Record<string, string>, rowNumber: number): NormalisedRow | null {
    const get = (field: string): string => {
      const key = fieldMap[field];
      if (!key) return '';
      const val = raw[key];
      return val == null ? '' : String(val).trim();
    };

    const studentId = get('studentId');
    const date = this.parseDate(get('date'));

    if (!studentId) throw new Error(`Row ${rowNumber}: missing student_id`);
    if (!date) throw new Error(`Row ${rowNumber}: invalid date "${get('date')}"`);

    return {
      studentId,
      studentName: get('studentName') || 'Unknown',
      rollNumber: get('rollNumber') || studentId,
      department: get('department') || 'Unknown',
      className: get('className') || 'Unknown',
      section: get('section') || 'Unknown',
      date,
      firstPunchIn: this.parseTime(get('firstPunchIn'), date),
      lastPunchOut: this.parseTime(get('lastPunchOut'), date),
      status: this.parseStatus(get('status'), get('firstPunchIn')),
    };
  }

  private parseDate(raw: string): Date | null {
    if (!raw) return null;
    const asDate = new Date(raw);
    if (isValid(asDate) && !isNaN(asDate.getTime())) {
      return new Date(format(asDate, 'yyyy-MM-dd') + 'T00:00:00.000Z');
    }
    const formats = ['dd/MM/yyyy', 'MM/dd/yyyy', 'yyyy-MM-dd', 'dd-MM-yyyy', 'dd.MM.yyyy'];
    for (const fmt of formats) {
      const parsed = parseFns(raw, fmt, new Date());
      if (isValid(parsed)) return new Date(format(parsed, 'yyyy-MM-dd') + 'T00:00:00.000Z');
    }
    const iso = parseISO(raw);
    return isValid(iso) ? iso : null;
  }

  private parseTime(raw: string, baseDate: Date): Date | null {
    if (!raw) return null;
    const full = new Date(raw);
    if (isValid(full) && !isNaN(full.getTime())) return full;
    const timeMatch = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (timeMatch) {
      const [, h, m, s = '0'] = timeMatch;
      const dt = new Date(baseDate);
      dt.setUTCHours(parseInt(h), parseInt(m), parseInt(s), 0);
      return dt;
    }
    return null;
  }

  private parseStatus(raw: string, punchIn: string): AttendanceStatus {
    if (raw) {
      const key = raw.toLowerCase().trim().replace(/[^a-z0-9_]/g, '');
      if (STATUS_MAP[key]) return STATUS_MAP[key];
    }
    return punchIn ? 'PRESENT' : 'ABSENT';
  }
}