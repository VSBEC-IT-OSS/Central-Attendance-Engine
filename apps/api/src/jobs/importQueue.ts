import { Queue, Worker, Job } from 'bullmq';
import { bullRedis } from '../config/redis';
import { logger } from '../config/logger';
import { runImport } from '../services/importService';

// ─────────────────────────────────────────────────────────────────────────────
// Import Queue (BullMQ)
//
// All xlsx imports go through this queue — whether triggered by HTTP push,
// file watcher, or manual re-import from admin UI.
// Retries 3 times with exponential backoff.
// ─────────────────────────────────────────────────────────────────────────────

export interface ImportJobData {
  filepath: string;
  filename: string;
  triggeredBy: string;
}

const QUEUE_NAME = 'attendance-import';

export const importQueue = new Queue<ImportJobData>(QUEUE_NAME, {
  connection: bullRedis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 200 },
  },
});

export function startImportWorker(): Worker<ImportJobData> {
  const worker = new Worker<ImportJobData>(
    QUEUE_NAME,
    async (job: Job<ImportJobData>) => {
      logger.info({ jobId: job.id, filename: job.data.filename }, '[Queue] Processing import job');
      
      // runImport handles parsing, DB writing, and now AUTO-CLEANUP of the file
      const summary = await runImport(job.data);
      
      return summary;
    },
    {
      connection: bullRedis,
      concurrency: 1, // process one file at a time — prevents DB contention
    },
  );

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id, filename: job.data.filename }, '[Queue] Job completed');
  });

  worker.on('failed', (job, err) => {
    logger.error(
      { jobId: job?.id, filename: job?.data?.filename, err: err.message },
      '[Queue] Job failed',
    );
  });

  worker.on('error', (err) => {
    logger.error({ err: err.message }, '[Queue] Worker error');
  });

  logger.info('[Queue] Import worker started');
  return worker;
}

export async function enqueueImport(data: ImportJobData): Promise<string> {
  const job = await importQueue.add(`import:${data.filename}`, data, {
    jobId: `${data.filename}-${Date.now()}`,
  });
  logger.info({ jobId: job.id, filename: data.filename }, '[Queue] Job enqueued');
  return job.id!;
}