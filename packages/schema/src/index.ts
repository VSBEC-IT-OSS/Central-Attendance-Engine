// ─────────────────────────────────────────────────────────────────────────────
// @attendance-engine/schema
// Canonical types shared across API, dashboard, and any future consumer.
// ─────────────────────────────────────────────────────────────────────────────

// ── Attendance ────────────────────────────────────────────────────────────────

export type AttendanceStatus =
  | 'PRESENT'
  | 'ABSENT'
  | 'LATE'
  | 'HALF_DAY'
  | 'HOLIDAY'
  | 'EXCUSED';

export interface AttendanceRecord {
  id: string;
  studentId: string;
  studentName: string;
  rollNumber: string;
  department: string;
  className: string;
  section: string;
  date: string; // ISO date 'YYYY-MM-DD'
  firstPunchIn: string | null; // ISO datetime
  lastPunchOut: string | null; // ISO datetime
  status: AttendanceStatus;
  sourceFile: string;
  importedAt: string;
  rawHash: string;
}

// ── Import / Ingest ───────────────────────────────────────────────────────────

export type ImportStatus = 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'PARTIAL' | 'FAILED';

export interface ImportLog {
  id: string;
  filename: string;
  fileHash: string;
  status: ImportStatus;
  totalRows: number;
  parsedRows: number;
  skippedRows: number;
  errorRows: number;
  startedAt: string;
  completedAt: string | null;
  triggeredBy: string; // 'auto' | 'manual' | api-key name
  notes: string | null;
}

export interface ParseError {
  id: string;
  importLogId: string;
  rowNumber: number;
  rawData: string; // JSON-stringified original row
  errorCode: string;
  errorMessage: string;
  createdAt: string;
}

// ── API ───────────────────────────────────────────────────────────────────────

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  meta?: PaginationMeta;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginationQuery {
  page?: number;
  limit?: number;
}

// ── Query filters ─────────────────────────────────────────────────────────────

export interface AttendanceQuery extends PaginationQuery {
  date?: string;
  dateFrom?: string;
  dateTo?: string;
  department?: string;
  class?: string;
  section?: string;
  studentId?: string;
  status?: AttendanceStatus;
}

export interface AbsenteeList {
  date: string;
  department: string;
  className: string;
  section: string;
  absentees: {
    studentId: string;
    studentName: string;
    rollNumber: string;
  }[];
}

// ── Summary / Aggregates ──────────────────────────────────────────────────────

export interface DepartmentSummary {
  department: string;
  date: string;
  total: number;
  present: number;
  absent: number;
  late: number;
  halfDay: number;
  attendancePercent: number;
}

export interface ClassSummary {
  department: string;
  className: string;
  section: string;
  date: string;
  total: number;
  present: number;
  absent: number;
  late: number;
  halfDay: number;
  attendancePercent: number;
}

export interface StudentSummary {
  studentId: string;
  studentName: string;
  rollNumber: string;
  department: string;
  className: string;
  section: string;
  dateFrom: string;
  dateTo: string;
  totalDays: number;
  presentDays: number;
  absentDays: number;
  lateDays: number;
  attendancePercent: number;
}

// ── System / Admin ────────────────────────────────────────────────────────────

export interface SystemHealth {
  status: 'healthy' | 'degraded' | 'down';
  version: string;
  uptime: number;
  database: 'connected' | 'error';
  redis: 'connected' | 'error';
  queueDepth: number;
  lastImportAt: string | null;
  lastImportStatus: ImportStatus | null;
}

export interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string; // first 8 chars for display
  permissions: string[];
  lastUsedAt: string | null;
  createdAt: string;
  isActive: boolean;
}

// ── WebSocket events ──────────────────────────────────────────────────────────

export type WsEventType =
  | 'IMPORT_STARTED'
  | 'IMPORT_PROGRESS'
  | 'IMPORT_COMPLETED'
  | 'IMPORT_FAILED'
  | 'SYSTEM_ALERT';

export interface WsEvent<T = unknown> {
  event: WsEventType;
  payload: T;
  timestamp: string;
}

export interface ImportProgressPayload {
  importLogId: string;
  filename: string;
  processedRows: number;
  totalRows: number;
  percent: number;
}
