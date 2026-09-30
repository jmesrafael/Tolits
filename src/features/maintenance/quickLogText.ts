import { addDays, todayIso } from '@/lib/dates';
import { formatKm, formatMonthYear } from '@/lib/format';
import type { ScheduleStatus } from '@/services/StatusService';

/**
 * Quick Log card "next due" line (item 11): km or month, whichever dimension
 * governs (ScheduleStatus already picks the one nearer to expiring —
 * BUSINESS_RULES.md §4).
 * Km: "About …" only when the status was computed from an estimated odometer
 * (`kmIsEstimate`, from the shared OdometerService snapshot — the same flag
 * every other screen uses); from a fresh actual reading it's stated plainly.
 * Months are always "About" (month-level rounding of the due date).
 */
export function formatQuickLogDue(status: ScheduleStatus, kmIsEstimate = false, today = todayIso()): string {
  if (status.governs === 'km' && status.remainingKm !== null) {
    const about = kmIsEstimate ? 'About ' : '';
    if (status.remainingKm === 0) {
      return kmIsEstimate ? 'About due now' : 'Due now';
    }
    return status.remainingKm > 0
      ? `${about}${formatKm(status.remainingKm)} left`
      : `${about}${formatKm(Math.abs(status.remainingKm))} overdue`;
  }
  if (status.governs === 'days' && status.remainingDays !== null) {
    const dueIso = addDays(today, status.remainingDays);
    return status.remainingDays >= 0
      ? `About ${formatMonthYear(dueIso)}`
      : `Overdue since about ${formatMonthYear(dueIso)}`;
  }
  return 'Not set up yet';
}
