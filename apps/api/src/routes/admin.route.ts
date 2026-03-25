import { FastifyInstance } from 'fastify';
import { createHash, randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '../config/db';
import { redis } from '../config/redis';
import { requireJwt } from '../middleware/auth';
import { ok, created, fail, notFound, parsePagination, paginationMeta } from '../utils/response';
import { importQueue } from '../jobs/importQueue';
const APP_VERSION = '1.0.0';

// ─────────────────────────────────────────────────────────────────────────────
// Admin Routes  /api/v1/admin  (JWT only — dashboard users)
// ─────────────────────────────────────────────────────────────────────────────

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireJwt);

  // ── System health ───────────────────────────────────────────────────────────
  app.get('/health', async (_request, reply) => {
    let dbStatus: 'connected' | 'error' = 'error';
    let redisStatus: 'connected' | 'error' = 'error';

    try { await prisma.$queryRaw`SELECT 1`; dbStatus = 'connected'; } catch {}
    try { await redis.ping(); redisStatus = 'connected'; } catch {}

    const [queueDepth, lastImport] = await Promise.all([
      importQueue.getWaitingCount().catch(() => -1),
      prisma.importLog.findFirst({
        orderBy: { startedAt: 'desc' },
        select: { status: true, startedAt: true },
      }),
    ]);

    const overallStatus =
      dbStatus === 'error' || redisStatus === 'error' ? 'degraded' : 'healthy';

    return ok(reply, {
      status: overallStatus,
      version: APP_VERSION,
      uptime: Math.floor(process.uptime()),
      database: dbStatus,
      redis: redisStatus,
      queueDepth,
      lastImportAt: lastImport?.startedAt ?? null,
      lastImportStatus: lastImport?.status ?? null,
    });
  });

  // ── Import logs ─────────────────────────────────────────────────────────────
  app.get('/imports', async (request, reply) => {
    const q = request.query as Record<string, string>;
    const { page, limit, skip } = parsePagination(q);
    const where: any = {};
    if (q.status) where.status = q.status;

    const [logs, total] = await Promise.all([
      prisma.importLog.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        skip,
        take: limit,
        include: { _count: { select: { parseErrors: true } } },
      }),
      prisma.importLog.count({ where }),
    ]);

    return ok(reply, logs, paginationMeta(total, page, limit));
  });

  app.get('/imports/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const log = await prisma.importLog.findUnique({
      where: { id },
      include: { parseErrors: { orderBy: { rowNumber: 'asc' } } },
    });
    if (!log) return notFound(reply, `Import log ${id} not found`);
    return ok(reply, log);
  });

  // Retry a failed import
  app.post('/imports/:id/retry', async (request, reply) => {
    const { id } = request.params as { id: string };
    const log = await prisma.importLog.findUnique({ where: { id } });
    if (!log) return notFound(reply, `Import log ${id} not found`);
    if (log.status !== 'FAILED' && log.status !== 'PARTIAL') {
      return fail(reply, 400, 'INVALID_STATUS', 'Only FAILED or PARTIAL imports can be retried');
    }

    // Reset the file hash so the dedup check passes
    await prisma.importLog.update({ where: { id }, data: { fileHash: 'retry-pending' } });

    return ok(reply, { message: 'Manual retry must re-upload the file via /ingest/upload' });
  });

  // ── Parse errors ────────────────────────────────────────────────────────────
  app.get('/parse-errors', async (request, reply) => {
    const q = request.query as Record<string, string>;
    const { page, limit, skip } = parsePagination(q);

    const [errors, total] = await Promise.all([
      prisma.parseError.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: { importLog: { select: { filename: true, startedAt: true } } },
      }),
      prisma.parseError.count(),
    ]);

    return ok(reply, errors, paginationMeta(total, page, limit));
  });

  // ── System events ───────────────────────────────────────────────────────────
  app.get('/events', async (request, reply) => {
    const q = request.query as Record<string, string>;
    const { page, limit, skip } = parsePagination(q);
    const where: any = {};
    if (q.severity) where.severity = q.severity;
    if (q.type) where.type = q.type;

    const [events, total] = await Promise.all([
      prisma.systemEvent.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: limit }),
      prisma.systemEvent.count({ where }),
    ]);

    return ok(reply, events, paginationMeta(total, page, limit));
  });

  // ── API key management ──────────────────────────────────────────────────────
  app.get('/api-keys', async (_request, reply) => {
    const keys = await prisma.apiKey.findMany({
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, keyPrefix: true, permissions: true, lastUsedAt: true, createdAt: true, isActive: true },
    });
    return ok(reply, keys);
  });

  app.post('/api-keys', async (request, reply) => {
    const body = request.body as { name: string; permissions: string[] } | undefined;
    if (!body?.name) return fail(reply, 400, 'MISSING_FIELDS', 'name is required');

    const permissions = body.permissions ?? ['attendance:read', 'summary:read'];
    const rawKey = `ae_${randomBytes(32).toString('hex')}`;
    const keyHash = createHash('sha256').update(rawKey).digest('hex');
    const keyPrefix = rawKey.substring(0, 10);

    const existing = await prisma.apiKey.findUnique({ where: { name: body.name } });
    if (existing) return fail(reply, 409, 'DUPLICATE_NAME', `API key "${body.name}" already exists`);

    const key = await prisma.apiKey.create({
      data: { name: body.name, keyHash, keyPrefix, permissions },
    });

    await prisma.systemEvent.create({
      data: { type: 'API_KEY_CREATED', severity: 'INFO', message: `API key created: ${body.name}`, metadata: { keyId: key.id } },
    });

    // Return the raw key ONCE — never stored in plaintext
    return created(reply, {
      id: key.id,
      name: key.name,
      key: rawKey, // shown only on creation
      keyPrefix,
      permissions,
      message: 'Store this key securely — it will not be shown again',
    });
  });

  app.delete('/api-keys/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const key = await prisma.apiKey.findUnique({ where: { id } });
    if (!key) return notFound(reply, `API key ${id} not found`);

    await prisma.apiKey.update({ where: { id }, data: { isActive: false } });
    await prisma.systemEvent.create({
      data: { type: 'API_KEY_REVOKED', severity: 'WARN', message: `API key revoked: ${key.name}`, metadata: { keyId: id } },
    });

    return ok(reply, { message: `API key "${key.name}" revoked` });
  });

  // ── Metadata: available departments, classes ────────────────────────────────
  app.get('/meta/departments', async (_request, reply) => {
    const rows = await prisma.attendanceRecord.findMany({
      distinct: ['department'],
      select: { department: true },
      orderBy: { department: 'asc' },
    });
    return ok(reply, rows.map((r) => r.department));
  });

  app.get('/meta/classes', async (request, reply) => {
    const q = request.query as Record<string, string>;
    const where: any = {};
    if (q.department) where.department = q.department;
    const rows = await prisma.attendanceRecord.findMany({
      where,
      distinct: ['department', 'className', 'section'],
      select: { department: true, className: true, section: true },
      orderBy: [{ department: 'asc' }, { className: 'asc' }, { section: 'asc' }],
    });
    return ok(reply, rows);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Auth Routes  /api/v1/auth
// ─────────────────────────────────────────────────────────────────────────────

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post('/login', async (request, reply) => {
    const body = request.body as { email: string; password: string } | undefined;
    if (!body?.email || !body?.password) {
      return fail(reply, 400, 'MISSING_FIELDS', 'email and password required');
    }

    const user = await prisma.adminUser.findUnique({ where: { email: body.email } });
    if (!user || !user.isActive) {
      return fail(reply, 401, 'INVALID_CREDENTIALS', 'Invalid email or password');
    }

    const valid = await bcrypt.compare(body.password, user.passwordHash);
    if (!valid) return fail(reply, 401, 'INVALID_CREDENTIALS', 'Invalid email or password');

    await prisma.adminUser.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    const token = app.jwt.sign(
      { sub: user.id, email: user.email, name: user.name },
      { expiresIn: '8h' },
    );

    return ok(reply, { token, name: user.name, email: user.email });
  });

  app.get('/me', { preHandler: requireJwt }, async (request, reply) => {
    const payload = request.user as { sub: string };
    const user = await prisma.adminUser.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, name: true, lastLoginAt: true },
    });
    if (!user) return notFound(reply);
    return ok(reply, user);
  });
}
