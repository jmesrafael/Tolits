/**
 * Quick Add against real services + repositories on the real migration SQL
 * (better-sqlite3 stand-in for expo-sqlite). Verifies Quick Add writes the same
 * records the detailed forms write, and that schedules, Money and fuel math see them.
 */

import * as client from '@/db/client';
import { ExpenseRepository } from '@/db/repositories/ExpenseRepository';
import { FuelRepository } from '@/db/repositories/FuelRepository';
import { MaintenanceRepository } from '@/db/repositories/MaintenanceRepository';
import { ScheduleRepository } from '@/db/repositories/ScheduleRepository';
import { clearAllTables } from '@/test/sqliteTestClient';
import { averageKmPerLiter, computeSpans } from './FuelService';
import { MotorcycleService } from './MotorcycleService';
import { classifyQuickAdd, parseTargetKey, type QuickAddTarget } from './QuickAddClassifier';
import { QuickAddService, type QuickAddInput } from './QuickAddService';

jest.mock('@/db/client', () =>
  jest.requireActual<typeof import('@/test/sqliteTestClient')>('@/test/sqliteTestClient').createTestClient(),
);
jest.mock('@/lib/uuid', () => ({
  newUuid: () => jest.requireActual<typeof import('crypto')>('crypto').randomUUID(),
}));

const sqlite = (client as unknown as { __sqlite: import('better-sqlite3').Database }).__sqlite;

function setToday(iso: string): void {
  jest.setSystemTime(new Date(`${iso}T10:00:00`));
}

function seedBike(currentOdometerKm = 12000): string {
  setToday('2026-08-11');
  const bike = MotorcycleService.createBike({
    nickname: 'Red Click',
    brand: 'Honda',
    model: 'Click 125',
    year: null,
    drivetrainType: 'cvt',
    plateNumber: null,
    vin: null,
    engineNumber: null,
    purchaseDate: null,
    purchasePriceCentavos: null,
    currentOdometerKm,
    photoPath: null,
  });
  if (!bike.ok) {
    throw new Error(bike.error.message);
  }
  return bike.value.id;
}

/** Mirrors what the form sends: the classifier's target unless the rider overrode it. */
function quick(
  bikeId: string,
  text: string,
  amountCentavos: number,
  extra: Partial<QuickAddInput> & { override?: string } = {},
) {
  const { override, ...rest } = extra;
  const target: QuickAddTarget =
    (override !== undefined ? parseTargetKey(override) : null) ?? classifyQuickAdd(text).target;
  return QuickAddService.save(bikeId, {
    title: text,
    amountCentavos,
    date: '2026-08-11',
    target,
    ...rest,
  });
}

function countRows(table: string, bikeId: string): number {
  const row = sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE motorcycle_id = ?`).get(bikeId) as { n: number };
  return row.n;
}

beforeEach(() => {
  clearAllTables(sqlite);
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('QuickAddService: routing', () => {
  test('Motul 10W-40 ₱450 → one maintenance record, resets the engine oil schedule, no duplicate expense', () => {
    const bikeId = seedBike();
    const oil = ScheduleRepository.findByBikeComponent(bikeId, 'engine_oil')!;

    const result = quick(bikeId, 'Motul 10W-40', 45000, { odometerKm: 12100 });
    expect(result).toMatchObject({ ok: true, value: { record: 'maintenance', componentType: 'engine_oil' } });

    const latest = MaintenanceRepository.latestForSchedule(oil.id);
    expect(MaintenanceRepository.countForSchedule(oil.id)).toBe(1);
    expect(latest).toMatchObject({ costCentavos: 45000, brand: 'Motul 10W-40', odometerKm: 12100 });

    // The existing schedule logic moved the anchor (the "last maintained" state).
    const after = ScheduleRepository.getById(oil.id);
    expect(after?.anchorDate).toBe('2026-08-11');
    expect(after?.anchorOdometerKm).toBe(12100);
    expect(countRows('expenses', bikeId)).toBe(0);
  });

  test('maintenance cost is counted exactly once in Money', () => {
    const bikeId = seedBike();
    expect(quick(bikeId, 'Motul 10W-40', 45000, { odometerKm: 12100 }).ok).toBe(true);

    const rows = ExpenseRepository.listUnified({ motorcycleId: bikeId });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ source: 'maintenance', amountCentavos: 45000 });
    expect(ExpenseRepository.unionTotal(bikeId)).toBe(45000);
    expect(ExpenseRepository.sourceTotals(bikeId)).toMatchObject({ maintenance: 45000, expense: 0 });
  });

  test('missing odometer never blocks a maintenance save and writes no odometer reading', () => {
    const bikeId = seedBike();
    const logsBefore = countRows('odometer_logs', bikeId);
    const result = quick(bikeId, 'oil change', 40000);
    expect(result.ok).toBe(true);
    const oil = ScheduleRepository.findByBikeComponent(bikeId, 'engine_oil')!;
    expect(MaintenanceRepository.latestForSchedule(oil.id)?.odometerKm).toBeNull();
    expect(countRows('odometer_logs', bikeId)).toBe(logsBefore);
  });

  test('explicit component override saves to that component, not the one the text suggests', () => {
    const bikeId = seedBike();
    // "gulong" stays ambiguous, so the rider picks Tire · rear in the picker.
    const result = quick(bikeId, 'gulong', 250000, { override: 'maintenance:tire_rear', odometerKm: 12100 });
    expect(result).toMatchObject({ ok: true, value: { record: 'maintenance', componentType: 'tire_rear' } });

    const rear = ScheduleRepository.findByBikeComponent(bikeId, 'tire_rear')!;
    const front = ScheduleRepository.findByBikeComponent(bikeId, 'tire_front')!;
    expect(MaintenanceRepository.countForSchedule(rear.id)).toBe(1);
    expect(MaintenanceRepository.countForSchedule(front.id)).toBe(0);
  });

  test('ambiguous tire input without an override is a plain expense and resets nothing', () => {
    const bikeId = seedBike();
    const result = quick(bikeId, 'gulong', 250000);
    expect(result).toMatchObject({ ok: true, value: { record: 'expense', category: 'tires' } });
    for (const s of ScheduleRepository.listByBike(bikeId)) {
      expect(MaintenanceRepository.countForSchedule(s.id)).toBe(0);
    }
  });

  test('Helmet ₱2500 → plain expense in the accessories category', () => {
    const bikeId = seedBike();
    expect(quick(bikeId, 'Helmet', 250000).ok).toBe(true);
    const [row] = ExpenseRepository.listUnified({ motorcycleId: bikeId });
    expect(row).toMatchObject({ source: 'expense', title: 'Helmet', category: 'accessories', amountCentavos: 250000 });
  });

  test('Petron ₱500 with 8.2 L → fuel log', () => {
    const bikeId = seedBike();
    const result = quick(bikeId, 'Petron', 50000, { liters: 8.2, odometerKm: 12150 });
    expect(result).toMatchObject({ ok: true, value: { record: 'fuel' } });
    const [log] = FuelRepository.listByBike(bikeId, 10);
    expect(log).toMatchObject({ liters: 8.2, totalCostCentavos: 50000, odometerKm: 12150, station: 'Petron' });
  });

  test('date override is stored instead of today', () => {
    const bikeId = seedBike();
    expect(quick(bikeId, 'Helmet', 250000, { date: '2026-08-02' }).ok).toBe(true);
    const [row] = ExpenseRepository.listUnified({ motorcycleId: bikeId });
    expect(row?.date).toBe('2026-08-02');
  });
});

describe('QuickAddService: no-schedule fallback', () => {
  test('component with no schedule saves exactly one expense and creates no maintenance record or schedule', () => {
    const bikeId = seedBike();
    sqlite
      .prepare('DELETE FROM maintenance_schedules WHERE motorcycle_id = ? AND component_type = ?')
      .run(bikeId, 'chain_lube');

    const result = quick(bikeId, 'chain lube', 35000);
    expect(result).toMatchObject({ ok: true, value: { record: 'expense', fallbackFrom: 'chain_lube' } });
    expect(ExpenseRepository.count()).toBe(1);
    expect(countRows('maintenance_records', bikeId)).toBe(0);
    expect(ScheduleRepository.findByBikeComponent(bikeId, 'chain_lube')).toBeUndefined();
  });
});

describe('QuickAddService: fuel odometer (regression: no false precision)', () => {
  test('fuel without an odometer is refused and writes no fuel log and no odometer reading', () => {
    const bikeId = seedBike();
    const logsBefore = countRows('odometer_logs', bikeId);
    const result = quick(bikeId, 'Petron', 50000, { liters: 8.2 });
    expect(result.ok).toBe(false);
    expect(FuelRepository.listByBike(bikeId, 10)).toHaveLength(0);
    expect(countRows('odometer_logs', bikeId)).toBe(logsBefore);
  });

  test('km/L is computed from the odometer the rider entered at each fill-up', () => {
    const bikeId = seedBike(12200);
    // Full tank at 12,000 km, then full tank at 12,200 km after 10 L: exactly 20 km/L.
    expect(quick(bikeId, 'Petron', 50000, { liters: 10, odometerKm: 12000, date: '2026-08-01' }).ok).toBe(true);
    expect(quick(bikeId, 'Petron', 50000, { liters: 10, odometerKm: 12200, date: '2026-08-05' }).ok).toBe(true);
    const spans = computeSpans(FuelRepository.listChronological(bikeId));
    expect(spans).toHaveLength(1);
    expect(averageKmPerLiter(spans)).toBeCloseTo(20, 5);
  });
});

describe('QuickAddService: validation', () => {
  test('a failed save leaves no partial record behind', () => {
    const bikeId = seedBike();
    const result = quick(bikeId, 'Petron', -1, { liters: 8.2, odometerKm: 12150 });
    expect(result.ok).toBe(false);
    expect(FuelRepository.listByBike(bikeId, 10)).toHaveLength(0);
  });
});
