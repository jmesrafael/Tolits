/**
 * Odometer rules — BUSINESS_RULES.md §6. Owns the odometer_logs aggregate,
 * the motorcycles.current_odometer_km cache, and meter-replacement offsets
 * (ADR-009). Single writer for this aggregate (SQLITE_GUIDE.md §5).
 */

import { inTransaction } from '@/db/client';
import { MotorcycleRepository } from '@/db/repositories/MotorcycleRepository';
import { OdometerRepository } from '@/db/repositories/OdometerRepository';
import type { OdometerLogRow } from '@/db/schema';
import { addDays } from '@/lib/dates';
import { emitDomainEvent } from '@/lib/events';
import { appError, err, ok, type Result } from '@/lib/result';
import type { OdometerSource } from '@/types/enums';
import { buildOdometerSnapshot, type OdometerSnapshot } from './odometerEstimate';
import { odometerReadingInput } from './validation/schemas';
import { guardService, validateWith } from './serviceUtils';

export interface MonotonicityViolation {
  /** 'belowPrevious' → correction options incl. meter replacement (§6.3). */
  kind: 'belowPrevious' | 'aboveNext';
  neighborEffectiveKm: number;
  neighborDate: string;
}

/**
 * Validates a prospective effective reading against its date-ordered neighbors
 * (§6.2). Returns the violation so the UI can offer the three §6.3 options.
 */
function checkMonotonicity(
  motorcycleId: string,
  effectiveKm: number,
  recordedDate: string,
  excludeLogId?: string,
): MonotonicityViolation | null {
  const before = OdometerRepository.latestBefore(motorcycleId, recordedDate, excludeLogId);
  if (before !== undefined && effectiveKm < before.effectiveKm) {
    return {
      kind: 'belowPrevious',
      neighborEffectiveKm: before.effectiveKm,
      neighborDate: before.recordedDate,
    };
  }
  const after = OdometerRepository.earliestAfter(motorcycleId, recordedDate, excludeLogId);
  if (after !== undefined && effectiveKm > after.effectiveKm) {
    return {
      kind: 'aboveNext',
      neighborEffectiveKm: after.effectiveKm,
      neighborDate: after.recordedDate,
    };
  }
  return null;
}

function violationError(violation: MonotonicityViolation) {
  return appError(
    'ValidationError',
    violation.kind === 'belowPrevious' ? 'odometer.belowPrevious' : 'odometer.aboveNext',
    `Odometer reading conflicts with the ${violation.kind === 'belowPrevious' ? 'previous' : 'next'} entry (${violation.neighborEffectiveKm} km on ${violation.neighborDate})`,
    { odometerKm: violation.kind === 'belowPrevious' ? 'odometer.belowPrevious' : 'odometer.aboveNext' },
  );
}

export const OdometerService = {
  /**
   * Last actual reading + its recorded date + the live estimate for today
   * (read-only — nothing is persisted). Every screen and the reminder planner
   * read "current mileage" through this so they agree.
   */
  getSnapshot(motorcycleId: string, today: string): OdometerSnapshot | null {
    const bike = MotorcycleRepository.getById(motorcycleId);
    if (bike === undefined) {
      return null;
    }
    const latest = OdometerRepository.latest(motorcycleId);
    // Rate windows end at the latest reading, not today: a regular rider's
    // history shouldn't fall out of the window just because days passed.
    // Staleness is judged separately (FRESH_READING_DAYS in computeDailyKmRate).
    const windowEnd = latest?.recordedDate ?? today;
    return buildOdometerSnapshot(
      bike.currentOdometerKm,
      latest?.recordedDate ?? null,
      OdometerRepository.listInWindow(motorcycleId, addDays(windowEnd, -30), windowEnd),
      OdometerRepository.listInWindow(motorcycleId, addDays(windowEnd, -90), windowEnd),
      today,
    );
  },

  /**
   * Pre-validates a raw reading for a bike+date (used by every odometer-bearing
   * form before save). Returns the violation for fix-it UI, or the effective km.
   */
  validateReading(
    motorcycleId: string,
    readingKm: number,
    recordedDate: string,
  ): Result<{ effectiveKm: number; violation: MonotonicityViolation | null }> {
    const bike = MotorcycleRepository.getById(motorcycleId);
    if (bike === undefined) {
      return err(appError('BusinessRuleError', 'bike.notFound', 'Motorcycle not found'));
    }
    const effectiveKm = readingKm + bike.odometerOffsetKm;
    return ok({ effectiveKm, violation: checkMonotonicity(motorcycleId, effectiveKm, recordedDate) });
  },

  /**
   * Inserts an odometer log + maintains the cache. MUST run inside the calling
   * service's transaction (DATA_FLOW.md §3 step 3). Effective km is computed
   * with the offset at insert (ADR-009).
   */
  recordReadingInTx(
    motorcycleId: string,
    readingKm: number,
    recordedDate: string,
    source: OdometerSource,
    sourceId: string | null,
  ): Result<OdometerLogRow> {
    const bike = MotorcycleRepository.getById(motorcycleId);
    if (bike === undefined) {
      return err(appError('BusinessRuleError', 'bike.notFound', 'Motorcycle not found'));
    }
    const effectiveKm = readingKm + bike.odometerOffsetKm;
    const violation = checkMonotonicity(motorcycleId, effectiveKm, recordedDate);
    if (violation !== null) {
      return err(violationError(violation));
    }
    const row = OdometerRepository.insert({
      motorcycleId,
      readingKm,
      effectiveKm,
      recordedDate,
      source,
      sourceId,
    });
    refreshCacheInTx(motorcycleId);
    return ok(row);
  },

  /** Manual odometer update (S-25 / R-12). Owns its transaction + events. */
  logManualReading(motorcycleId: string, input: unknown): Result<OdometerLogRow> {
    const parsed = validateWith(odometerReadingInput, input);
    if (!parsed.ok) {
      return parsed;
    }
    return guardService('odometer.logManual', () => {
      const result = inTransaction(() =>
        this.recordReadingInTx(
          motorcycleId,
          parsed.value.readingKm,
          parsed.value.recordedDate,
          'manual',
          null,
        ),
      );
      if (result.ok) {
        emitDomainEvent('odometer:changed', { bikeId: motorcycleId });
      }
      return result;
    });
  },

  /**
   * Meter replacement (§6.4): the bike's offset becomes current_effective_max − n,
   * then the new reading is logged with the new offset (history stays consistent).
   */
  replaceMeter(motorcycleId: string, newMeterReadingKm: number, recordedDate: string): Result<OdometerLogRow> {
    if (!Number.isInteger(newMeterReadingKm) || newMeterReadingKm < 0 || newMeterReadingKm > 999_999) {
      return err(
        appError('ValidationError', 'odometer.invalid', 'Invalid meter reading', {
          readingKm: 'odometer.invalid',
        }),
      );
    }
    return guardService('odometer.replaceMeter', () => {
      const result = inTransaction((): Result<OdometerLogRow> => {
        const bike = MotorcycleRepository.getById(motorcycleId);
        if (bike === undefined) {
          return err(appError('BusinessRuleError', 'bike.notFound', 'Motorcycle not found'));
        }
        const currentMax = OdometerRepository.maxEffective(motorcycleId);
        const newOffset = currentMax - newMeterReadingKm;
        MotorcycleRepository.update(motorcycleId, { odometerOffsetKm: newOffset });
        const row = OdometerRepository.insert({
          motorcycleId,
          readingKm: newMeterReadingKm,
          effectiveKm: newMeterReadingKm + newOffset,
          recordedDate,
          source: 'manual',
          sourceId: null,
        });
        refreshCacheInTx(motorcycleId);
        return ok(row);
      });
      if (result.ok) {
        emitDomainEvent('odometer:changed', { bikeId: motorcycleId });
      }
      return result;
    });
  },

  /**
   * Edits a log row's reading (S-25b corrections). The row keeps its original
   * per-row offset — recovered as effective − reading (ADR-009 / §6.5).
   */
  editReading(logId: string, newReadingKm: number): Result<void> {
    return guardService('odometer.editReading', () => {
      const result = inTransaction((): Result<{ bikeId: string }> => {
        const row = OdometerRepository.getById(logId);
        if (row === undefined) {
          return err(appError('BusinessRuleError', 'odometer.logNotFound', 'Odometer entry not found'));
        }
        const rowOffset = row.effectiveKm - row.readingKm;
        const newEffective = newReadingKm + rowOffset;
        const violation = checkMonotonicity(row.motorcycleId, newEffective, row.recordedDate, logId);
        if (violation !== null) {
          return err(violationError(violation));
        }
        OdometerRepository.update(logId, { readingKm: newReadingKm, effectiveKm: newEffective });
        refreshCacheInTx(row.motorcycleId);
        return ok({ bikeId: row.motorcycleId });
      });
      if (!result.ok) {
        return result;
      }
      emitDomainEvent('odometer:changed', { bikeId: result.value.bikeId });
      return ok(undefined);
    });
  },

  /** Soft-deletes a log entry; the cache recomputes if the max was removed (§6.5). */
  deleteReading(logId: string): Result<void> {
    return guardService('odometer.deleteReading', () => {
      const result = inTransaction((): Result<{ bikeId: string }> => {
        const row = OdometerRepository.getById(logId);
        if (row === undefined) {
          return err(appError('BusinessRuleError', 'odometer.logNotFound', 'Odometer entry not found'));
        }
        OdometerRepository.softDelete(logId);
        refreshCacheInTx(row.motorcycleId);
        return ok({ bikeId: row.motorcycleId });
      });
      if (!result.ok) {
        return result;
      }
      emitDomainEvent('odometer:changed', { bikeId: result.value.bikeId });
      return ok(undefined);
    });
  },

  /** Removes the odometer log tied to a deleted source row (record/fuel/repair edits). */
  removeBySourceInTx(motorcycleId: string, sourceId: string): void {
    const row = OdometerRepository.findBySourceId(sourceId);
    if (row !== undefined) {
      OdometerRepository.softDelete(row.id);
    }
    refreshCacheInTx(motorcycleId);
  },
};

/** Cache = max effective km (§6.1). Called inside a transaction only. */
function refreshCacheInTx(motorcycleId: string): void {
  MotorcycleRepository.setOdometerCache(motorcycleId, OdometerRepository.maxEffective(motorcycleId));
}
