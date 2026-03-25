import { describe, it, expect } from 'vitest';
import { DefaultBiometricAdapter } from '../src/parser/adapters/default-biometric.adapter';

const adapter = new DefaultBiometricAdapter();

describe('DefaultBiometricAdapter', () => {
  describe('canHandle()', () => {
    it('returns true for standard columns', () => {
      expect(adapter.canHandle(['student_id', 'student_name', 'date', 'status'])).toBe(true);
    });
    it('returns true for aliased columns', () => {
      expect(adapter.canHandle(['empid', 'name', 'attendance_date', 'attendance'])).toBe(true);
    });
    it('returns false when missing both id and date', () => {
      expect(adapter.canHandle(['name', 'department'])).toBe(false);
    });
  });

  describe('parse()', () => {
    it('normalises a standard row', async () => {
      const rows = [{
        student_id: 'S001',
        student_name: 'Arun Kumar',
        roll_no: 'CS21001',
        department: 'CSE',
        class: 'III Year',
        section: 'A',
        date: '2024-03-15',
        punch_in: '09:02',
        punch_out: '16:45',
        status: 'P',
      }];
      const result = await adapter.parse(rows, 'test.xlsx');
      expect(result.rows).toHaveLength(1);
      expect(result.errors).toHaveLength(0);
      expect(result.rows[0].studentId).toBe('S001');
      expect(result.rows[0].status).toBe('PRESENT');
      expect(result.rows[0].rollNumber).toBe('CS21001');
    });

    it('captures error for missing student_id', async () => {
      const rows = [{ date: '2024-03-15', student_name: 'Test', status: 'P' }];
      const result = await adapter.parse(rows, 'test.xlsx');
      expect(result.rows).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].errorMessage).toContain('student_id');
    });

    it('infers ABSENT when no punch and no status', async () => {
      const rows = [{ student_id: 'S002', date: '2024-03-15' }];
      const result = await adapter.parse(rows, 'test.xlsx');
      expect(result.rows[0].status).toBe('ABSENT');
    });

    it('handles all status aliases', async () => {
      const statusTests = [
        { input: 'P', expected: 'PRESENT' },
        { input: 'present', expected: 'PRESENT' },
        { input: 'A', expected: 'ABSENT' },
        { input: 'L', expected: 'LATE' },
        { input: 'half_day', expected: 'HALF_DAY' },
        { input: 'OD', expected: 'EXCUSED' },
      ];
      for (const { input, expected } of statusTests) {
        const rows = [{ student_id: 'S003', date: '2024-03-15', status: input }];
        const result = await adapter.parse(rows, 'test.xlsx');
        expect(result.rows[0]?.status).toBe(expected);
      }
    });

    it('handles multiple date formats', async () => {
      const dates = ['15/03/2024', '03/15/2024', '2024-03-15', '15-03-2024'];
      for (const dateStr of dates) {
        const rows = [{ student_id: 'S004', date: dateStr, status: 'P' }];
        const result = await adapter.parse(rows, 'test.xlsx');
        expect(result.errors).toHaveLength(0);
        expect(result.rows[0].date).toBeInstanceOf(Date);
      }
    });

    it('processes large batches without error', async () => {
      const rows = Array.from({ length: 1000 }, (_, i) => ({
        student_id: `S${String(i).padStart(4, '0')}`,
        student_name: `Student ${i}`,
        date: '2024-03-15',
        status: i % 5 === 0 ? 'A' : 'P',
      }));
      const result = await adapter.parse(rows, 'large.xlsx');
      expect(result.rows.length + result.errors.length).toBe(1000);
    });
  });
});
