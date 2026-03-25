import { prisma } from '../config/db';
import { cache } from '../config/redis';
import { logger } from '../config/logger';
import { parseXlsxFile, computeRowHash } from '../parser/xlsxParser';
import { validateRows, flagFutureDates } from '../validation/rowValidator';
import type { NormalisedRow, RowError } from '../parser/adapter.interface';
import { emitImportEvent } from '../jobs/wsEmitter';

// ─────────────────────────────────────────────────────────────────────────────
// ImportService
//
// The single orchestration layer that takes a file path and drives the full
// ingest pipeline: parse → validate → dedup → batch upsert → log.
// ─────────────────────────────────────────────────────────────────────────────

export interface ImportOptions {
  filepath: string;
  filename: string;
  triggeredBy?: string;
}

export interface ImportSummary {
  importLogId: string;
  status: string;
  totalRows: number;
  parsedRows: number;
  skippedRows: number;
  errorRows: number;
  adapterUsed: string;
}

export async function runImport(options: ImportOptions): Promise<ImportSummary> {
  const { filepath, filename, triggeredBy = 'auto' } = options;
  logger.info({ filename, triggeredBy }, '[ImportService] Starting import');

  // Create an import log entry immediately — status = PROCESSING
  const importLog = await prisma.importLog.create({
    data: { filename, fileHash: 'pending', status: 'PROCESSING', triggeredBy },
  });

  emitImportEvent('IMPORT_STARTED', { importLogId: importLog.id, filename, processedRows: 0, totalRows: 0, percent: 0 });

  try {
    // ── 1. Parse ──────────────────────────────────────────────────────────────
    const { result, fileHash, adapterUsed } = await parseXlsxFile(filepath, filename);

    // Check if this exact file was already imported
    const duplicate = await prisma.importLog.findFirst({
      where: { fileHash, status: { in: ['SUCCESS', 'PARTIAL'] } },
    });
    if (duplicate) {
      await prisma.importLog.update({
        where: { id: importLog.id },
        data: {
          status: 'FAILED',
          fileHash,
          completedAt: new Date(),
          notes: `Duplicate file — already imported as ${duplicate.id} on ${duplicate.startedAt.toISOString()}`,
        },
      });
      throw new Error(`File already imported: ${duplicate.id}`);
    }

    await prisma.importLog.update({
      where: { id: importLog.id },
      data: { fileHash, totalRows: result.totalRawRows },
    });

    // ── 2. Validate ────────────────────────────────────────────────────────────
    const { valid: validated, errors: validationErrors } = validateRows(result.rows);
    const { clean, future } = flagFutureDates(validated);

    if (future.length > 0) {
      logger.warn({ count: future.length }, '[ImportService] Future-dated rows skipped');
    }

    // Combine parse + validation errors
    const allErrors: RowError[] = [...result.errors, ...validationErrors];

    // ── 3. Dedup + batch write ─────────────────────────────────────────────────
    const { written, skipped } = await batchUpsert(clean, importLog.id);

    // ── 4. Write parse errors ──────────────────────────────────────────────────
    if (allErrors.length > 0) {
      await prisma.parseError.createMany({
        data: allErrors.map((e) => ({
          importLogId: importLog.id,
          rowNumber: e.rowNumber,
          rawData: JSON.stringify(e.rawData),
          errorCode: e.errorCode,
          errorMessage: e.errorMessage,
        })),
      });
    }

    // ── 5. Finalise import log ─────────────────────────────────────────────────
    const status =
      allErrors.length > 0 && written === 0
        ? 'FAILED'
        : allErrors.length > 0
        ? 'PARTIAL'
        : 'SUCCESS';

    await prisma.importLog.update({
      where: { id: importLog.id },
      data: {
        status,
        parsedRows: written,
        skippedRows: skipped + future.length,
        errorRows: allErrors.length,
        completedAt: new Date(),
        notes: adapterUsed,
      },
    });

    // ── 6. Bust relevant caches ───────────────────────────────────────────────
    await cache.delPattern('attendance:*');
    await cache.delPattern('summary:*');

    emitImportEvent('IMPORT_COMPLETED', {
      importLogId: importLog.id,
      filename,
      processedRows: written,
      totalRows: result.totalRawRows,
      percent: 100,
    });

    logger.info(
      { importLogId: importLog.id, status, written, skipped, errors: allErrors.length },
      '[ImportService] Import complete',
    );

    return {
      importLogId: importLog.id,
      status,
      totalRows: result.totalRawRows,
      parsedRows: written,
      skippedRows: skipped,
      errorRows: allErrors.length,
      adapterUsed,
    };
  } catch (err) {
    const e = err as Error;
    logger.error({ err: e.message, importLogId: importLog.id }, '[ImportService] Import failed');

    await prisma.importLog.update({
      where: { id: importLog.id },
      data: { status: 'FAILED', completedAt: new Date(), notes: e.message },
    }).catch(() => {}); // don't throw again if update fails

    emitImportEvent('IMPORT_FAILED', {
      importLogId: importLog.id,
      filename,
      processedRows: 0,
      totalRows: 0,
      percent: 0,
    });

    await prisma.systemEvent.create({
      data: {
        type: 'IMPORT_FAILED',
        severity: 'ERROR',
        message: `Import failed: ${filename}`,
        metadata: { error: e.message, importLogId: importLog.id },
      },
    }).catch(() => {});

    throw err;
  }
}

// ── Batch upsert with dedup ───────────────────────────────────────────────────

const BATCH_SIZE = 500;

async function batchUpsert(
  rows: NormalisedRow[],
  importLogId: string,
): Promise<{ written: number; skipped: number }> {
  let written = 0;
  let skipped = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);

    // Compute hashes for the batch
    const withHashes = batch.map((row) => ({
      row,
      hash: computeRowHash(row.studentId, row.date, row.firstPunchIn),
    }));

    // Find which hashes already exist
    const existingHashes = await prisma.attendanceRecord
      .findMany({
        where: { rawHash: { in: withHashes.map((r) => r.hash) } },
        select: { rawHash: true },
      })
      .then((records) => new Set(records.map((r) => r.rawHash)));

    const toInsert = withHashes.filter(({ hash }) => !existingHashes.has(hash));
    skipped += withHashes.length - toInsert.length;

    if (toInsert.length > 0) {
      await prisma.attendanceRecord.createMany({
        data: toInsert.map(({ row, hash }) => ({
          studentId: row.studentId,
          studentName: row.studentName,
          rollNumber: row.rollNumber,
          department: row.department,
          className: row.className,
          section: row.section,
          date: row.date,
          firstPunchIn: row.firstPunchIn,
          lastPunchOut: row.lastPunchOut,
          status: row.status,
          sourceFile: importLogId,
          importLogId,
          rawHash: hash,
        })),
        skipDuplicates: true,
      });
      written += toInsert.length;
    }

    emitImportEvent('IMPORT_PROGRESS', {
      importLogId,
      filename: '',
      processedRows: i + batch.length,
      totalRows: rows.length,
      percent: Math.round(((i + batch.length) / rows.length) * 100),
    });
  }

  return { written, skipped };
}
