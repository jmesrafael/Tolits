/**
 * Delete-all-data against the real schema with foreign keys ON — the reported
 * failure case is a user who has Builds (builds → motorcycles and
 * build_plan_items → builds are ON DELETE RESTRICT).
 */

import * as client from '@/db/client';
import { ScheduleRepository } from '@/db/repositories/ScheduleRepository';
import { clearAllTables, countRows } from '@/test/sqliteTestClient';
import { FileAdapter } from './adapters/files';
import { deleteInternalBackups } from './BackupService';
import { BuildService } from './BuildService';
import { DataPrivacyService, DELETE_ORDER } from './DataPrivacyService';
import { ExpenseService } from './ExpenseService';
import { FuelLogService } from './FuelLogService';
import { MaintenanceService } from './MaintenanceService';
import { MotorcycleService } from './MotorcycleService';
import { cancelAllOwnedNotifications } from './NotificationScheduler';
import { RepairService } from './RepairService';

// Hoisted above the imports by babel-jest.
jest.mock('@/db/client', () =>
  jest.requireActual<typeof import('@/test/sqliteTestClient')>('@/test/sqliteTestClient').createTestClient(),
);
jest.mock('@/lib/uuid', () => ({
  newUuid: () => jest.requireActual<typeof import('crypto')>('crypto').randomUUID(),
}));
jest.mock('./NotificationScheduler', () => ({ cancelAllOwnedNotifications: jest.fn(async () => undefined) }));
jest.mock('./BackupService', () => ({ deleteInternalBackups: jest.fn() }));
jest.mock('./adapters/files', () => ({ FileAdapter: { deleteAllStoredFiles: jest.fn() } }));

const sqlite = (client as unknown as { __sqlite: import('better-sqlite3').Database }).__sqlite;
const mockCancel = cancelAllOwnedNotifications as jest.MockedFunction<typeof cancelAllOwnedNotifications>;
const mockDeleteFiles = FileAdapter.deleteAllStoredFiles as jest.Mock;
const mockDeleteBackups = deleteInternalBackups as jest.Mock;

const OPERATIONAL = ['scheduled_notifications', 'app_settings'];

function allTables(): string[] {
  return (
    sqlite.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`).all() as {
      name: string;
    }[]
  ).map((t) => t.name);
}

function unwrap<T>(result: { ok: true; value: T } | { ok: false; error: { message: string } }): T {
  if (!result.ok) {
    throw new Error(result.error.message);
  }
  return result.value;
}

function createBike(nickname: string): string {
  return unwrap(
    MotorcycleService.createBike({
      nickname,
      brand: 'Honda',
      model: 'Click 125',
      year: null,
      drivetrainType: 'cvt',
      plateNumber: null,
      vin: null,
      engineNumber: null,
      purchaseDate: null,
      purchasePriceCentavos: null,
      currentOdometerKm: 10000,
      photoPath: null,
    }),
  ).id;
}

/** A full, realistic dataset touching every user table and every FK edge. */
function seedEverything(): void {
  jest.setSystemTime(new Date('2026-08-11T10:00:00'));
  const bikeId = createBike('Red Click');
  createBike('Blue Mio');
  const oil = ScheduleRepository.listByBike(bikeId).find((s) => s.componentType === 'engine_oil')!;

  unwrap(
    MaintenanceService.saveRecord(bikeId, {
      scheduleId: oil.id,
      performedDate: '2026-08-11',
      odometerKm: 10100,
      serviceType: 'replace',
      costCentavos: 45000,
      brand: null,
      quantity: null,
      details: null,
      notes: null,
      photoPath: 'documents/oil-receipt.jpg',
    }),
  );
  unwrap(
    FuelLogService.saveFuelLog(bikeId, {
      fuelDate: '2026-08-11',
      liters: 4,
      totalCostCentavos: 24000,
      odometerKm: 10150,
      station: null,
      isFullTank: true,
      notes: null,
    }),
  );
  unwrap(
    RepairService.saveRepair(bikeId, {
      title: 'Flat tire',
      repairDate: '2026-08-11',
      odometerKm: null,
      problem: null,
      diagnosis: null,
      solution: null,
      shopName: null,
      costCentavos: 15000,
      notes: null,
    }),
  );
  const build = unwrap(
    BuildService.saveBuild(bikeId, { name: 'Touring setup', description: null, coverPhoto: null, budgetCentavos: 500000 }),
  );
  const item = unwrap(
    BuildService.addPlanItem(build.id, {
      name: 'Top box',
      estimatedPriceCentavos: 250000,
      photos: null,
      productLink: null,
      notes: null,
      priority: 'normal',
    }),
  );
  BuildService.addPlanItem(build.id, {
    name: 'Crash guard',
    estimatedPriceCentavos: 180000,
    photos: null,
    productLink: null,
    notes: null,
    priority: 'low',
  });
  unwrap(BuildService.acquireAsExpense(item.id, '2026-08-11', 'accessories')); // plan item → expense link
  unwrap(
    ExpenseService.saveExpense(bikeId, {
      category: 'service',
      amountCentavos: 5000,
      expenseDate: '2026-08-11',
      notes: null,
      images: ['documents/receipt.jpg'],
      buildId: build.id,
      scheduleId: oil.id,
    }),
  );
  client.rawDb.runSync(
    `INSERT INTO documents (id, created_at, updated_at, deleted_at, motorcycle_id, doc_type, title, file_path,
       mime_type, file_size, expiry_date, notes, document_number, link, extra_files)
     VALUES ('doc-1', 0, 0, NULL, ?, 'orcr', 'OR/CR', 'documents/orcr.jpg', 'image/jpeg', 1000, '2027-04-30',
       NULL, NULL, NULL, NULL)`,
    [bikeId],
  );
  client.rawDb.runSync(
    `INSERT INTO scheduled_notifications (id, notification_id, source_type, source_id, fire_at, created_at)
     VALUES ('n1', 'os-1', 'schedule', ?, 0, 0)`,
    [oil.id],
  );
  client.rawDb.runSync(
    `INSERT INTO app_settings (key, value, updated_at) VALUES ('schema_seed_version', '1', 0), ('fire_time', '"08:00"', 0)
     ON CONFLICT(key) DO NOTHING`,
  );
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  clearAllTables(sqlite);
  seedEverything();
});

afterEach(() => {
  jest.useRealTimers();
});

test('fixture really contains Builds, plan items and every other user table', () => {
  for (const table of [...DELETE_ORDER, 'scheduled_notifications']) {
    expect({ table, hasRows: countRows(sqlite, table) > 0 }).toEqual({ table, hasRows: true });
  }
});

test('regression: the previous delete list fails with Builds present (FK RESTRICT) and rolls back', () => {
  const previous = [
    'maintenance_records',
    'repairs',
    'expenses',
    'fuel_logs',
    'odometer_logs',
    'documents',
    'maintenance_schedules',
    'motorcycles',
    'scheduled_notifications',
  ];
  expect(() =>
    client.inTransaction(() => {
      for (const table of previous) {
        client.rawDb.execSync(`DELETE FROM ${table}`);
      }
    }),
  ).toThrow(/FOREIGN KEY/);
  expect(countRows(sqlite, 'motorcycles')).toBe(2);
});

test('deleteAllData succeeds with Builds present, FKs still ON, nothing left behind', async () => {
  const result = await DataPrivacyService.deleteAllData();

  expect(result).toEqual({ ok: true, value: { filesRemoved: true } });
  expect(sqlite.pragma('foreign_keys', { simple: true })).toBe(1);
  for (const table of allTables().filter((t) => t !== 'app_settings')) {
    expect({ table, rows: countRows(sqlite, table) }).toEqual({ table, rows: 0 });
  }
  expect(sqlite.pragma('foreign_key_check')).toEqual([]);
});

test('install-level seed marker is preserved; user settings are reset', async () => {
  await DataPrivacyService.deleteAllData();
  expect(sqlite.prepare('SELECT key FROM app_settings').all()).toEqual([{ key: 'schema_seed_version' }]);
});

test('OS notifications are cancelled BEFORE their tracking rows are wiped', async () => {
  let rowsAtCancel = -1;
  mockCancel.mockImplementationOnce(async () => {
    rowsAtCancel = countRows(sqlite, 'scheduled_notifications');
  });
  await DataPrivacyService.deleteAllData();
  expect(mockCancel).toHaveBeenCalledTimes(1);
  expect(rowsAtCancel).toBe(1);
});

test('stored files and the internal safety snapshot are removed after the DB wipe', async () => {
  let motorcyclesAtFileDelete = -1;
  mockDeleteFiles.mockImplementationOnce(() => {
    motorcyclesAtFileDelete = countRows(sqlite, 'motorcycles');
  });
  await DataPrivacyService.deleteAllData();
  expect(mockDeleteFiles).toHaveBeenCalledTimes(1);
  expect(mockDeleteBackups).toHaveBeenCalledTimes(1);
  expect(motorcyclesAtFileDelete).toBe(0);
});

test('file cleanup failure is reported, not hidden — DB is still wiped', async () => {
  mockDeleteFiles.mockImplementationOnce(() => {
    throw new Error('EACCES');
  });
  const result = await DataPrivacyService.deleteAllData();
  expect(result).toEqual({ ok: true, value: { filesRemoved: false } });
  expect(countRows(sqlite, 'motorcycles')).toBe(0);
});

test('a DB failure deletes nothing (atomic) and leaves files alone', async () => {
  const spy = jest.spyOn(client.rawDb, 'execSync').mockImplementation((source: string) => {
    if (source.includes('DELETE FROM motorcycles')) {
      throw new Error('disk I/O error');
    }
    sqlite.exec(source);
  });
  const result = await DataPrivacyService.deleteAllData();
  spy.mockRestore();

  expect(result.ok).toBe(false);
  expect(countRows(sqlite, 'motorcycles')).toBe(2);
  expect(countRows(sqlite, 'builds')).toBe(1);
  expect(countRows(sqlite, 'build_plan_items')).toBe(2);
  expect(mockDeleteFiles).not.toHaveBeenCalled();
});

test('every user table in the schema is covered by the delete order (guards future tables)', () => {
  const userTables = allTables().filter((t) => !OPERATIONAL.includes(t));
  expect([...DELETE_ORDER].sort()).toEqual(userTables.sort());
});
