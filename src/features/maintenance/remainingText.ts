import { formatKm } from '@/lib/format';
import type { ScheduleStatus } from '@/services/StatusService';

/**
 * "in X km" / "in Y days" / "due now" / "overdue by X" — whichever dimension
 * governs (BUSINESS_RULES.md §4). Never renders a negative distance: the signed
 * remaining value stays in ScheduleStatus for the business logic.
 * `kmIsEstimate`: the status was computed from an estimated current odometer
 * (not a fresh actual reading), so km figures are shown as approximate ("~").
 */
export function formatRemaining(status: ScheduleStatus, kmIsEstimate = false): string {
  if (status.governs === null) {
    return 'Not set up';
  }
  if (status.governs === 'km' && status.remainingKm !== null) {
    const approx = kmIsEstimate ? '~' : '';
    if (status.remainingKm === 0) {
      return 'due now';
    }
    return status.remainingKm > 0
      ? `in ${approx}${formatKm(status.remainingKm)}`
      : `overdue by ${approx}${formatKm(Math.abs(status.remainingKm))}`;
  }
  if (status.governs === 'days' && status.remainingDays !== null) {
    const days = status.remainingDays;
    if (days === 0) {
      return 'due today';
    }
    return days > 0 ? `in ${days} day${days === 1 ? '' : 's'}` : `overdue by ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'}`;
  }
  return 'Not set up';
}
