import type { FuelLogRow } from '@/db/schema';
import {
  averageKmPerLiter,
  computeDailyKmRate,
  computeSpans,
  DEFAULT_DAILY_KM_RATE,
  projectOdometer,
  type DailyRateResult,
} from './FuelService';

function makeFill(overrides: Partial<FuelLogRow>): FuelLogRow {
  return {
    id: overrides.id ?? 'fill-1',
    createdAt: 0,
    updatedAt: 0,
    deletedAt: null,
    motorcycleId: 'bike-1',
    fuelDate: '2026-01-01',
    liters: 4,
    totalCostCentavos: 20000,
    odometerKm: 1000,
    station: null,
    isFullTank: 1,
    notes: null,
    ...overrides,
  };
}

describe('computeSpans — BUSINESS_RULES.md §7.2', () => {
  test('simple full-to-full span', () => {
    const fills = [
      makeFill({ id: 'a', odometerKm: 1000, liters: 4, fuelDate: '2026-01-01' }),
      makeFill({ id: 'b', odometerKm: 1200, liters: 5, fuelDate: '2026-01-10' }),
    ];
    const spans = computeSpans(fills);
    expect(spans).toHaveLength(1);
    expect(spans[0]?.km).toBe(200);
    expect(spans[0]?.liters).toBe(5);
    expect(spans[0]?.kmPerLiter).toBeCloseTo(40, 5);
  });

  test('partial fills between full tanks sum into the span', () => {
    const fills = [
      makeFill({ id: 'a', odometerKm: 1000, liters: 4, fuelDate: '2026-01-01', isFullTank: 1 }),
      makeFill({ id: 'mid', odometerKm: 1100, liters: 2, fuelDate: '2026-01-05', isFullTank: 0 }),
      makeFill({ id: 'b', odometerKm: 1200, liters: 3, fuelDate: '2026-01-10', isFullTank: 1 }),
    ];
    const spans = computeSpans(fills);
    expect(spans).toHaveLength(1);
    expect(spans[0]?.liters).toBe(5); // mid (2) + closing (3)
    expect(spans[0]?.km).toBe(200);
  });

  test('implausible span (> 2000 km) excluded (A-07)', () => {
    const fills = [
      makeFill({ id: 'a', odometerKm: 1000, fuelDate: '2026-01-01' }),
      makeFill({ id: 'b', odometerKm: 5000, fuelDate: '2026-01-10' }),
    ];
    expect(computeSpans(fills)).toHaveLength(0);
  });

  test('non-positive span excluded', () => {
    const fills = [
      makeFill({ id: 'a', odometerKm: 1000, fuelDate: '2026-01-01' }),
      makeFill({ id: 'b', odometerKm: 1000, fuelDate: '2026-01-10' }),
    ];
    expect(computeSpans(fills)).toHaveLength(0);
  });
});

describe('averageKmPerLiter — mean of last 5 valid spans (§7.3)', () => {
  test('averages only the trailing 5', () => {
    const spans = [10, 20, 30, 40, 50, 60].map((kmPerLiter, i) => ({
      fillId: `f${i}`,
      km: 100,
      liters: 100 / kmPerLiter,
      kmPerLiter,
    }));
    // last 5: 20,30,40,50,60 → mean 40
    expect(averageKmPerLiter(spans)).toBeCloseTo(40, 5);
  });

  test('no spans → null', () => {
    expect(averageKmPerLiter([])).toBeNull();
  });
});

const reading = (effectiveKm: number, recordedDate: string) => ({ effectiveKm, recordedDate });

describe('computeDailyKmRate — the one daily-km formula (BUSINESS_RULES.md §7.5)', () => {
  test('known distance over known days: km ÷ days actually spanned by the readings', () => {
    // 300 km between Mar 1 and Mar 11 → 30 km/day
    const r = computeDailyKmRate([reading(20000, '2026-03-01'), reading(20300, '2026-03-11')], []);
    expect(r).toEqual({ rate: 30, confidence: 'high', source: 'window30' });
  });

  test('readings close together are not diluted by the unused rest of the window', () => {
    // 150 km in 5 days = 30 km/day. The retired window formula gave 150/30 = 5 km/day.
    const r = computeDailyKmRate([reading(10000, '2026-03-20'), reading(10150, '2026-03-25')], []);
    expect(r.rate).toBeCloseTo(30, 5);
  });

  test('readings far apart use the full span between them', () => {
    // 900 km over 60 days, only the 90-day window has them → 15 km/day, low confidence
    const r = computeDailyKmRate([reading(20900, '2026-03-01')], [reading(20000, '2026-01-01'), reading(20900, '2026-03-02')]);
    expect(r).toEqual({ rate: 15, confidence: 'low', source: 'window90' });
  });

  test('middle readings do not change the rate (max − min over first → last date)', () => {
    const r = computeDailyKmRate(
      [reading(1000, '2026-03-01'), reading(1100, '2026-03-03'), reading(1400, '2026-03-11')],
      [],
    );
    expect(r.rate).toBeCloseTo(40, 5);
  });

  test('insufficient readings → 90-day window → default 25 km/day, low confidence', () => {
    expect(computeDailyKmRate([reading(1000, '2026-03-01')], [reading(1000, '2026-03-01')])).toEqual({
      rate: DEFAULT_DAILY_KM_RATE,
      confidence: 'low',
      source: 'default',
    });
    expect(computeDailyKmRate([], [])).toEqual({ rate: 25, confidence: 'low', source: 'default' });
  });

  test('zero elapsed time (all readings on one date) cannot measure a rate → falls through', () => {
    const sameDay = [reading(1000, '2026-03-01'), reading(1040, '2026-03-01')];
    expect(computeDailyKmRate(sameDay, []).source).toBe('default');
    // …but a measurable 90-day window is still used.
    const r = computeDailyKmRate(sameDay, [reading(400, '2026-02-01'), ...sameDay]);
    expect(r.source).toBe('window90');
    expect(r.rate).toBeCloseTo(640 / 28, 5);
  });

  test('clamped to [5, 300]', () => {
    expect(computeDailyKmRate([reading(1000, '2026-03-01'), reading(1000, '2026-03-21')], []).rate).toBe(5);
    expect(computeDailyKmRate([reading(0, '2026-03-01'), reading(100000, '2026-03-02')], []).rate).toBe(300);
  });

  test('input order does not matter', () => {
    const a = computeDailyKmRate([reading(1300, '2026-03-11'), reading(1000, '2026-03-01')], []);
    expect(a.rate).toBeCloseTo(30, 5);
  });
});

describe('projectOdometer — estimate from the last ACTUAL reading', () => {
  const rate: DailyRateResult = { rate: 30, confidence: 'high', source: 'window30' };

  test('adds rate × days elapsed since the reading date, rounded to 10 km', () => {
    expect(projectOdometer(12000, '2026-03-01', rate, '2026-03-11')).toBe(12300);
    expect(projectOdometer(12003, '2026-03-01', { ...rate, rate: 7.4 }, '2026-03-04')).toBe(12030); // 12025.2 → 12030
  });

  test('no elapsed time → the actual value, unchanged (not rounded)', () => {
    expect(projectOdometer(12003, '2026-03-11', rate, '2026-03-11')).toBe(12003);
  });

  test('no reading date → nothing to project from → actual value', () => {
    expect(projectOdometer(12003, null, rate, '2026-03-11')).toBe(12003);
  });

  test('a reading dated after "today" never projects backwards', () => {
    expect(projectOdometer(12000, '2026-03-12', rate, '2026-03-11')).toBe(12000);
  });
});

describe('computeDailyKmRate — confidence follows the age of the latest reading', () => {
  const window = [reading(1000, '2026-03-01'), reading(1300, '2026-03-11')];

  test('omitted age (callers anchoring nothing) keeps the measured 30-day rate high', () => {
    expect(computeDailyKmRate(window, []).confidence).toBe('high');
  });

  test('boundary: 30 days since the latest reading is still high, 31 is low', () => {
    expect(computeDailyKmRate(window, [], 0).confidence).toBe('high');
    expect(computeDailyKmRate(window, [], 30).confidence).toBe('high');
    expect(computeDailyKmRate(window, [], 31)).toEqual({ rate: 30, confidence: 'low', source: 'window30' });
  });

  test('90-day and default rates are low confidence regardless of age', () => {
    expect(computeDailyKmRate([], window, 0).confidence).toBe('low');
    expect(computeDailyKmRate([], [], 0).confidence).toBe('low');
  });
});
