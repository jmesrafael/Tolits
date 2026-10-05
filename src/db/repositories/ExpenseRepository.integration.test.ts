/**
 * The unified expense list (ExpenseRepository.listUnified) on real migration SQL,
 * fed by the real services. Guards the per-source meaning of `title` and `label`
 * that the Money tab depends on.
 */

import * as client from '@/db/client';
import { ExpenseRepository, type UnifiedExpenseRow } from '@/db/repositories/ExpenseRepository';
import { unifiedRowName } from '@/lib/expenseDisplay';
import { ExpenseService } from '@/services/ExpenseService';
import { MaintenanceService } from '@/services/MaintenanceService';
import { MotorcycleService } from '@/services/MotorcycleService';
import { QuickAddService } from '@/services/QuickAddService';
import { ScheduleService } from '@/services/ScheduleService';
import { clearAllTables } from '@/test/sqliteTestClient';

jest.mock('@/db/client', () =>
  jest.requireActual<typeof import('@/test/sqliteTestClient')>('@/test/sqliteTestClient').createTestClient(),
);
jest.mock('@/lib/uuid', () => ({
  newUuid: () => jest.requireActual<typeof import('crypto')>('crypto').randomUUID(),
}));

const sqlite = (client as unknown as { __sqlite: import('better-sqlite3').Database }).__sqlite;

const DATE = '2026-08-11';

function seedBike(): string {
  jest.setSystemTime(new Date(`${DATE}T10:00:00`));
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
    currentOdometerKm: 12000,
    photoPath: null,
  });
  if (!bike.ok) {
    throw new Error(bike.error.message);
  }
  return bike.value.id;
}

function rowFor(bikeId: string, source: UnifiedExpenseRow['source']): UnifiedExpenseRow {
  const row = ExpenseRepository.listUnified({ motorcycleId: bikeId }).find((r) => r.source === source);
  if (row === undefined) {
    throw new Error(`no ${source} row`);
  }
  return row;
}

describe('unified expense list: title/label per source', () => {
  beforeEach(() => {
    clearAllTables(sqlite);
    jest.useFakeTimers();
  });

  test('each source puts its item name in title, and label only where it is not a name', () => {
    const bikeId = seedBike();

    expect(
      QuickAddService.save(bikeId, {
        title: 'Motul 10W-40',
        amountCentavos: 45000,
        date: DATE,
        target: { kind: 'maintenance', componentType: 'engine_oil' },
        odometerKm: 12100,
      }).ok,
    ).toBe(true);
    expect(
      QuickAddService.save(bikeId, {
        title: 'Petron',
        amountCentavos: 50000,
        date: DATE,
        target: { kind: 'fuel' },
        liters: 8.2,
        odometerKm: 12150,
      }).ok,
    ).toBe(true);
    expect(
      QuickAddService.save(bikeId, {
        title: 'Clutch cable',
        amountCentavos: 120000,
        date: DATE,
        target: { kind: 'repair' },
        odometerKm: 12160,
      }).ok,
    ).toBe(true);
    expect(
      QuickAddService.save(bikeId, {
        title: 'Helmet',
        amountCentavos: 250000,
        date: DATE,
        target: { kind: 'expense', category: 'accessories' },
      }).ok,
    ).toBe(true);

    expect(rowFor(bikeId, 'maintenance')).toMatchObject({ title: null, label: 'engine_oil' });
    expect(rowFor(bikeId, 'fuel')).toMatchObject({ title: 'Petron', label: null });
    expect(rowFor(bikeId, 'repair')).toMatchObject({ title: 'Clutch cable', label: null });
    expect(rowFor(bikeId, 'expense')).toMatchObject({ title: 'Helmet', label: null });
  });

  test('mixed list: every row displays its own name', () => {
    const bikeId = seedBike();
    QuickAddService.save(bikeId, {
      title: 'Motul 10W-40',
      amountCentavos: 45000,
      date: DATE,
      target: { kind: 'maintenance', componentType: 'engine_oil' },
      odometerKm: 12100,
    });
    QuickAddService.save(bikeId, {
      title: 'Petron',
      amountCentavos: 50000,
      date: DATE,
      target: { kind: 'fuel' },
      liters: 8.2,
      odometerKm: 12150,
    });
    QuickAddService.save(bikeId, {
      title: 'Clutch cable',
      amountCentavos: 120000,
      date: DATE,
      target: { kind: 'repair' },
      odometerKm: 12160,
    });
    QuickAddService.save(bikeId, {
      title: 'Helmet',
      amountCentavos: 250000,
      date: DATE,
      target: { kind: 'expense', category: 'accessories' },
    });

    const names = Object.fromEntries(
      ExpenseRepository.listUnified({ motorcycleId: bikeId }).map((row) => [row.source, unifiedRowName(row)]),
    );
    expect(names).toEqual({
      maintenance: 'Engine oil',
      fuel: 'Petron',
      repair: 'Clutch cable',
      expense: 'Helmet',
    });
  });

  test('custom maintenance shows its custom name, not the raw component type', () => {
    const bikeId = seedBike();
    const custom = ScheduleService.addCustomComponent(bikeId, {
      customName: 'Gear shifter',
      intervalKm: 5000,
      intervalMonths: null,
    });
    if (!custom.ok) {
      throw new Error(custom.error.message);
    }
    expect(
      MaintenanceService.saveRecord(bikeId, {
        scheduleId: custom.value.id,
        performedDate: DATE,
        odometerKm: 12100,
        serviceType: 'replace',
        costCentavos: 30000,
        brand: null,
        quantity: null,
        details: null,
        notes: null,
        photoPath: null,
      }).ok,
    ).toBe(true);

    expect(rowFor(bikeId, 'maintenance')).toMatchObject({ title: 'Gear shifter', label: 'custom' });
    expect(unifiedRowName(rowFor(bikeId, 'maintenance'))).toBe('Gear shifter');
  });

  test('standalone expense saved without a title falls back to its category, not its notes', () => {
    const bikeId = seedBike();
    expect(
      ExpenseService.saveExpense(bikeId, {
        title: null,
        category: 'parking',
        amountCentavos: 2000,
        expenseDate: DATE,
        notes: 'Mall parking, 2 hours',
        images: null,
        buildId: null,
        scheduleId: null,
      }).ok,
    ).toBe(true);

    const row = rowFor(bikeId, 'expense');
    expect(row).toMatchObject({ title: null, label: 'Mall parking, 2 hours' });
    expect(unifiedRowName(row)).toBe('Parking');
  });
});
