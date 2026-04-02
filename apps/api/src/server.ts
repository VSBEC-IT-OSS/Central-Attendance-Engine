import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';

import { config } from './config/env';
import { logger } from './config/logger';
import { prisma } from './config/db';
import { redis, bullRedis } from './config/redis';

import { ingestRoutes } from './routes/ingest.route';
import { attendanceRoutes } from './routes/attendance.route';
import { summaryRoutes } from './routes/summary.route';
import { adminRoutes, authRoutes } from './routes/admin.route';
import { wsRoutes } from './routes/ws.route';
import { startImportWorker } from './jobs/importQueue';
import { startFileWatcher } from './ingest/fileWatcher';

// ─────────────────────────────────────────────────────────────────────────────
// Bootstrap
// ─────────────────────────────────────────────────────────────────────────────

async function buildApp() {
  const app = Fastify({
    logger: false, // we use our own Pino instance
    trustProxy: true,
  });

  // ── Plugins ─────────────────────────────────────────────────────────────────
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, {
    origin: [config.DASHBOARD_ORIGIN, 'http://localhost:5173'],
    credentials: true,
  });
  await app.register(jwt, { secret: config.JWT_SECRET });
  await app.register(multipart, { limits: { fileSize: 100 * 1024 * 1024 } }); // 100MB
  await app.register(rateLimit, {
    max: config.RATE_LIMIT_MAX,
    timeWindow: config.RATE_LIMIT_WINDOW_MS,
    redis,
  });
  await app.register(websocket);

  // ── Global error handler ───────────────────────────────────────────────────
  app.setErrorHandler((error, request, reply) => {
    logger.error({ err: error, url: request.url, method: request.method }, 'Unhandled error');
    const statusCode = error.statusCode ?? 500;
    reply.status(statusCode).send({
      success: false,
      error: {
        code: error.code ?? 'INTERNAL_ERROR',
        message: config.NODE_ENV === 'production' ? 'Internal server error' : error.message,
      },
    });
  });

  app.setNotFoundHandler((_request, reply) => {
    reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Route not found' } });
  });

  // ── Routes ───────────────────────────────────────────────────────────────────
  await app.register(wsRoutes);
  await app.register(authRoutes, { prefix: '/api/v1/auth' });
  await app.register(ingestRoutes, { prefix: '/api/v1/ingest' });
  await app.register(attendanceRoutes, { prefix: '/api/v1/attendance' });
  await app.register(summaryRoutes, { prefix: '/api/v1/summary' });
  await app.register(adminRoutes, { prefix: '/api/v1/admin' });

  // ── Health check (public) ────────────────────────────────────────────────────
  app.get('/health', async () => ({ status: 'ok', version: '1.0.0', ts: new Date().toISOString() }));

  return app;
}

async function start() {
  const app = await buildApp();
  // console.log(process.env.DATABASE_URL)
  // Connect infrastructure
  await prisma.$connect();
  // await bullRedis.connect();

  // Start background workers
  startImportWorker();
  // startFileWatcher();

  // Log system startup
  await prisma.systemEvent.create({
    data: { type: 'SYSTEM_STARTUP', severity: 'INFO', message: 'AttendanceEngine started', metadata: { port: config.PORT, env: config.NODE_ENV } },
  }).catch(() => {});

  await app.listen({ port: config.PORT, host: config.HOST });
  logger.info(`🚀 AttendanceEngine running on http://${config.HOST}:${config.PORT}`);
  logger.info(`📊 Dashboard: ${config.DASHBOARD_ORIGIN}`);
  logger.info(`🔌 WebSocket: ws://localhost:${config.PORT}/ws`);
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  await prisma.systemEvent.create({
    data: { type: 'SYSTEM_SHUTDOWN', severity: 'INFO', message: 'Graceful shutdown initiated' },
  }).catch(() => {});
  await prisma.$disconnect();
  await redis.quit();
  process.exit(0);
});

start().catch((err) => {
  logger.error({ err }, 'Failed to start server');
  process.exit(1);
});
