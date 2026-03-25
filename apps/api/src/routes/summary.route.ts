import { FastifyInstance } from 'fastify';
import { prisma } from '../config/db';
import { cache } from '../config/redis';
import { requireAuth, requirePermission } from '../middleware/auth';
import { ok } from '../utils/response';

// ─────────────────────────────────────────────────────────────────────────────
// Summary Routes  /api/v1/summary
// Pre-aggregated stats for dashboards. All responses cached in Redis.
// ─────────────────────────────────────────────────────────────────────────────

export async function summaryRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAuth);
  app.addHook('preHandler', requirePermission('summary:read'));

  // ── GET /summary/department?date=YYYY-MM-DD ─────────────────────────────────
  app.get('/department', async (request, reply) => {
    const q = request.query as Record<string, string>;
    const date = resolveDate(q.date);
    const cacheKey = `summary:dept:${date.toISOString().split('T')[0]}`;

    const cached = await cache.get(cacheKey);
    if (cached) return ok(reply, cached);

    const rows = await prisma.attendanceRecord.groupBy({
      by: ['department', 'status'],
      where: { date },
      _count: { status: true },
    });

    const result = aggregateByDepartment(rows, date);
    await cache.set(cacheKey, result, 300);
    return ok(reply, result);
  });

  // ── GET /summary/class?date=YYYY-MM-DD&department=CSE ──────────────────────
  app.get('/class', async (request, reply) => {
    const q = request.query as Record<string, string>;
    const date = resolveDate(q.date);
    const cacheKey = `summary:class:${date.toISOString().split('T')[0]}:${q.department ?? 'all'}`;

    const cached = await cache.get(cacheKey);
    if (cached) return ok(reply, cached);

    const where: any = { date };
    if (q.department) where.department = q.department;

    const rows = await prisma.attendanceRecord.groupBy({
      by: ['department', 'className', 'section', 'status'],
      where,
      _count: { status: true },
    });

    const result = aggregateByClass(rows, date);
    await cache.set(cacheKey, result, 300);
    return ok(reply, result);
  });

  // ── GET /summary/student/:studentId?dateFrom=&dateTo= ──────────────────────
  app.get('/student/:studentId', async (request, reply) => {
    const { studentId } = request.params as { studentId: string };
    const q = request.query as Record<string, string>;
    const dateFrom = q.dateFrom ? new Date(q.dateFrom + 'T00:00:00.000Z') : thirtyDaysAgo();
    const dateTo = q.dateTo ? new Date(q.dateTo + 'T00:00:00.000Z') : new Date();

    const cacheKey = `summary:student:${studentId}:${dateFrom.toISOString()}:${dateTo.toISOString()}`;
    const cached = await cache.get(cacheKey);
    if (cached) return ok(reply, cached);

    const [rows, student] = await Promise.all([
      prisma.attendanceRecord.groupBy({
        by: ['status'],
        where: { studentId, date: { gte: dateFrom, lte: dateTo } },
        _count: { status: true },
      }),
      prisma.attendanceRecord.findFirst({
        where: { studentId },
        select: { studentName: true, rollNumber: true, department: true, className: true, section: true },
      }),
    ]);

    if (!student) return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Student not found' } });

    const counts = { PRESENT: 0, ABSENT: 0, LATE: 0, HALF_DAY: 0, HOLIDAY: 0, EXCUSED: 0 };
    rows.forEach((r) => { counts[r.status as keyof typeof counts] = r._count.status; });

    const totalDays = Object.values(counts).reduce((a, b) => a + b, 0);
    const effectivePresent = counts.PRESENT + counts.LATE + Math.floor(counts.HALF_DAY / 2);

    const result = {
      studentId,
      ...student,
      dateFrom: dateFrom.toISOString().split('T')[0],
      dateTo: dateTo.toISOString().split('T')[0],
      totalDays,
      ...counts,
      attendancePercent: totalDays > 0 ? Math.round((effectivePresent / totalDays) * 100 * 10) / 10 : 0,
    };

    await cache.set(cacheKey, result, 300);
    return ok(reply, result);
  });

  // ── GET /summary/overview?dateFrom=&dateTo= — top-level numbers ────────────
  app.get('/overview', async (request, reply) => {
    const q = request.query as Record<string, string>;
    const date = resolveDate(q.date);
    const cacheKey = `summary:overview:${date.toISOString().split('T')[0]}`;

    const cached = await cache.get(cacheKey);
    if (cached) return ok(reply, cached);

    const [statusGroups, importStats, departments] = await Promise.all([
      prisma.attendanceRecord.groupBy({
        by: ['status'],
        where: { date },
        _count: { status: true },
      }),
      prisma.importLog.findFirst({
        orderBy: { startedAt: 'desc' },
        select: { status: true, startedAt: true, parsedRows: true, errorRows: true },
      }),
      prisma.attendanceRecord.findMany({
        where: { date },
        distinct: ['department'],
        select: { department: true },
      }),
    ]);

    const counts = { PRESENT: 0, ABSENT: 0, LATE: 0, HALF_DAY: 0, HOLIDAY: 0, EXCUSED: 0 };
    statusGroups.forEach((r) => { counts[r.status as keyof typeof counts] = r._count.status; });
    const total = Object.values(counts).reduce((a, b) => a + b, 0);

    const result = {
      date: date.toISOString().split('T')[0],
      total,
      ...counts,
      attendancePercent: total > 0 ? Math.round(((counts.PRESENT + counts.LATE) / total) * 100 * 10) / 10 : 0,
      departmentsReported: departments.length,
      lastImport: importStats,
    };

    await cache.set(cacheKey, result, 180);
    return ok(reply, result);
  });

  // ── GET /summary/trend?department=CSE&days=30 ──────────────────────────────
  app.get('/trend', async (request, reply) => {
    const q = request.query as Record<string, string>;
    const days = Math.min(365, parseInt(q.days ?? '30', 10));
    const from = new Date();
    from.setDate(from.getDate() - days);
    from.setUTCHours(0, 0, 0, 0);

    const where: any = { date: { gte: from } };
    if (q.department) where.department = q.department;
    if (q.className) where.className = q.className;

    const cacheKey = `summary:trend:${JSON.stringify(where)}`;
    const cached = await cache.get(cacheKey);
    if (cached) return ok(reply, cached);

    const rows = await prisma.attendanceRecord.groupBy({
      by: ['date', 'status'],
      where,
      _count: { status: true },
      orderBy: { date: 'asc' },
    });

    // Pivot into daily objects
    const byDate: Record<string, Record<string, number>> = {};
    rows.forEach((r) => {
      const d = r.date.toISOString().split('T')[0];
      if (!byDate[d]) byDate[d] = { date: d as any, PRESENT: 0, ABSENT: 0, LATE: 0, HALF_DAY: 0 };
      byDate[d][r.status] = r._count.status;
    });

    const result = Object.values(byDate).map((d) => ({
      ...d,
      total: (d.PRESENT ?? 0) + (d.ABSENT ?? 0) + (d.LATE ?? 0) + (d.HALF_DAY ?? 0),
      attendancePercent: (() => {
        const t = (d.PRESENT ?? 0) + (d.ABSENT ?? 0) + (d.LATE ?? 0) + (d.HALF_DAY ?? 0);
        return t > 0 ? Math.round(((d.PRESENT + d.LATE) / t) * 100 * 10) / 10 : 0;
      })(),
    }));

    await cache.set(cacheKey, result, 600);
    return ok(reply, result);
  });
}

// ── Aggregation helpers ───────────────────────────────────────────────────────

function resolveDate(raw?: string): Date {
  if (raw) {
    const d = new Date(raw + 'T00:00:00.000Z');
    if (!isNaN(d.getTime())) return d;
  }
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  return today;
}

function thirtyDaysAgo(): Date {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function aggregateByDepartment(rows: any[], date: Date): any[] {
  const map: Record<string, any> = {};
  rows.forEach((r) => {
    if (!map[r.department]) {
      map[r.department] = { department: r.department, date: date.toISOString().split('T')[0], total: 0, PRESENT: 0, ABSENT: 0, LATE: 0, HALF_DAY: 0, HOLIDAY: 0, EXCUSED: 0 };
    }
    map[r.department][r.status] = r._count.status;
    map[r.department].total += r._count.status;
  });
  return Object.values(map).map((d) => ({
    ...d,
    attendancePercent: d.total > 0 ? Math.round(((d.PRESENT + d.LATE) / d.total) * 100 * 10) / 10 : 0,
  }));
}

function aggregateByClass(rows: any[], date: Date): any[] {
  const map: Record<string, any> = {};
  rows.forEach((r) => {
    const key = `${r.department}|${r.className}|${r.section}`;
    if (!map[key]) {
      map[key] = { department: r.department, className: r.className, section: r.section, date: date.toISOString().split('T')[0], total: 0, PRESENT: 0, ABSENT: 0, LATE: 0, HALF_DAY: 0, HOLIDAY: 0, EXCUSED: 0 };
    }
    map[key][r.status] = r._count.status;
    map[key].total += r._count.status;
  });
  return Object.values(map).map((d) => ({
    ...d,
    attendancePercent: d.total > 0 ? Math.round(((d.PRESENT + d.LATE) / d.total) * 100 * 10) / 10 : 0,
  }));
}
