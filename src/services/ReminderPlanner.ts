/**
 * ReminderPlanner — pure planning function per NOTIFICATION_ENGINE.md.
 * `planReminders(input, nowMs) → PlanEntry[]` takes already-fetched rows and
 * settings, and returns the full desired notification plan. No DB, no
 * expo-notifications: fully unit-testable (NOTIFICATION_ENGINE.md §5).
 * `NotificationScheduler` gathers the input and executes the plan against the OS.
 *
 * Scope note: `backup_reminder` entries are not generated yet — the backup
 * feature (M8, BackupService) doesn't exist, so there is no `last_backup_at`
 * to reason about (see docs/PROGRESS.md). The "already expired at save time,
 * one immediate notification" edge case (§7) is also deferred — it requires
 * persisted "already notified" state this pure planner intentionally doesn't
 * carry; only the 30/7/1-day lead-time reminders for not-yet-expired
 * documents are implemented.
 */

import type { DocumentRow, ScheduleRow } from '@/db/schema';
import { addDays, daysBetween, intervalDaysFromMonths, parseIsoDate, toIsoDate } from '@/lib/dates';
import { type DocType, EXPIRY_DOC_TYPES } from '@/types/enums';
import { DEFAULT_DAILY_KM_RATE, type DailyRateResult, projectOdometer } from './FuelService';

export type NotificationType = 'maintenance_due' | 'maintenance_overdue' | 'document_expiry' | 'backup_reminder';

export const REMINDER_CAP_PER_BIKE = 12;
export const REMINDER_CAP_TOTAL = 48;
export const OVERDUE_NAG_MAX = 3;
export const OVERDUE_NAG_INTERVAL_DAYS = 7;
export const KM_LEAD_DAYS = 3;
export const TIME_LEAD_DAYS = 7;

export interface QuietHours {
  /** 'HH:MM' local, 24h. */
  start: string;
  end: string;
}

export interface NotificationPrefs {
  maintenance_due: boolean;
  maintenance_overdue: boolean;
  document_expiry: boolean;
  backup_reminder: boolean;
}

export interface ReminderSettings {
  /** 'HH:MM' local, 24h — default fire time for all reminder types (§3). */
  fireTime: string;
  /** null disables quiet-hours shifting entirely. */
  quietHours: QuietHours | null;
  prefs: NotificationPrefs;
}

export const DEFAULT_REMINDER_SETTINGS: ReminderSettings = {
  fireTime: '08:00',
  quietHours: { start: '21:00', end: '07:00' },
  prefs: {
    maintenance_due: true,
    maintenance_overdue: true,
    document_expiry: true,
    backup_reminder: true,
  },
};

export interface PlanEntry {
  /** Stable dedup/persistence key: `${sourceType}:${sourceId}:${notificationType}:${fireDateIso}`. */
  key: string;
  sourceType: 'schedule' | 'document';
  sourceId: string;
  bikeId: string | null;
  notificationType: NotificationType;
  fireAtMs: number;
  fireDateIso: string;
  data: {
    bikeNickname: string | null;
    componentType?: string;
    customName?: string | null;
    /** Which dimension the due projection is governed by (copy layer needs this to phrase km vs. days). */
    governs?: 'km' | 'days';
    remainingKm?: number | null;
    remainingDays?: number | null;
    lowConfidence?: boolean;
    docType?: DocType;
    docTitle?: string;
  };
}

export interface PlannerBike {
  id: string;
  nickname: string;
  /** Last ACTUAL odometer reading (effective km) — the motorcycles cache, never an estimate. */
  currentOdometerKm: number;
  /** Date of that last actual reading; null when unknown (treated as today — nothing to project). */
  lastReadingDate: string | null;
  isArchived: number;
}

export interface PlannerInput {
  bikes: readonly PlannerBike[];
  /** Enabled/disabled/muted schedules for each bike — filtering happens inside the planner. */
  schedulesByBike: Readonly<Record<string, readonly ScheduleRow[]>>;
  /** Daily-km rate per bike (FuelService.computeDailyKmRate output); missing entries fall back to the default. */
  rateByBike: Readonly<Record<string, DailyRateResult>>;
  documents: readonly DocumentRow[];
  settings: ReminderSettings;
}

export interface DueProjection {
  dueDateIso: string;
  governs: 'km' | 'days';
  lowConfidence: boolean;
  /** Remaining as of today (km: estimated from the last actual reading). */
  remainingKm: number | null;
  remainingDays: number | null;
  /** Remaining km on a given day — notification copy uses the value for its own fire date. */
  remainingKmAt: (dateIso: string) => number | null;
  remainingDaysAt: (dateIso: string) => number | null;
}

/**
 * Km-due projection (NOTIFICATION_ENGINE.md §4), anchored on the date of the
 * last ACTUAL reading rather than today: the km remaining at that reading are
 * spent at `rate` starting from that date. Projecting from today instead would
 * push the due date later every day the user doesn't log.
 *
 * Exception — no riding history (rate source 'default'): there is no evidence
 * the bike moved since its reading, so no riding is assumed for the elapsed
 * days; the rough default rate only projects forward from today. A parked bike
 * therefore never becomes "overdue" on an assumption — only its actual
 * remaining km (or its time interval) can make it overdue.
 */
export function projectDue(
  schedule: ScheduleRow,
  bike: PlannerBike,
  todayIso: string,
  rateInfo: DailyRateResult,
): DueProjection | null {
  let kmDue: { dateIso: string; remainingKmAt: (dateIso: string) => number } | null = null;
  if (schedule.intervalKm !== null && schedule.anchorOdometerKm !== null) {
    const intervalKm = schedule.intervalKm;
    const anchorKm = schedule.anchorOdometerKm;
    const readingDate =
      bike.lastReadingDate !== null && bike.lastReadingDate <= todayIso ? bike.lastReadingDate : todayIso;
    const baseDate = rateInfo.source === 'default' ? todayIso : readingDate;
    const remainingAtReading = intervalKm - (bike.currentOdometerKm - anchorKm);
    kmDue = {
      dateIso: addDays(baseDate, Math.ceil(remainingAtReading / rateInfo.rate)),
      remainingKmAt: (dateIso) =>
        intervalKm - (projectOdometer(bike.currentOdometerKm, baseDate, rateInfo, dateIso) - anchorKm),
    };
  }

  let timeDue: { dateIso: string; remainingDaysAt: (dateIso: string) => number } | null = null;
  if (schedule.intervalMonths !== null && schedule.anchorDate !== null) {
    const dueDateIso = addDays(schedule.anchorDate, intervalDaysFromMonths(schedule.intervalMonths));
    timeDue = { dateIso: dueDateIso, remainingDaysAt: (dateIso) => daysBetween(dateIso, dueDateIso) };
  }

  if (kmDue === null && timeDue === null) {
    return null;
  }
  const remainingKmAt = (dateIso: string) => kmDue?.remainingKmAt(dateIso) ?? null;
  const remainingDaysAt = (dateIso: string) => timeDue?.remainingDaysAt(dateIso) ?? null;
  const kmGoverns = kmDue !== null && (timeDue === null || kmDue.dateIso <= timeDue.dateIso);
  return {
    dueDateIso: kmGoverns ? kmDue!.dateIso : timeDue!.dateIso,
    governs: kmGoverns ? 'km' : 'days',
    lowConfidence: kmGoverns && rateInfo.confidence === 'low',
    remainingKm: remainingKmAt(todayIso),
    remainingDays: remainingDaysAt(todayIso),
    remainingKmAt,
    remainingDaysAt,
  };
}

/**
 * Overdue nag policy (§6): at most OVERDUE_NAG_MAX notifications, weekly from
 * the due date. The single source for both the planner and the in-app list.
 */
export function overdueNagDates(dueDateIso: string): string[] {
  return Array.from({ length: OVERDUE_NAG_MAX }, (_, i) => addDays(dueDateIso, i * OVERDUE_NAG_INTERVAL_DAYS));
}

/**
 * True once every overdue nag date is in the past: the item is still overdue
 * but no further notification will be sent — the UI must say so rather than
 * let it go silently quiet (and a future catch-up flow can list these).
 */
export function overdueNotificationsEnded(dueDateIso: string, todayIso: string): boolean {
  return overdueNagDates(dueDateIso).every((d) => d < todayIso);
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function isWithinQuietHours(time: string, quietHours: QuietHours): boolean {
  const t = timeToMinutes(time);
  const s = timeToMinutes(quietHours.start);
  const e = timeToMinutes(quietHours.end);
  if (s === e) {
    return false;
  }
  return s < e ? t >= s && t < e : t >= s || t < e;
}

/**
 * NOTIFICATION_ENGINE.md §6: a fire time inside quiet hours moves to 08:00.
 * Implementation note: the spec's literal "(or user fire time if later)" is
 * ambiguous when the user's own fire time is what caused the conflict in the
 * first place — read literally it can resolve back to a time still inside
 * quiet hours. We instead guarantee the shifted time never lands in quiet
 * hours: prefer 08:00, and only fall back further (to the end of the quiet
 * window) if even 08:00 is inside a customized window.
 */
function effectiveFireTime(fireTime: string, quietHours: QuietHours | null): string {
  if (quietHours === null || !isWithinQuietHours(fireTime, quietHours)) {
    return fireTime;
  }
  if (!isWithinQuietHours('08:00', quietHours)) {
    return '08:00';
  }
  return quietHours.end;
}

function combineDateTime(dateIso: string, time: string): number {
  const [h, m] = time.split(':').map(Number);
  const date = parseIsoDate(dateIso);
  date.setHours(h ?? 8, m ?? 0, 0, 0);
  return date.getTime();
}

function makeEntry(
  notificationType: NotificationType,
  sourceType: PlanEntry['sourceType'],
  sourceId: string,
  bikeId: string | null,
  fireDateIso: string,
  settings: ReminderSettings,
  data: PlanEntry['data'],
): PlanEntry {
  const fireTime = effectiveFireTime(settings.fireTime, settings.quietHours);
  return {
    key: `${sourceType}:${sourceId}:${notificationType}:${fireDateIso}`,
    sourceType,
    sourceId,
    bikeId,
    notificationType,
    fireAtMs: combineDateTime(fireDateIso, fireTime),
    fireDateIso,
    data,
  };
}

const PRIORITY: Record<NotificationType, number> = {
  maintenance_overdue: 0,
  document_expiry: 1,
  maintenance_due: 2,
  backup_reminder: 3,
};

function applyCaps(entries: readonly PlanEntry[]): PlanEntry[] {
  const sorted = [...entries].sort((a, b) => {
    const p = PRIORITY[a.notificationType] - PRIORITY[b.notificationType];
    return p !== 0 ? p : a.fireAtMs - b.fireAtMs;
  });
  const perBike = new Map<string, number>();
  const kept: PlanEntry[] = [];
  for (const entry of sorted) {
    if (kept.length >= REMINDER_CAP_TOTAL) {
      break;
    }
    if (entry.bikeId !== null) {
      const count = perBike.get(entry.bikeId) ?? 0;
      if (count >= REMINDER_CAP_PER_BIKE) {
        continue;
      }
      perBike.set(entry.bikeId, count + 1);
    }
    kept.push(entry);
  }
  return kept;
}

export function planReminders(input: PlannerInput, nowMs: number): PlanEntry[] {
  const today = toIsoDate(new Date(nowMs));
  const entries: PlanEntry[] = [];

  for (const bike of input.bikes) {
    if (bike.isArchived === 1) {
      continue;
    }
    const schedules = input.schedulesByBike[bike.id] ?? [];
    const rateInfo: DailyRateResult = input.rateByBike[bike.id] ?? {
      rate: DEFAULT_DAILY_KM_RATE,
      confidence: 'low',
      source: 'default',
    };

    for (const schedule of schedules) {
      if (schedule.isEnabled !== 1 || schedule.isMuted === 1) {
        continue;
      }
      if (schedule.snoozedUntil !== null && schedule.snoozedUntil >= today) {
        continue;
      }
      const projection = projectDue(schedule, bike, today, rateInfo);
      if (projection === null) {
        continue;
      }
      const daysUntilDue = daysBetween(today, projection.dueDateIso);
      // Copy values are computed for each notification's own fire date, so the
      // text matches the estimate when it is shown rather than when planned.
      const dataFor = (fireDateIso: string): PlanEntry['data'] => ({
        bikeNickname: bike.nickname,
        componentType: schedule.componentType,
        customName: schedule.customName,
        governs: projection.governs,
        remainingKm: projection.remainingKmAt(fireDateIso),
        remainingDays: projection.remainingDaysAt(fireDateIso),
        lowConfidence: projection.lowConfidence,
      });

      if (daysUntilDue <= 0) {
        if (!input.settings.prefs.maintenance_overdue) {
          continue;
        }
        const occurrences = overdueNagDates(projection.dueDateIso).filter((d) => d >= today);
        for (const dateIso of occurrences) {
          entries.push(
            makeEntry('maintenance_overdue', 'schedule', schedule.id, bike.id, dateIso, input.settings, dataFor(dateIso)),
          );
        }
      } else {
        if (!input.settings.prefs.maintenance_due) {
          continue;
        }
        const leadDays = projection.governs === 'km' ? KM_LEAD_DAYS : TIME_LEAD_DAYS;
        if (daysUntilDue > leadDays) {
          continue;
        }
        const candidates = [addDays(projection.dueDateIso, -leadDays), projection.dueDateIso].filter(
          (d) => d >= today,
        );
        for (const dateIso of candidates) {
          entries.push(
            makeEntry('maintenance_due', 'schedule', schedule.id, bike.id, dateIso, input.settings, dataFor(dateIso)),
          );
        }
      }
    }
  }

  if (input.settings.prefs.document_expiry) {
    for (const doc of input.documents) {
      if (!EXPIRY_DOC_TYPES.includes(doc.docType as DocType) || doc.expiryDate === null) {
        continue;
      }
      if (doc.expiryDate < today) {
        continue; // already-expired one-off is deferred (see file header)
      }
      const candidates = [30, 7, 1].map((d) => addDays(doc.expiryDate!, -d)).filter((d) => d >= today);
      for (const dateIso of candidates) {
        entries.push(
          makeEntry('document_expiry', 'document', doc.id, doc.motorcycleId, dateIso, input.settings, {
            bikeNickname: null,
            docType: doc.docType as DocType,
            docTitle: doc.title,
          }),
        );
      }
    }
  }

  // §5 step 3 "drop past dates", applied to the actual fire instant: an entry
  // for today whose fire time (after quiet-hours shifting) has already passed
  // is dropped, not moved — the next occurrence (a later overdue nag, the due
  // day after a lead-day entry) is already in the plan, and the in-app list
  // shows the item meanwhile. Caps apply after this, so past entries never
  // take a slot from a future one.
  const upcoming = entries.filter((e) => e.fireAtMs > nowMs);

  // De-dup defensively (construction should already guarantee unique keys).
  const seen = new Set<string>();
  const deduped = upcoming.filter((e) => {
    if (seen.has(e.key)) {
      return false;
    }
    seen.add(e.key);
    return true;
  });

  return applyCaps(deduped);
}
