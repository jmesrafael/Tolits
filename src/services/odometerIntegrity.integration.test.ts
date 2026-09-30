/**
 * Phase 0 odometer integrity against real services + repositories on the real
 * migration SQL (better-sqlite3 stand-in for expo-sqlite, FKs ON). The clock
 * is frozen per step so every "today" is deterministic.
 */

import * as client from '@/db/client';
import { MaintenanceRepository } from '@/db/repositories/MaintenanceRepository';
import { MotorcycleRepository } from '@/db/repositories/MotorcycleRepository';
import { OdometerRepository } from '@/db/repositories/OdometerRepository';
import { ScheduleRepository } from '@/db/repositories/ScheduleRepository';
import { useMaintenanceStore } from '@/stores/useMaintenanceStore';
import { clearAllTables, countRows } from '@/test/sqliteTestClient';
import { FuelLogService } from './FuelLogService';
import { MaintenanceService } from './MaintenanceService';
import { MotorcycleService } from './MotorcycleService';
import { OdometerService } from './OdometerService';
import { ScheduleService } from './ScheduleService';

// Hoisted above the imports by babel-jest.
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

/**
 * Bike history: 11,400 km on Jul 2 (initial), 12,000 km on Aug 1 (manual) —
 * 20 km/day. Then the user stops logging; "today" is Aug 11 unless moved.
 */
function seedBike(): string {
  setToday('2026-07-02');
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
    currentOdometerKm: 11400,
    photoPath: null,
  });
  if (!bike.ok) {
    throw new Error(bike.error.message);
  }
  setToday('2026-08-01');
  const manual = OdometerService.logManualReading(bike.value.id, { readingKm: 12000, recordedDate: '2026-08-01' });
  if (!manual.ok) {
    throw new Error(manual.error.message);
  }
  setToday('2026-08-11');
  return bike.value.id;
}

function oilSchedule(bikeId: string) {
  const schedule = ScheduleRepository.listByBike(bikeId).find((s) => s.componentType === 'engine_oil');
  if (schedule === undefined) {
    throw new Error('engine_oil schedule missing');
  }
  return schedule;
}

const fuelInput = (overrides: Record<string, unknown> = {}) => ({
  fuelDate: '2026-08-11',
  liters: 4.2,
  totalCostCentavos: 25000,
  odometerKm: 12250,
  station: null,
  isFullTank: true,
  notes: null,
  ...overrides,
});

const recordInput = (scheduleId: string, overrides: Record<string, unknown> = {}) => ({
  scheduleId,
  performedDate: '2026-08-11',
  odometerKm: null,
  serviceType: 'replace',
  costCentavos: null,
  brand: null,
  quantity: null,
  details: null,
  notes: null,
  photoPath: null,
  ...overrides,
});

let bikeId: string;

beforeEach(() => {
  jest.useFakeTimers();
  clearAllTables(sqlite);
  bikeId = seedBike();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('odometer snapshot — actual reading, its real date, live estimate', () => {
  test('identifies the latest actual reading and its recorded date', () => {
    const snapshot = OdometerService.getSnapshot(bikeId, '2026-08-11');
    expect(snapshot?.actualKm).toBe(12000);
    expect(snapshot?.actualDate).toBe('2026-08-01');
    expect(snapshot?.daysSinceReading).toBe(10);
  });

  test('estimates today from that reading and the elapsed days (20 km/day × 10)', () => {
    const snapshot = OdometerService.getSnapshot(bikeId, '2026-08-11');
    // Windows end at the latest reading (Aug 1), so a rider who logged 10 days ago
    // keeps a high-confidence 30-day rate. (Regression: windows ending at "today"
    // dropped to low confidence ~11 days after the last reading.)
    expect(snapshot?.rate).toEqual({ rate: 20, confidence: 'high', source: 'window30' });
    expect(snapshot?.estimatedKm).toBe(12200);
    expect(snapshot?.statusKm).toBe(12200);
  });

  test('the estimate is never persisted as a reading', () => {
    const logsBefore = countRows(sqlite, 'odometer_logs');
    OdometerService.getSnapshot(bikeId, '2026-08-11');
    useMaintenanceStore.getState().load(bikeId);
    expect(countRows(sqlite, 'odometer_logs')).toBe(logsBefore);
    expect(MotorcycleRepository.getById(bikeId)?.currentOdometerKm).toBe(12000);
    expect(OdometerRepository.latest(bikeId)?.recordedDate).toBe('2026-08-01');
  });

  test('a stale reading stays stale — its date is not moved as time passes', () => {
    setToday('2026-09-30');
    const snapshot = OdometerService.getSnapshot(bikeId, '2026-09-30');
    expect(snapshot?.actualKm).toBe(12000);
    expect(snapshot?.actualDate).toBe('2026-08-01');
    expect(snapshot?.rate.confidence).toBe('low'); // readings only in the 90-day window now
    expect(snapshot?.estimatedKm).toBe(13200);
  });

  test('a backdated reading does not replace the latest one', () => {
    const backdated = OdometerService.logManualReading(bikeId, { readingKm: 11700, recordedDate: '2026-07-15' });
    expect(backdated.ok).toBe(true);
    const snapshot = OdometerService.getSnapshot(bikeId, '2026-08-11');
    expect(snapshot?.actualKm).toBe(12000);
    expect(snapshot?.actualDate).toBe('2026-08-01');
  });

  test('unknown bike → null (no invented reading)', () => {
    expect(OdometerService.getSnapshot('nope', '2026-08-11')).toBeNull();
  });

  test('status and Health Score are computed from the labelled estimate', () => {
    // Oil changed at 11,000 km: 1,000/1,500 used at the stale reading (good),
    // 1,200/1,500 by the estimate (due soon).
    const oil = oilSchedule(bikeId);
    ScheduleService.setBaseline({ scheduleId: oil.id, lastDoneOdometerKm: 11000, lastDoneDate: null });
    useMaintenanceStore.getState().load(bikeId);
    const state = useMaintenanceStore.getState();
    expect(state.odometer?.estimatedKm).toBe(12200);
    const item = state.items.find((i) => i.schedule.id === oil.id);
    expect(item?.status.status).toBe('dueSoon');
    expect(item?.status.remainingKm).toBe(300);
    expect(state.health?.anchoredCount).toBeGreaterThanOrEqual(1);
  });
});

describe('fuel logging — a stale reading is never saved as today\'s', () => {
  test('explicitly entered odometer is saved as the actual reading for that date', () => {
    const result = FuelLogService.saveFuelLog(bikeId, fuelInput({ odometerKm: 12250 }));
    expect(result.ok).toBe(true);
    const latest = OdometerRepository.latest(bikeId);
    expect(latest).toMatchObject({ readingKm: 12250, recordedDate: '2026-08-11', source: 'fuel' });
    expect(MotorcycleRepository.getById(bikeId)?.currentOdometerKm).toBe(12250);
  });

  test('missing odometer is rejected — no fuel row, no reading, nothing substituted', () => {
    const logsBefore = countRows(sqlite, 'odometer_logs');
    for (const odometerKm of [null, undefined]) {
      const result = FuelLogService.saveFuelLog(bikeId, fuelInput({ odometerKm }));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.fieldErrors?.odometerKm).toBeDefined();
      }
    }
    expect(countRows(sqlite, 'fuel_logs')).toBe(0);
    expect(countRows(sqlite, 'odometer_logs')).toBe(logsBefore);
    expect(OdometerRepository.latest(bikeId)?.recordedDate).toBe('2026-08-01');
  });
});

describe('maintenance logging — mileage stays unknown unless entered', () => {
  test('omitted mileage: record saved date-only, no reading created, cache untouched', () => {
    const oil = oilSchedule(bikeId);
    const logsBefore = countRows(sqlite, 'odometer_logs');
    const result = MaintenanceService.saveRecord(bikeId, recordInput(oil.id));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(MaintenanceRepository.getById(result.value.id)?.odometerKm).toBeNull();
    }
    expect(countRows(sqlite, 'odometer_logs')).toBe(logsBefore);
    expect(MotorcycleRepository.getById(bikeId)?.currentOdometerKm).toBe(12000);
    expect(ScheduleRepository.getById(oil.id)).toMatchObject({
      anchorOdometerKm: null,
      anchorDate: '2026-08-11',
      anchorSource: 'record',
    });
  });

  test('explicit mileage: saved as an actual reading on the service date and anchors the schedule', () => {
    const oil = oilSchedule(bikeId);
    const result = MaintenanceService.saveRecord(bikeId, recordInput(oil.id, { odometerKm: 12300 }));
    expect(result.ok).toBe(true);
    expect(OdometerRepository.latest(bikeId)).toMatchObject({
      readingKm: 12300,
      recordedDate: '2026-08-11',
      source: 'maintenance',
    });
    expect(ScheduleRepository.getById(oil.id)?.anchorOdometerKm).toBe(12300);
  });
});

describe('"Just serviced today" — the stale cached odometer is never used', () => {
  test('without an entered reading: baseline is today\'s date only, NOT the 10-day-old 12,000 km', () => {
    const oil = oilSchedule(bikeId);
    const result = ScheduleService.markServicedToday(oil.id, '2026-08-11', null);
    expect(result.ok).toBe(true);
    const anchored = ScheduleRepository.getById(oil.id);
    expect(anchored).toMatchObject({ anchorDate: '2026-08-11', anchorSource: 'baseline' });
    expect(anchored?.anchorOdometerKm).toBeNull();
    expect(anchored?.anchorOdometerKm).not.toBe(MotorcycleRepository.getById(bikeId)?.currentOdometerKm);
  });

  test('with an entered reading: that reading is used', () => {
    const oil = oilSchedule(bikeId);
    expect(ScheduleService.markServicedToday(oil.id, '2026-08-11', 12260).ok).toBe(true);
    expect(ScheduleRepository.getById(oil.id)).toMatchObject({ anchorOdometerKm: 12260, anchorDate: '2026-08-11' });
  });

  test('an entered mileage is also logged as the odometer reading for today (once)', () => {
    const logsBefore = countRows(sqlite, 'odometer_logs');
    expect(ScheduleService.markServicedToday(oilSchedule(bikeId).id, '2026-08-11', 12260).ok).toBe(true);
    expect(countRows(sqlite, 'odometer_logs')).toBe(logsBefore + 1);
    expect(OdometerRepository.latest(bikeId)).toMatchObject({
      readingKm: 12260,
      effectiveKm: 12260,
      recordedDate: '2026-08-11',
      source: 'manual',
    });
    expect(MotorcycleRepository.getById(bikeId)?.currentOdometerKm).toBe(12260);
  });

  test('no duplicate reading when the same reading was already logged today', () => {
    OdometerService.logManualReading(bikeId, { readingKm: 12260, recordedDate: '2026-08-11' });
    const logsBefore = countRows(sqlite, 'odometer_logs');
    expect(ScheduleService.markServicedToday(oilSchedule(bikeId).id, '2026-08-11', 12260).ok).toBe(true);
    expect(countRows(sqlite, 'odometer_logs')).toBe(logsBefore);
    expect(ScheduleRepository.getById(oilSchedule(bikeId).id)?.anchorOdometerKm).toBe(12260);
  });

  test('a mileage below the last reading is rejected and nothing is saved', () => {
    const oil = oilSchedule(bikeId);
    const logsBefore = countRows(sqlite, 'odometer_logs');
    const result = ScheduleService.markServicedToday(oil.id, '2026-08-11', 11900);
    expect(result.ok).toBe(false);
    expect(countRows(sqlite, 'odometer_logs')).toBe(logsBefore);
    expect(ScheduleRepository.getById(oil.id)?.anchorSource).toBeNull();
  });

  test('date-only "serviced today" still creates no reading', () => {
    const logsBefore = countRows(sqlite, 'odometer_logs');
    ScheduleService.markServicedToday(oilSchedule(bikeId).id, '2026-08-11', null);
    expect(countRows(sqlite, 'odometer_logs')).toBe(logsBefore);
  });

  test('service records keep their own single reading (existing path unchanged)', () => {
    const oil = oilSchedule(bikeId);
    const logsBefore = countRows(sqlite, 'odometer_logs');
    MaintenanceService.saveRecord(bikeId, recordInput(oil.id, { odometerKm: 12300 }));
    expect(countRows(sqlite, 'odometer_logs')).toBe(logsBefore + 1);
  });

  test('"Save baseline" with a mileage only keeps the date unknown (not stamped as today)', () => {
    const oil = oilSchedule(bikeId);
    expect(ScheduleService.setBaseline({ scheduleId: oil.id, lastDoneOdometerKm: 11000, lastDoneDate: null }).ok).toBe(true);
    expect(ScheduleRepository.getById(oil.id)).toMatchObject({ anchorOdometerKm: 11000, anchorDate: null });
  });
});

describe('confidence follows the latest reading, not today (windows anchored at the reading)', () => {
  test('30 days after the last reading: still high confidence', () => {
    setToday('2026-08-31');
    expect(OdometerService.getSnapshot(bikeId, '2026-08-31')?.rate.confidence).toBe('high');
  });

  test('31 days after the last reading: low confidence (data is stale), rate unchanged', () => {
    setToday('2026-09-01');
    expect(OdometerService.getSnapshot(bikeId, '2026-09-01')?.rate).toEqual({
      rate: 20,
      confidence: 'low',
      source: 'window30',
    });
  });
});

describe('parked bike — only an initial reading, no riding history', () => {
  test('60 days later: no estimate, status uses the actual reading, UI asked for another reading', () => {
    setToday('2026-06-01');
    const parked = MotorcycleService.createBike({
      nickname: 'Garage Queen',
      brand: 'Yamaha',
      model: 'Mio',
      year: null,
      drivetrainType: 'cvt',
      plateNumber: null,
      vin: null,
      engineNumber: null,
      purchaseDate: null,
      purchasePriceCentavos: null,
      currentOdometerKm: 5000,
      photoPath: null,
    });
    if (!parked.ok) {
      throw new Error(parked.error.message);
    }
    setToday('2026-07-31');
    const snapshot = OdometerService.getSnapshot(parked.value.id, '2026-07-31');
    expect(snapshot).toMatchObject({
      actualKm: 5000,
      estimatedKm: null,
      statusIsEstimate: false,
      statusKm: 5000,
      needsMoreReadings: true,
    });
    const oil = oilSchedule(parked.value.id);
    ScheduleService.setBaseline({ scheduleId: oil.id, lastDoneOdometerKm: 4000, lastDoneDate: null });
    useMaintenanceStore.getState().load(parked.value.id, '2026-07-31');
    const item = useMaintenanceStore.getState().items.find((i) => i.schedule.id === oil.id);
    // 1,000 of 1,500 km by the ACTUAL reading → good (the 25 km/day default would have said overdue).
    expect(item?.status.status).toBe('good');
    expect(useMaintenanceStore.getState().healthIsEstimated).toBe(false);
  });
});

describe('Health Score estimate label', () => {
  test('shown when a km item was scored from an estimated odometer', () => {
    const oil = oilSchedule(bikeId);
    ScheduleService.setBaseline({ scheduleId: oil.id, lastDoneOdometerKm: 11000, lastDoneDate: null });
    useMaintenanceStore.getState().load(bikeId, '2026-08-11'); // reading is 10 days old
    expect(useMaintenanceStore.getState().healthIsEstimated).toBe(true);
  });

  test('not shown when the reading is current (actual data only)', () => {
    const oil = oilSchedule(bikeId);
    ScheduleService.setBaseline({ scheduleId: oil.id, lastDoneOdometerKm: 11000, lastDoneDate: null });
    useMaintenanceStore.getState().load(bikeId, '2026-08-01'); // reading taken that day
    expect(useMaintenanceStore.getState().odometer?.statusIsEstimate).toBe(false);
    expect(useMaintenanceStore.getState().healthIsEstimated).toBe(false);
  });

  test('not shown when only time-based items are scored, even with an estimate', () => {
    const oil = oilSchedule(bikeId);
    ScheduleService.setBaseline({ scheduleId: oil.id, lastDoneOdometerKm: null, lastDoneDate: '2026-07-01' });
    useMaintenanceStore.getState().load(bikeId, '2026-08-11');
    expect(useMaintenanceStore.getState().odometer?.statusIsEstimate).toBe(true);
    expect(useMaintenanceStore.getState().healthIsEstimated).toBe(false);
  });

  test('the store records the day it computed for (drives the midnight reload)', () => {
    useMaintenanceStore.getState().load(bikeId, '2026-08-11');
    expect(useMaintenanceStore.getState().day).toBe('2026-08-11');
  });
});

describe('bike edit — a changed odometer value is recorded, never dropped', () => {
  const editInput = (currentOdometerKm: number) => {
    const bike = MotorcycleRepository.getById(bikeId)!;
    return {
      nickname: bike.nickname,
      brand: bike.brand,
      model: bike.model,
      year: bike.year,
      drivetrainType: bike.drivetrainType,
      plateNumber: bike.plateNumber,
      vin: bike.vin,
      engineNumber: bike.engineNumber,
      purchaseDate: bike.purchaseDate,
      purchasePriceCentavos: bike.purchasePriceCentavos,
      currentOdometerKm,
      photoPath: bike.photoPath,
    };
  };

  test('unchanged value (what the edit form sends) → profile saved, no reading created', () => {
    const logsBefore = countRows(sqlite, 'odometer_logs');
    expect(MotorcycleService.updateBike(bikeId, { ...editInput(12000), nickname: 'Renamed' }).ok).toBe(true);
    expect(MotorcycleRepository.getById(bikeId)?.nickname).toBe('Renamed');
    expect(countRows(sqlite, 'odometer_logs')).toBe(logsBefore);
  });

  test('changed value → recorded as a manual reading dated today; cache follows', () => {
    const logsBefore = countRows(sqlite, 'odometer_logs');
    expect(MotorcycleService.updateBike(bikeId, editInput(12400)).ok).toBe(true);
    expect(countRows(sqlite, 'odometer_logs')).toBe(logsBefore + 1);
    expect(OdometerRepository.latest(bikeId)).toMatchObject({
      readingKm: 12400,
      recordedDate: '2026-08-11',
      source: 'manual',
    });
    expect(MotorcycleRepository.getById(bikeId)?.currentOdometerKm).toBe(12400);
  });

  test('value below existing history → rejected with a field error, nothing saved (profile included)', () => {
    const logsBefore = countRows(sqlite, 'odometer_logs');
    const result = MotorcycleService.updateBike(bikeId, { ...editInput(11000), nickname: 'Should not stick' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.fieldErrors?.currentOdometerKm).toBe('odometer.belowPrevious');
    }
    expect(countRows(sqlite, 'odometer_logs')).toBe(logsBefore);
    expect(MotorcycleRepository.getById(bikeId)?.nickname).toBe('Red Click');
    expect(MotorcycleRepository.getById(bikeId)?.currentOdometerKm).toBe(12000);
  });

  test('after a meter replacement the value is treated as effective km (offset honored)', () => {
    expect(OdometerService.replaceMeter(bikeId, 100, '2026-08-11').ok).toBe(true); // offset = 12,000 − 100
    expect(MotorcycleService.updateBike(bikeId, editInput(12250)).ok).toBe(true);
    // Same-day rows share created_at under the frozen test clock, so look the row up directly.
    expect(sqlite.prepare('SELECT reading_km FROM odometer_logs WHERE effective_km = 12250').all()).toEqual([
      { reading_km: 350 },
    ]);
    expect(MotorcycleRepository.getById(bikeId)?.currentOdometerKm).toBe(12250);
  });
});
