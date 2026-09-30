import { formatOdometerReference } from '@/features/odometer/odometerText';
import { buildOdometerSnapshot } from '@/services/odometerEstimate';
import { deepMerge } from '../deepMerge';
import { strings as en } from '../strings';
import { fil } from './fil';
import { id } from './id';
import { th } from './th';
import { vi } from './vi';

/** The estimate-related dashboard strings must be translated in every supported locale. */
const LOCALES = { fil, vi, id, th };

const KEYS: [string, (s: typeof en) => string][] = [
  ['dashboard.odometer.noReading', (s) => s.dashboard.odometer.noReading],
  ['dashboard.odometer.estimated', (s) => s.dashboard.odometer.estimated],
  ['dashboard.odometer.estimatedRough', (s) => s.dashboard.odometer.estimatedRough],
  ['dashboard.odometer.needsReading', (s) => s.dashboard.odometer.needsReading],
  ['dashboard.health.estimated', (s) => s.dashboard.health.estimated],
  // In-screen captions introduced with the estimate work (forms, odometer, component detail, reminders, settings).
  ['odometerReference.none', (s) => s.odometerReference.none],
  ['odometerReference.actual', (s) => s.odometerReference.actual],
  ['odometerReference.withEstimate', (s) => s.odometerReference.withEstimate],
  ['odometerReference.withRoughEstimate', (s) => s.odometerReference.withRoughEstimate],
  ['odometerReference.needsReading', (s) => s.odometerReference.needsReading],
  ['odometerReference.optionalHint', (s) => s.odometerReference.optionalHint],
  ['odometerReference.requiredError', (s) => s.odometerReference.requiredError],
  ['baseline.notSetUp', (s) => s.baseline.notSetUp],
  ['baseline.needsKm', (s) => s.baseline.needsKm],
  ['remindersList.notificationsEnded', (s) => s.remindersList.notificationsEnded],
  ['dataPrivacy.deleted', (s) => s.dataPrivacy.deleted],
  ['dataPrivacy.deletedFilesRemain', (s) => s.dataPrivacy.deletedFilesRemain],
];

/** Every English key in these namespaces must be covered by the list above (catches a new caption left untranslated). */
test('the key list covers every caption in the migrated namespaces', () => {
  const listed = new Set(KEYS.map(([key]) => key));
  for (const ns of ['odometerReference', 'baseline', 'remindersList', 'dataPrivacy'] as const) {
    for (const key of Object.keys(en[ns])) {
      expect(listed.has(`${ns}.${key}`)).toBe(true);
    }
  }
});

const placeholders = (text: string) => (text.match(/\{\w+\}/g) ?? []).sort();

describe.each(Object.entries(LOCALES))('%s estimate strings', (_name, locale) => {
  const merged = deepMerge(en, locale);

  test.each(KEYS)('%s is translated (not the English fallback) and non-empty', (_key, get) => {
    expect(get(merged).trim()).not.toBe('');
    expect(get(merged)).not.toBe(get(en));
  });

  test.each(KEYS)('%s keeps the same interpolation placeholders', (_key, get) => {
    expect(placeholders(get(merged))).toEqual(placeholders(get(en)));
  });

  test('the merge still falls back to English for keys the locale does not override', () => {
    expect(merged.dashboard.odometer.title).toBe(en.dashboard.odometer.title);
    expect(merged.dashboard.health.caption).toBe(en.dashboard.health.caption);
  });
});

test('the odometer caption renders as one whole localized template (no English fragments)', () => {
  const history = [
    { effectiveKm: 11400, recordedDate: '2026-07-02' },
    { effectiveKm: 12000, recordedDate: '2026-08-01' },
  ];
  const snapshot = buildOdometerSnapshot(12000, '2026-08-01', history, history, '2026-08-11');
  const text = formatOdometerReference(snapshot, deepMerge(en, fil));
  expect(text).toBe('Huling reading: 12,000 km noong Aug 1 · ~12,200 km tantiya ngayon');
  expect(text).not.toMatch(/Last reading|estimated today/);
});
