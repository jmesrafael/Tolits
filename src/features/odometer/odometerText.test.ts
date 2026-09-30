import { buildOdometerSnapshot } from '@/services/odometerEstimate';
import { formatOdometerReference, initialOdometerField, parseOdometerField } from './odometerText';

describe('initialOdometerField — logging forms never pre-fill a stale reading', () => {
  test('new record starts empty (no last-known reading carried into today)', () => {
    expect(initialOdometerField(undefined)).toBe('');
    expect(initialOdometerField(null)).toBe('');
  });

  test("editing keeps the record's own stored reading", () => {
    expect(initialOdometerField(12345)).toBe('12345');
    expect(initialOdometerField(0)).toBe('0');
  });
});

describe('parseOdometerField — only what the user typed counts', () => {
  test('blank → unknown (null), never 0 or a substituted value', () => {
    expect(parseOdometerField('')).toBeNull();
    expect(parseOdometerField('   ')).toBeNull();
  });

  test('typed value → that number', () => {
    expect(parseOdometerField('12400')).toBe(12400);
    expect(parseOdometerField('0')).toBe(0);
  });
});

describe('formatOdometerReference — actual and estimate are labelled apart', () => {
  // formatMonthDay parses ISO dates as UTC (pre-existing), so allow the west-of-UTC rendering too.
  const AUG1 = '(Aug 0?1|Jul 31)';
  const history = [
    { effectiveKm: 11400, recordedDate: '2026-07-02' },
    { effectiveKm: 12000, recordedDate: '2026-08-01' },
  ];

  test('reading is current → shows the actual reading with its real date only', () => {
    const text = formatOdometerReference(buildOdometerSnapshot(12000, '2026-08-01', history, history, '2026-08-01'));
    expect(text).toMatch(new RegExp(`^Last reading: 12,000 km on ${AUG1}$`));
    expect(text).not.toContain('estimate');
  });

  test('stale reading → actual with its date, plus a separate "~… estimated today"', () => {
    const text = formatOdometerReference(buildOdometerSnapshot(12000, '2026-08-01', history, history, '2026-08-11'));
    expect(text).toMatch(new RegExp(`^Last reading: 12,000 km on ${AUG1} · ~12,200 km estimated today$`));
  });

  test('low-confidence estimate says "rough estimate"', () => {
    // Measured history only in the 90-day window → low confidence, 20 km/day.
    const text = formatOdometerReference(buildOdometerSnapshot(12000, '2026-08-01', [], history, '2026-08-11'));
    expect(text).toContain('~12,200 km rough estimate today');
  });

  test('no riding history → asks for another reading, shows no invented estimate', () => {
    const text = formatOdometerReference(buildOdometerSnapshot(12000, '2026-08-01', [], [], '2026-08-11'));
    expect(text).toContain('add another reading to estimate current mileage');
    expect(text).not.toContain('~');
  });

  test('no reading → says so instead of inventing one', () => {
    expect(formatOdometerReference(null)).toBe('No odometer reading yet');
    expect(formatOdometerReference(buildOdometerSnapshot(0, null, [], [], '2026-08-11'))).toBe('No odometer reading yet');
  });
});
