/**
 * In-app Reminders list items (S-05) — pure. Status comes from the same
 * odometer snapshot the dashboard uses; the overdue notification state comes
 * from the same projection + nag policy the OS planner uses, so the list can
 * say when an overdue item will get no more notifications instead of going
 * silently quiet (NOTIFICATION_ENGINE.md §6).
 */

import type { ScheduleRow } from '@/db/schema';
import type { OdometerSnapshot } from './odometerEstimate';
import { daysBetween } from '@/lib/dates';
import { type DueProjection, overdueNotificationsEnded, projectDue } from './ReminderPlanner';
import { computeScheduleStatus, type ScheduleStatus } from './StatusService';

export interface ReminderItem {
  schedule: ScheduleRow;
  bikeId: string;
  bikeNickname: string;
  bucket: 'overdue' | 'thisWeek' | 'later';
  /** Full status — display text goes through formatRemaining (never a raw negative number). */
  status: ScheduleStatus;
  remainingKm: number | null;
  /** remainingKm was computed from an estimated (not freshly read) odometer. */
  kmIsEstimate: boolean;
  remainingDays: number | null;
  /** Overdue items: the projected due date the nag policy counts from; null otherwise. */
  overdueSince: string | null;
  /** Overdue and past the last scheduled nag — no further notifications will be sent. */
  notificationsEnded: boolean;
}

export interface ReminderBike {
  id: string;
  nickname: string;
  currentOdometerKm: number;
}

const THIS_WEEK_DAYS = 7;

/**
 * Buckets keep their meaning: Overdue = status overdue; This week = due within
 * 7 days; Later = due soon but further out. "Due in" is the governing
 * dimension's due date: a km item's projected date (it has no calendar date),
 * a time item's calendar due date. Without a projection (no odometer data) the
 * time dimension's remaining days are the only date available.
 */
function bucketFor(
  status: ScheduleStatus,
  projection: DueProjection | null,
  todayIso: string,
): ReminderItem['bucket'] {
  if (status.status === 'overdue') {
    return 'overdue';
  }
  const daysUntilDue =
    projection !== null ? daysBetween(todayIso, projection.dueDateIso) : (status.remainingDays ?? Infinity);
  return daysUntilDue <= THIS_WEEK_DAYS ? 'thisWeek' : 'later';
}

export function buildReminderItems(
  bike: ReminderBike,
  schedules: readonly ScheduleRow[],
  snapshot: OdometerSnapshot | null,
  todayIso: string,
): ReminderItem[] {
  const currentKm = snapshot?.statusKm ?? bike.currentOdometerKm;
  const kmIsEstimate = snapshot?.statusIsEstimate ?? false;
  const items: ReminderItem[] = [];
  for (const schedule of schedules) {
    if (schedule.isEnabled !== 1 || (schedule.snoozedUntil !== null && schedule.snoozedUntil >= todayIso)) {
      continue;
    }
    const status = computeScheduleStatus(schedule, currentKm, todayIso);
    if (status.status !== 'dueSoon' && status.status !== 'overdue') {
      continue;
    }
    // The due date of whichever dimension governs — km items get theirs from the
    // same rate projection the OS planner uses (they have no calendar date).
    const projection =
      snapshot !== null
        ? projectDue(
            schedule,
            {
              id: bike.id,
              nickname: bike.nickname,
              currentOdometerKm: snapshot.actualKm,
              lastReadingDate: snapshot.actualDate,
              isArchived: 0,
            },
            todayIso,
            snapshot.rate,
          )
        : null;
    let overdueSince: string | null = null;
    let notificationsEnded = false;
    if (status.status === 'overdue' && projection !== null && projection.dueDateIso <= todayIso) {
      overdueSince = projection.dueDateIso;
      notificationsEnded = schedule.isMuted === 1 || overdueNotificationsEnded(projection.dueDateIso, todayIso);
    }
    items.push({
      schedule,
      bikeId: bike.id,
      bikeNickname: bike.nickname,
      bucket: bucketFor(status, projection, todayIso),
      status,
      remainingKm: status.remainingKm,
      kmIsEstimate,
      remainingDays: status.remainingDays,
      overdueSince,
      notificationsEnded,
    });
  }
  return items;
}
