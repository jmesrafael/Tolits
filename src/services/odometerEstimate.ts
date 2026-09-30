/**
 * Actual vs. estimated odometer — pure. The last ACTUAL reading (value + the
 * date it was recorded) is data; the estimated current reading is derived
 * live from it with the single daily-km rate (FuelService.computeDailyKmRate)
 * and is never written back as a reading (NOTIFICATION_ENGINE.md §4).
 *
 * No riding history (rate = the 25 km/day default assumption): there is no
 * evidence the bike moved at all, so no mileage estimate is produced — a parked
 * bike must not drift into "due" on an assumption. The UI asks for another
 * reading instead (`needsMoreReadings`).
 */

import { daysBetween } from '@/lib/dates';
import { computeDailyKmRate, type DailyRateResult, projectOdometer, type RateReading } from './FuelService';

export interface OdometerSnapshot {
  /** Last actual reading, effective km (the motorcycles.current_odometer_km cache). */
  actualKm: number;
  /** Date that actual reading was recorded; null when the bike has no readings. */
  actualDate: string | null;
  /** Whole days since the actual reading; null when there is no reading date. */
  daysSinceReading: number | null;
  rate: DailyRateResult;
  /**
   * Estimated current reading; null when no time has passed (the actual value
   * is current) or when there is no measured riding history to estimate from.
   */
  estimatedKm: number | null;
  /** True when `statusKm` is an estimate — every "~"/"estimated" label keys off this. */
  statusIsEstimate: boolean;
  /** The km that "needs a current mileage" math uses: the estimate when present, else the actual. */
  statusKm: number;
  /** Time has passed but there's no riding history to estimate from — ask for another reading. */
  needsMoreReadings: boolean;
}

/**
 * @param logs30d readings in the 30 days ending at `actualDate` (see OdometerService.getSnapshot)
 * @param logs90d readings in the 90 days ending at `actualDate`
 */
export function buildOdometerSnapshot(
  actualKm: number,
  actualDate: string | null,
  logs30d: readonly RateReading[],
  logs90d: readonly RateReading[],
  todayIso: string,
): OdometerSnapshot {
  const daysSinceReading = actualDate !== null ? Math.max(0, daysBetween(actualDate, todayIso)) : null;
  const rate = computeDailyKmRate(logs30d, logs90d, daysSinceReading);
  const timePassed = daysSinceReading !== null && daysSinceReading > 0;
  const measured = rate.source !== 'default';
  const projected = projectOdometer(actualKm, actualDate, rate, todayIso);
  const estimatedKm = timePassed && measured && projected > actualKm ? projected : null;
  return {
    actualKm,
    actualDate,
    daysSinceReading,
    rate,
    estimatedKm,
    statusIsEstimate: estimatedKm !== null,
    statusKm: estimatedKm ?? actualKm,
    needsMoreReadings: timePassed && !measured,
  };
}
