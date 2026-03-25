import { AttendanceStatus } from '@attendance-engine/schema';

// ─────────────────────────────────────────────────────────────────────────────
// IAttendanceAdapter
//
// Every xlsx format from any source must implement this interface.
// To add a new format: create a new file in adapters/, implement this interface,
// register it in adapterRegistry.ts — nothing else changes.
// ─────────────────────────────────────────────────────────────────────────────

export interface RawRow {
  [key: string]: string | number | Date | null | undefined;
}

export interface NormalisedRow {
  studentId: string;
  studentName: string;
  rollNumber: string;
  department: string;
  className: string;
  section: string;
  date: Date;
  firstPunchIn: Date | null;
  lastPunchOut: Date | null;
  status: AttendanceStatus;
}

export interface ParseResult {
  rows: NormalisedRow[];
  errors: RowError[];
  totalRawRows: number;
}

export interface RowError {
  rowNumber: number;
  rawData: Record<string, unknown>;
  errorCode: string;
  errorMessage: string;
}

export interface IAttendanceAdapter {
  /** Human-readable name for logs */
  readonly name: string;

  /**
   * Inspect the raw headers / first row and return true if this adapter
   * can handle the file. Registry calls this in priority order.
   */
  canHandle(headers: string[]): boolean;

  /**
   * Parse the full worksheet rows into normalised records.
   * Should never throw — capture row errors into ParseResult.errors.
   */
  parse(rows: RawRow[], filename: string): Promise<ParseResult>;
}
