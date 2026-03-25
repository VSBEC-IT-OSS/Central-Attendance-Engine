import { watch } from 'chokidar';
import { existsSync, mkdirSync } from 'fs';
import { rename, mkdir } from 'fs/promises';
import { join, basename } from 'path';
import { config } from '../config/env';
import { logger } from '../config/logger';
import { enqueueImport } from '../jobs/importQueue';

// ─────────────────────────────────────────────────────────────────────────────
// File Watcher
//
// Watches WATCH_DIR for new .xlsx files. When found, enqueues an import job.
// This is the fallback ingestion method if the aggregator can't POST to HTTP.
// ─────────────────────────────────────────────────────────────────────────────

let watcherStarted = false;

export function startFileWatcher(): void {
  if (watcherStarted) return;

  // Ensure directories exist
  [config.WATCH_DIR, config.ARCHIVE_DIR].forEach((dir) => {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
      logger.info({ dir }, '[Watcher] Created directory');
    }
  });

  const watcher = watch(config.WATCH_DIR, {
    persistent: true,
    ignoreInitial: false, // process files already in the dir on startup
    awaitWriteFinish: {
      stabilityThreshold: 2000, // wait 2s after last write before triggering
      pollInterval: 500,
    },
    ignored: /(^|[/\\])\../, // ignore dot files
  });

  watcher.on('add', async (filepath) => {
    if (!filepath.match(/\.(xlsx|xls)$/i)) return;
    const filename = basename(filepath);
    logger.info({ filepath, filename }, '[Watcher] New file detected');

    try {
      await enqueueImport({ filepath, filename, triggeredBy: 'file-watcher' });
    } catch (err) {
      logger.error({ err, filepath }, '[Watcher] Failed to enqueue file');
    }
  });

  watcher.on('error', (err) => {
    logger.error({ err }, '[Watcher] Watcher error');
  });

  watcherStarted = true;
  logger.info({ watchDir: config.WATCH_DIR }, '[Watcher] Started');
}

export async function moveToArchive(filepath: string, filename: string): Promise<void> {
  try {
    const datePath = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const archiveSubDir = join(config.ARCHIVE_DIR, datePath);
    await mkdir(archiveSubDir, { recursive: true });

    const dest = join(archiveSubDir, filename);
    await rename(filepath, dest);
    logger.info({ src: filepath, dest }, '[Watcher] File archived');
  } catch (err) {
    // Non-fatal — file may have been deleted or moved already
    logger.warn({ err, filepath }, '[Watcher] Could not archive file');
  }
}
