import { FastifyInstance } from 'fastify';
import { prisma } from '../config/db';
import { cache } from '../config/redis';
import { requireAuth, requirePermission } from '../middleware/auth';
import { ok, notFound, parsePagination, paginationMeta } from '../utils/response';
import type { AttendanceStatus } from '@attendance-engine/schema';

// ─────────────────────────────────────────────────────────────────────────────
// Attendance Routes  /api/v1/attendance
// ─────────────────────────────────────────────────────────────────────────────

export async function attendanceRoutes(app: FastifyInstance): Promise<void> {
  // All routes require auth
  app.addHook('preHandler', requireAuth);
  app.addHook('preHandler', requirePermission('attendance:read'));

  // ── GET /attendance ─────────────────────────────────────────────────────────
  // Paginated list with filters. The workhorse for dashboards.
  app.get('/', async (request, reply) => {
    const q = request.query as Record<string, string>;
    const { page, limit, skip } = parsePagination(q);

    const where = buildWhereClause(q);
    const cacheKey = `attendance:list:${JSON.stringify({ where, page, limit })}`;
    const cached = await cache.get(cacheKey);
    if (cached) return ok(reply, (cached as any).data, (cached as any).meta);

    const [records, total] = await Promise.all([
      prisma.attendanceRecord.findMany({
        where,
        orderBy: [{ date: 'desc' }, { department: 'asc' }, { rollNumber: 'asc' }],
        skip,
        take: limit,
      }),
      prisma.attendanceRecord.count({ where }),
    ]);

    const meta = paginationMeta(total, page, limit);
    await cache.set(cacheKey, { data: records, meta }, 120);
    return ok(reply, records, meta);
  });

  // ── GET /attendance/:id ─────────────────────────────────────────────────────
  app.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const record = await prisma.attendanceRecord.findUnique({ where: { id } });
    if (!record) return notFound(reply, `Attendance record ${id} not found`);
    return ok(reply, record);
  });

  // ── GET /attendance/student/:studentId ──────────────────────────────────────
  app.get('/student/:studentId', async (request, reply) => {
    const { studentId } = request.params as { studentId: string };
    const q = request.query as Record<string, string>;
    const { page, limit, skip } = parsePagination(q);

    const where = {
      studentId,
      ...buildDateRange(q.dateFrom, q.dateTo),
    };

    const [records, total] = await Promise.all([
      prisma.attendanceRecord.findMany({
        where,
        orderBy: { date: 'desc' },
        skip,
        take: limit,
      }),
      prisma.attendanceRecord.count({ where }),
    ]);

    if (total === 0) return notFound(reply, `No records for student ${studentId}`);
    return ok(reply, records, paginationMeta(total, page, limit));
  });

  // ── GET /attendance/absentees/today ────────────────────────────────────────
  app.get('/absentees/today', async (request, reply) => {
    const q = request.query as Record<string, string>;
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const where: any = {
      date: today,
      status: 'ABSENT',
      ...(q.department ? { department: q.department } : {}),
      ...(q.className ? { className: q.className } : {}),
      ...(q.section ? { section: q.section } : {}),
    };

    const cacheKey = `attendance:absentees:${today.toISOString().split('T')[0]}:${JSON.stringify(q)}`;
    const cached = await cache.get(cacheKey);
    if (cached) return ok(reply, cached);

    const records = await prisma.attendanceRecord.findMany({
      where,
      select: {
        studentId: true,
        studentName: true,
        rollNumber: true,
        department: true,
        className: true,
        section: true,
        date: true,
      },
      orderBy: [{ department: 'asc' }, { className: 'asc' }, { rollNumber: 'asc' }],
    });

    // Group by class/section for WhatsApp bot convenience
    const grouped = records.reduce((acc, r) => {
      const key = `${r.department}|${r.className}|${r.section}`;
      if (!acc[key]) {
        acc[key] = {
          date: r.date.toISOString().split('T')[0],
          department: r.department,
          className: r.className,
          section: r.section,
          absentees: [],
        };
      }
      acc[key].absentees.push({
        studentId: r.studentId,
        studentName: r.studentName,
        rollNumber: r.rollNumber,
      });
      return acc;
    }, {} as Record<string, any>);

    const result = Object.values(grouped);
    await cache.set(cacheKey, result, 300);
    return ok(reply, result);
  });

  // ── GET /attendance/absentees/date/:date ────────────────────────────────────
  app.get('/absentees/date/:date', async (request, reply) => {
    const { date } = request.params as { date: string };
    const q = request.query as Record<string, string>;
    const parsedDate = new Date(date + 'T00:00:00.000Z');
    if (isNaN(parsedDate.getTime())) {
      return reply.status(400).send({ success: false, error: { code: 'INVALID_DATE', message: 'Date must be YYYY-MM-DD' } });
    }

    const where: any = {
      date: parsedDate,
      status: 'ABSENT',
      ...(q.department ? { department: q.department } : {}),
      ...(q.className ? { className: q.className } : {}),
    };

    const records = await prisma.attendanceRecord.findMany({
      where,
      select: { studentId: true, studentName: true, rollNumber: true, department: true, className: true, section: true, date: true },
      orderBy: [{ department: 'asc' }, { className: 'asc' }, { rollNumber: 'asc' }],
    });

    const grouped = records.reduce((acc, r) => {
      const key = `${r.department}|${r.className}|${r.section}`;
      if (!acc[key]) acc[key] = { date, department: r.department, className: r.className, section: r.section, absentees: [] };
      acc[key].absentees.push({ studentId: r.studentId, studentName: r.studentName, rollNumber: r.rollNumber });
      return acc;
    }, {} as Record<string, any>);

    return ok(reply, Object.values(grouped));
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildWhereClause(q: Record<string, string>): Record<string, any> {
  const where: Record<string, any> = {};
  if (q.date) where.date = new Date(q.date + 'T00:00:00.000Z');
  if (q.dateFrom || q.dateTo) Object.assign(where, buildDateRange(q.dateFrom, q.dateTo));
  if (q.department) where.department = q.department;
  if (q.className) where.className = q.className;
  if (q.section) where.section = q.section;
  if (q.studentId) where.studentId = q.studentId;
  if (q.status) where.status = q.status.toUpperCase() as AttendanceStatus;
  return where;
}

function buildDateRange(from?: string, to?: string): Record<string, any> {
  const range: Record<string, any> = {};
  if (from || to) {
    range.date = {};
    if (from) range.date.gte = new Date(from + 'T00:00:00.000Z');
    if (to) range.date.lte = new Date(to + 'T00:00:00.000Z');
  }
  return range;
}
