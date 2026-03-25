import { FastifyInstance } from 'fastify';
import { createWriteStream, existsSync, mkdirSync } from 'fs';
import { pipeline } from 'stream/promises';
import { join } from 'path';
import { config } from '../config/env';
import { logger } from '../config/logger';
import { enqueueImport } from '../jobs/importQueue';
import { ok, fail } from '../utils/response';

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/ingest/upload
//
// The aggregator server calls this endpoint to push a daily xlsx file.
// Authentication: X-Ingest-Secret header (shared secret, not user auth).
// ─────────────────────────────────────────────────────────────────────────────

export async function ingestRoutes(app: FastifyInstance): Promise<void> {
  // Validate ingest secret
  app.addHook('preHandler', async (request, reply) => {
    const secret = request.headers['x-ingest-secret'];
    if (secret !== config.INGEST_SECRET) {
      reply.status(401).send({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Invalid ingest secret' },
      });
    }
  });

  // POST /upload — receive xlsx file
  app.post('/upload', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const data = await request.file();
    if (!data) return fail(reply, 400, 'NO_FILE', 'No file in request');

    const filename = data.filename;
    if (!filename.match(/\.(xlsx|xls)$/i)) {
      return fail(reply, 400, 'INVALID_FILE_TYPE', 'Only .xlsx and .xls files are accepted');
    }

    // Save to watch directory
    if (!existsSync(config.WATCH_DIR)) mkdirSync(config.WATCH_DIR, { recursive: true });
    const filepath = join(config.WATCH_DIR, `${Date.now()}-${filename}`);

    try {
      await pipeline(data.file, createWriteStream(filepath));
    } catch (err) {
      logger.error({ err, filename }, '[Ingest] Failed to save uploaded file');
      return fail(reply, 500, 'SAVE_FAILED', 'Failed to save uploaded file');
    }

    const jobId = await enqueueImport({
      filepath,
      filename,
      triggeredBy: 'http-push',
    });

    logger.info({ filename, jobId }, '[Ingest] File received and queued');

    return ok(reply, {
      message: 'File received and queued for processing',
      filename,
      jobId,
    });
  });

  // POST /trigger — manually trigger re-import of an existing file by path (admin only)
  app.post('/trigger', async (request, reply) => {
    const body = request.body as { filepath: string; filename: string } | undefined;
    if (!body?.filepath || !body?.filename) {
      return fail(reply, 400, 'MISSING_FIELDS', 'filepath and filename required');
    }

    if (!existsSync(body.filepath)) {
      return fail(reply, 404, 'FILE_NOT_FOUND', `File not found: ${body.filepath}`);
    }

    const jobId = await enqueueImport({
      filepath: body.filepath,
      filename: body.filename,
      triggeredBy: 'manual-trigger',
    });

    return ok(reply, { message: 'Import queued', jobId });
  });
}
