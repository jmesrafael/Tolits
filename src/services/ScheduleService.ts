/**
 * Schedule lifecycle: default creation per drivetrain, interval edits,
 * enable/disable, baselines, custom components, drivetrain re-gating
 * (BUSINESS_RULES.md §2–§3, FEATURE_SPECIFICATIONS.md §5).
 */

import { inTransaction } from '@/db/client';
import { MaintenanceRepository } from '@/db/repositories/MaintenanceRepository';
import { OdometerRepository } from '@/db/repositories/OdometerRepository';
import { ScheduleRepository } from '@/db/repositories/ScheduleRepository';
import type { ScheduleRow } from '@/db/schema';
import { COMPONENT_DEFAULTS } from '@/db/seed/defaults';
import { emitDomainEvent } from '@/lib/events';
import { appError, err, ok, type Result } from '@/lib/result';
import type { ComponentType, DrivetrainType } from '@/types/enums';
import { OdometerService } from './OdometerService';
import {
  baselineInput,
  customComponentInput,
  scheduleEditInput,
  type ScheduleEditInput,
} from './validation/schemas';
import { guardService, validateWith } from './serviceUtils';

export const ScheduleService = {
  /** Auto-creates the drivetrain's default schedules (§2 matrix). Transaction owned by caller. */
  createDefaultsForBikeInTx(motorcycleId: string, drivetrain: DrivetrainType): void {
    for (const [componentType, config] of Object.entries(COMPONENT_DEFAULTS)) {
      const applicability = config.applicability[drivetrain];
      if (applicability === undefined) {
        continue;
      }
      ScheduleRepository.insert({
        motorcycleId,
        componentType: componentType as ComponentType,
        customName: null,
        intervalKm: config.intervalKm,
        intervalMonths: config.intervalMonths,
        isEnabled: applicability === 'enabled' ? 1 : 0,
      });
    }
  },

  /**
   * Drivetrain change re-gating (§5.5): newly inapplicable schedules are
   * disabled (never deleted — history remains); newly applicable missing
   * components are created with defaults.
   */
  regateForDrivetrainInTx(motorcycleId: string, drivetrain: DrivetrainType): void {
    const existing = ScheduleRepository.listByBike(motorcycleId);
    const byComponent = new Map(existing.map((s) => [s.componentType, s]));

    for (const [componentType, config] of Object.entries(COMPONENT_DEFAULTS)) {
      const applicability = config.applicability[drivetrain];
      const schedule = byComponent.get(componentType);
      if (applicability === undefined) {
        if (schedule !== undefined && schedule.isEnabled === 1) {
          ScheduleRepository.update(schedule.id, { isEnabled: 0 });
        }
      } else if (schedule === undefined) {
        ScheduleRepository.insert({
          motorcycleId,
          componentType: componentType as ComponentType,
          customName: null,
          intervalKm: config.intervalKm,
          intervalMonths: config.intervalMonths,
          isEnabled: applicability === 'enabled' ? 1 : 0,
        });
      }
    }
  },

  /** Interval/enable edits (S-13). */
  editSchedule(scheduleId: string, input: unknown): Result<void> {
    const parsed = validateWith(scheduleEditInput, input);
    if (!parsed.ok) {
      return parsed;
    }
    return guardService('schedule.edit', () => {
      const schedule = ScheduleRepository.getById(scheduleId);
      if (schedule === undefined) {
        return err(appError('BusinessRuleError', 'schedule.notFound', 'Schedule not found'));
      }
      const changes: ScheduleEditInput = parsed.value;
      if (schedule.componentType === 'custom' && changes.customName === null) {
        return err(
          appError('ValidationError', 'schedule.customNameRequired', 'Custom name required', {
            customName: 'required',
          }),
        );
      }
      inTransaction(() => {
        ScheduleRepository.update(scheduleId, {
          customName: schedule.componentType === 'custom' ? changes.customName : null,
          intervalKm: changes.intervalKm,
          intervalMonths: changes.intervalMonths,
          isEnabled: changes.isEnabled ? 1 : 0,
        });
      });
      emitDomainEvent('schedule:changed', { bikeId: schedule.motorcycleId, scheduleId });
      return ok(undefined);
    });
  },

  /** Adds a user custom component (unlimited, free — §5.2). */
  addCustomComponent(motorcycleId: string, input: unknown): Result<ScheduleRow> {
    const parsed = validateWith(customComponentInput, input);
    if (!parsed.ok) {
      return parsed;
    }
    return guardService('schedule.addCustom', () => {
      const row = inTransaction(() =>
        ScheduleRepository.insert({
          motorcycleId,
          componentType: 'custom',
          customName: parsed.value.customName,
          intervalKm: parsed.value.intervalKm,
          intervalMonths: parsed.value.intervalMonths,
          isEnabled: 1,
          sortOrder: ScheduleRepository.nextCustomSortOrder(motorcycleId),
        }),
      );
      emitDomainEvent('schedule:changed', { bikeId: motorcycleId, scheduleId: row.id });
      return ok(row);
    });
  },

  /** Deletes a custom component's schedule (built-ins are disabled, never deleted). */
  deleteCustomComponent(scheduleId: string): Result<void> {
    return guardService('schedule.deleteCustom', () => {
      const schedule = ScheduleRepository.getById(scheduleId);
      if (schedule === undefined) {
        return err(appError('BusinessRuleError', 'schedule.notFound', 'Schedule not found'));
      }
      if (schedule.componentType !== 'custom') {
        return err(
          appError('BusinessRuleError', 'schedule.notCustom', 'Built-in components cannot be deleted'),
        );
      }
      inTransaction(() => {
        ScheduleRepository.softDelete(scheduleId);
      });
      emitDomainEvent('schedule:changed', { bikeId: schedule.motorcycleId, scheduleId });
      return ok(undefined);
    });
  },

  /**
   * Batch-deletes several custom components in one transaction (item 13).
   * Soft delete only — maintenance history rows keep referencing the
   * (now-hidden) schedule via ON DELETE RESTRICT, so nothing historical is
   * ever silently lost; the UI confirmation is what explains this to the user
   * before calling here.
   */
  deleteCustomComponents(scheduleIds: readonly string[]): Result<void> {
    return guardService('schedule.deleteCustomBatch', () => {
      let bikeId: string | undefined;
      inTransaction(() => {
        for (const scheduleId of scheduleIds) {
          const schedule = ScheduleRepository.getById(scheduleId);
          if (schedule === undefined || schedule.componentType !== 'custom') {
            continue;
          }
          bikeId = schedule.motorcycleId;
          ScheduleRepository.softDelete(scheduleId);
        }
      });
      if (bikeId !== undefined) {
        emitDomainEvent('schedule:changed', { bikeId });
      }
      return ok(undefined);
    });
  },

  /** Persists a new drag-and-drop order for a bike's custom components (item 13). */
  reorderCustomComponents(motorcycleId: string, orderedScheduleIds: readonly string[]): Result<void> {
    return guardService('schedule.reorderCustom', () => {
      inTransaction(() => {
        orderedScheduleIds.forEach((id, index) => {
          ScheduleRepository.setSortOrder(id, index);
        });
      });
      emitDomainEvent('schedule:changed', { bikeId: motorcycleId });
      return ok(undefined);
    });
  },

  /** Pins/unpins a component as a Dashboard "Quick Logs" card (item 11). */
  setPinned(scheduleId: string, isPinned: boolean): Result<void> {
    return guardService('schedule.setPinned', () => {
      const schedule = ScheduleRepository.getById(scheduleId);
      if (schedule === undefined) {
        return err(appError('BusinessRuleError', 'schedule.notFound', 'Schedule not found'));
      }
      const nextOrder = isPinned ? ScheduleRepository.nextPinnedSortOrder(schedule.motorcycleId) : 0;
      inTransaction(() => {
        ScheduleRepository.setPinned(scheduleId, isPinned, nextOrder);
      });
      emitDomainEvent('schedule:changed', { bikeId: schedule.motorcycleId, scheduleId });
      return ok(undefined);
    });
  },

  /** Persists a new drag-and-drop order for a bike's pinned Quick Log cards. */
  reorderPinned(motorcycleId: string, orderedScheduleIds: readonly string[]): Result<void> {
    return guardService('schedule.reorderPinned', () => {
      inTransaction(() => {
        orderedScheduleIds.forEach((id, index) => {
          ScheduleRepository.setPinnedSortOrder(id, index);
        });
      });
      emitDomainEvent('schedule:changed', { bikeId: motorcycleId });
      return ok(undefined);
    });
  },

  /**
   * Baseline for an un-anchored schedule (§5.4): "when was this last done?".
   * The baseline never overrides a record anchor (records win — §4).
   */
  setBaseline(input: unknown): Result<void> {
    const parsed = validateWith(baselineInput, input);
    if (!parsed.ok) {
      return parsed;
    }
    const { scheduleId, lastDoneOdometerKm, lastDoneDate } = parsed.value;
    if (lastDoneOdometerKm === null && lastDoneDate === null) {
      return err(
        appError('ValidationError', 'baseline.empty', 'Enter an odometer or a date', {
          lastDoneOdometerKm: 'baseline.empty',
        }),
      );
    }
    return guardService('schedule.setBaseline', () => {
      const schedule = ScheduleRepository.getById(scheduleId);
      if (schedule === undefined) {
        return err(appError('BusinessRuleError', 'schedule.notFound', 'Schedule not found'));
      }
      if (schedule.anchorSource === 'record') {
        return err(
          appError('BusinessRuleError', 'baseline.hasRecords', 'This schedule already has history'),
        );
      }
      inTransaction(() => {
        ScheduleRepository.setAnchor(scheduleId, {
          anchorOdometerKm: lastDoneOdometerKm,
          anchorDate: lastDoneDate,
          anchorSource: 'baseline',
        });
      });
      emitDomainEvent('schedule:changed', { bikeId: schedule.motorcycleId, scheduleId });
      return ok(undefined);
    });
  },

  /**
   * "Just serviced today" (S-11): the date is known (today); the mileage is
   * recorded only if the user entered it. The bike's cached odometer is never
   * substituted — it is the LAST reading, possibly weeks old, not today's.
   * Without a mileage the baseline is date-only (time-dimension tracking).
   *
   * An entered mileage is today's actual meter reading, so it is also logged as
   * a manual odometer reading (same transaction as the baseline) — unless an
   * identical reading already exists for today (no duplicates). A value that
   * conflicts with the odometer history is rejected and nothing is saved.
   */
  markServicedToday(scheduleId: string, today: string, enteredOdometerKm: number | null): Result<void> {
    if (enteredOdometerKm === null) {
      return this.setBaseline({ scheduleId, lastDoneOdometerKm: null, lastDoneDate: today });
    }
    const parsed = validateWith(baselineInput, { scheduleId, lastDoneOdometerKm: enteredOdometerKm, lastDoneDate: today });
    if (!parsed.ok) {
      return parsed;
    }
    return guardService('schedule.servicedToday', () => {
      const schedule = ScheduleRepository.getById(scheduleId);
      if (schedule === undefined) {
        return err(appError('BusinessRuleError', 'schedule.notFound', 'Schedule not found'));
      }
      if (schedule.anchorSource === 'record') {
        return err(appError('BusinessRuleError', 'baseline.hasRecords', 'This schedule already has history'));
      }
      const bikeId = schedule.motorcycleId;
      const check = OdometerService.validateReading(bikeId, enteredOdometerKm, today);
      if (!check.ok) {
        return check;
      }
      const { effectiveKm, violation } = check.value;
      if (violation !== null) {
        const code = violation.kind === 'belowPrevious' ? 'odometer.belowPrevious' : 'odometer.aboveNext';
        return err(
          appError(
            'ValidationError',
            code,
            `Odometer reading conflicts with an earlier entry (${violation.neighborEffectiveKm} km on ${violation.neighborDate})`,
            { lastDoneOdometerKm: code },
          ),
        );
      }
      const latest = OdometerRepository.latest(bikeId);
      const alreadyLogged = latest !== undefined && latest.recordedDate === today && latest.effectiveKm === effectiveKm;
      inTransaction(() => {
        if (!alreadyLogged) {
          const odo = OdometerService.recordReadingInTx(bikeId, enteredOdometerKm, today, 'manual', null);
          if (!odo.ok) {
            throw new Error(odo.error.message); // pre-validated above; rolls the baseline back too
          }
        }
        ScheduleRepository.setAnchor(scheduleId, {
          anchorOdometerKm: effectiveKm,
          anchorDate: today,
          anchorSource: 'baseline',
        });
      });
      emitDomainEvent('schedule:changed', { bikeId, scheduleId });
      if (!alreadyLogged) {
        emitDomainEvent('odometer:changed', { bikeId });
      }
      return ok(undefined);
    });
  },

  /** Suppresses a schedule's notifications for 7 days (NOTIFICATION_ENGINE.md §6, S-05). */
  snooze(scheduleId: string, snoozedUntil: string): Result<void> {
    return guardService('schedule.snooze', () => {
      const schedule = ScheduleRepository.getById(scheduleId);
      if (schedule === undefined) {
        return err(appError('BusinessRuleError', 'schedule.notFound', 'Schedule not found'));
      }
      inTransaction(() => {
        ScheduleRepository.update(scheduleId, { snoozedUntil });
      });
      emitDomainEvent('schedule:changed', { bikeId: schedule.motorcycleId, scheduleId });
      return ok(undefined);
    });
  },

  /**
   * Re-anchors from the schedule's latest record (BUSINESS_RULES.md §4): any
   * record re-anchors regardless of service type. Falls back to the previous
   * baseline only if no record ever anchored. Runs inside the caller's transaction.
   */
  recomputeAnchorInTx(scheduleId: string): void {
    const schedule = ScheduleRepository.getById(scheduleId);
    if (schedule === undefined) {
      return;
    }
    const latest = MaintenanceRepository.latestForSchedule(scheduleId);
    if (latest !== undefined) {
      // Anchor km must be effective km — read it from the record's odometer log
      // (per-row offset honored, ADR-009); records without odometer anchor by date only.
      const odoLog = OdometerRepository.findBySourceId(latest.id);
      ScheduleRepository.setAnchor(scheduleId, {
        anchorOdometerKm: odoLog?.effectiveKm ?? null,
        anchorDate: latest.performedDate,
        anchorSource: 'record',
      });
      return;
    }
    if (schedule.anchorSource === 'record') {
      // Last record deleted and no baseline survives — honest unknown (§5.4).
      ScheduleRepository.setAnchor(scheduleId, {
        anchorOdometerKm: null,
        anchorDate: null,
        anchorSource: null,
      });
    }
  },
};
