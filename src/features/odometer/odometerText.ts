import { interpolate, strings as en } from '@/i18n/strings';
import { formatKm, formatMonthDay } from '@/lib/format';
import type { OdometerSnapshot } from '@/services/odometerEstimate';

/**
 * Initial value of an odometer field on a logging form. A NEW record starts
 * EMPTY: pre-filling the last known reading would let a plain "Save" record an
 * old value as today's actual reading. An edited record keeps its own stored
 * value (that value is already the user's own entry for that record).
 */
export function initialOdometerField(existingRecordKm: number | null | undefined): string {
  return existingRecordKm !== null && existingRecordKm !== undefined ? String(existingRecordKm) : '';
}

/** Odometer field text → km the user actually entered, or null when left blank (mileage unknown). */
export function parseOdometerField(value: string): number | null {
  const trimmed = value.trim();
  return trimmed !== '' ? Number(trimmed) : null;
}

/**
 * Reference caption under an odometer field / on the odometer screen:
 * "Last reading: 12,000 km on Aug 1 · ~12,650 km estimated today". The
 * estimate is context for the user only — it is never filled into the field.
 * Picks one whole localized template (LOCALIZATION.md §3: no fragment
 * concatenation); pass the `useStrings()` dictionary from components.
 */
export function formatOdometerReference(snapshot: OdometerSnapshot | null, strings: typeof en = en): string {
  const t = strings.odometerReference;
  if (snapshot === null || snapshot.actualDate === null) {
    return t.none;
  }
  const values = { km: formatKm(snapshot.actualKm), date: formatMonthDay(snapshot.actualDate) };
  if (snapshot.needsMoreReadings) {
    return interpolate(t.needsReading, values);
  }
  if (snapshot.estimatedKm === null) {
    return interpolate(t.actual, values);
  }
  const template = snapshot.rate.confidence === 'low' ? t.withRoughEstimate : t.withEstimate;
  return interpolate(template, { ...values, estimate: formatKm(snapshot.estimatedKm) });
}
