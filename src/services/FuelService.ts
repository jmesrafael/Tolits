/**
 * Fuel mathematics — the single implementation of BUSINESS_RULES.md §7.
 * Pure functions over chronological fuel rows + odometer windows.
 */

import type { FuelLogRow } from '@/db/schema';
import { addDays, daysBetween } from '@/lib/dates';

/** Spans with km ≤ 0 or km > 2,000 are excluded as implausible (A-07). */
const MAX_PLAUSIBLE_SPAN_KM = 2000;

export interface ConsumptionSpan {
  /** id of the closing full-tank fill. */
  fillId: string;
  km: number;
  liters: number;
  kmPerLiter: number;
}

/**
 * Full-to-full consumption spans (§7.2): km between consecutive full-tank
 * fills; liters = every fill after span start up to and including span end.
 * Input must be chronological (fuel_date asc). Odometer values are effective km
 * — fuel rows store the entered reading; effective conversion happens at save
 * (offset applies per row; see OdometerService).
 */
export function computeSpans(chronological: readonly FuelLogRow[]): ConsumptionSpan[] {
  const spans: ConsumptionSpan[] = [];
  let spanStart: FuelLogRow | null = null;
  let litersSinceStart = 0;

  for (const fill of chronological) {
    if (spanStart !== null) {
      litersSinceStart += fill.liters;
      if (fill.isFullTank === 1) {
        const km = fill.odometerKm - spanStart.odometerKm;
        if (km > 0 && km <= MAX_PLAUSIBLE_SPAN_KM && litersSinceStart > 0) {
          spans.push({
            fillId: fill.id,
            km,
            liters: litersSinceStart,
            kmPerLiter: km / litersSinceStart,
          });
        }
      }
    }
    if (fill.isFullTank === 1) {
      spanStart = fill;
      litersSinceStart = 0;
    }
  }
  return spans;
}

/** Displayed km/L = mean of the last 5 valid spans (§7.3); null with no spans. */
export function averageKmPerLiter(spans: readonly ConsumptionSpan[]): number | null {
  const recent = spans.slice(-5);
  if (recent.length === 0) {
    return null;
  }
  return recent.reduce((sum, s) => sum + s.kmPerLiter, 0) / recent.length;
}

/**
 * Fuel cost/km (§7.3): Σ fuel cost / km over trailing 90 days when ≥ 2 odometer
 * readings exist there; otherwise lifetime; otherwise null ("—").
 */
export function fuelCostPerKm(
  fills: readonly FuelLogRow[],
  todayIso: string,
): number | null {
  const from = addDays(todayIso, -90);
  const windowFills = fills.filter((f) => f.fuelDate >= from);
  const chosen = windowFills.length >= 2 ? windowFills : fills;
  if (chosen.length < 2) {
    return null;
  }
  const odos = chosen.map((f) => f.odometerKm);
  const km = Math.max(...odos) - Math.min(...odos);
  if (km <= 0) {
    return null;
  }
  const cost = chosen.reduce((sum, f) => sum + f.totalCostCentavos, 0);
  return cost / km;
}

export const DEFAULT_DAILY_KM_RATE = 25;
export const MIN_DAILY_KM_RATE = 5;
export const MAX_DAILY_KM_RATE = 300;
/**
 * A measured 30-day rate stays high-confidence until the latest reading is
 * older than this; after that the rider's pattern may have changed.
 */
export const FRESH_READING_DAYS = 30;

/** The minimal odometer-log shape the rate needs (OdometerLogRow satisfies it). */
export interface RateReading {
  effectiveKm: number;
  recordedDate: string;
}

export interface DailyRateResult {
  /** km/day, clamped to [5, 300]. */
  rate: number;
  /** 'low' when the 90-day fallback or the default was used (§7.5) — copy says "around". */
  confidence: 'high' | 'low';
  /** Where the rate came from: measured (30d / 90d window) or the assumed default. */
  source: 'window30' | 'window90' | 'default';
}

/**
 * Km/day measured over one window: distance between the lowest and highest
 * reading ÷ days between the first and last reading date. Null when the window
 * has fewer than 2 readings on distinct dates — same-day readings carry no
 * elapsed-time information, so they can't measure a rate.
 */
function rateOverWindow(readings: readonly RateReading[]): number | null {
  if (readings.length < 2) {
    return null;
  }
  const dates = readings.map((r) => r.recordedDate);
  const firstDate = dates.reduce((a, b) => (a < b ? a : b));
  const lastDate = dates.reduce((a, b) => (a > b ? a : b));
  const spanDays = daysBetween(firstDate, lastDate);
  if (spanDays <= 0) {
    return null;
  }
  const kms = readings.map((r) => r.effectiveKm);
  return (Math.max(...kms) - Math.min(...kms)) / spanDays;
}

function clampRate(rate: number): number {
  return Math.min(MAX_DAILY_KM_RATE, Math.max(MIN_DAILY_KM_RATE, rate));
}

/**
 * Daily-km rate (§7.5) — the ONE implementation, used by reminder projection,
 * status/Health Score estimates, and the estimated-odometer display.
 * 30-day window of odometer logs ending at the LATEST reading (the caller
 * anchors the windows there, so time passing alone doesn't empty them); not
 * measurable → widen to 90 days; still not measurable → default 25 km/day.
 * Clamped to [5, 300]. The rate is the distance ÷ the days actually spanned by
 * the readings (not ÷ the full window length, which under-states sparse loggers).
 * Confidence: 'high' only for a measured 30-day rate whose latest reading is at
 * most FRESH_READING_DAYS old (`daysSinceLastReading`, omitted = fresh).
 */
export function computeDailyKmRate(
  logs30d: readonly RateReading[],
  logs90d: readonly RateReading[],
  daysSinceLastReading: number | null = null,
): DailyRateResult {
  const r30 = rateOverWindow(logs30d);
  if (r30 !== null) {
    const fresh = daysSinceLastReading === null || daysSinceLastReading <= FRESH_READING_DAYS;
    return { rate: clampRate(r30), confidence: fresh ? 'high' : 'low', source: 'window30' };
  }
  const r90 = rateOverWindow(logs90d);
  if (r90 !== null) {
    return { rate: clampRate(r90), confidence: 'low', source: 'window90' };
  }
  return { rate: DEFAULT_DAILY_KM_RATE, confidence: 'low', source: 'default' };
}

/**
 * Estimated current odometer (NOTIFICATION_ENGINE.md §4): last ACTUAL reading
 * + rate × days elapsed since that reading's date, rounded to 10 km. With no
 * reading date there is nothing to project from, so the actual value is
 * returned unchanged. Computed live; never persisted as a reading.
 */
export function projectOdometer(
  lastActualKm: number,
  lastReadingDate: string | null,
  rate: DailyRateResult,
  todayIso: string,
): number {
  if (lastReadingDate === null) {
    return lastActualKm;
  }
  const days = Math.max(0, daysBetween(lastReadingDate, todayIso));
  if (days === 0) {
    return lastActualKm;
  }
  return Math.round((lastActualKm + rate.rate * days) / 10) * 10;
}
