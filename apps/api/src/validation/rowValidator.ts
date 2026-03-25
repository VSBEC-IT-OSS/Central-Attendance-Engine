import { z } from 'zod';
import type { NormalisedRow, RowError } from '../parser/adapter.interface';

// ─────────────────────────────────────────────────────────────────────────────
// Validation layer
//
// Runs after the parser. Validates business rules before DB write.
// ─────────────────────────────────────────────────────────────────────────────

const VALID_STATUSES = ['PRESENT', 'ABSENT', 'LATE', 'HALF_DAY', 'HOLIDAY', 'EXCUSED'] as const;

const rowSchema = z.object({
  studentId: z.string().min(1, 'studentId is required'),
  studentName: z.string().min(1, 'studentName is required'),
  rollNumber: z.string().min(1, 'rollNumber is required'),
  department: z.string().min(1, 'department is required'),
  date: z.date().refine((d) => !isNaN(d.getTime()), 'date must be a valid date'),
  status: z.enum(VALID_STATUSES),
});

export interface ValidationResult {
  valid: NormalisedRow[];
  errors: RowError[];
}

export function validateRows(
  rows: NormalisedRow[],
  startRowOffset = 2,
): ValidationResult {
  const valid: NormalisedRow[] = [];
  const errors: RowError[] = [];

  rows.forEach((row, idx) => {
    const result = rowSchema.safeParse(row);
    if (result.success) {
      valid.push(row);
    } else {
      const messages = result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`);
      errors.push({
        rowNumber: startRowOffset + idx,
        rawData: row as unknown as Record<string, unknown>,
        errorCode: 'VALIDATION_ERROR',
        errorMessage: messages.join('; '),
      });
    }
  });

  return { valid, errors };
}

// Sanity check: future dates should not exist in an attendance file
export function flagFutureDates(rows: NormalisedRow[]): {
  clean: NormalisedRow[];
  future: NormalisedRow[];
} {
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  return {
    clean: rows.filter((r) => r.date <= today),
    future: rows.filter((r) => r.date > today),
  };
}
