/**
 * Test stand-in for `@/db/client`: the real migration SQL on an in-memory
 * better-sqlite3 database (same SQLite engine expo-sqlite binds — see
 * db/migrations/schema.integration.test.ts), foreign keys ON exactly as
 * `initDatabase()` sets them. Lets service tests exercise real repositories,
 * transactions and FK constraints without a device.
 *
 * Usage (jest.mock is hoisted, so the factory loads it via requireActual):
 *   jest.mock('@/db/client', () =>
 *     jest.requireActual<typeof import('@/test/sqliteTestClient')>('@/test/sqliteTestClient').createTestClient(),
 *   );
 */

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';

import { MIGRATIONS } from '@/db/migrations';

export function createTestClient() {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  for (const migration of MIGRATIONS) {
    for (const statement of migration.statements) {
      sqlite.exec(statement);
    }
  }
  // Migrations may toggle the pragma; the app runs with it ON.
  sqlite.pragma('foreign_keys = ON');

  const withTransactionSync = (fn: () => void): void => {
    sqlite.transaction(fn)();
  };

  /** The subset of expo-sqlite's SQLiteDatabase the services use. */
  const rawDb = {
    execSync: (source: string): void => {
      sqlite.exec(source);
    },
    runSync: (source: string, params: unknown[] = []) => sqlite.prepare(source).run(...params),
    getFirstSync: <T>(source: string, params: unknown[] = []): T | null =>
      (sqlite.prepare(source).get(...params) as T | undefined) ?? null,
    getAllSync: <T>(source: string, params: unknown[] = []): T[] => sqlite.prepare(source).all(...params) as T[],
    withTransactionSync,
  };

  return {
    db: drizzle(sqlite),
    rawDb,
    inTransaction<T>(fn: () => T): T {
      let result: T | undefined;
      withTransactionSync(() => {
        result = fn();
      });
      return result as T;
    },
    initDatabase: (): void => {},
    /** Test-only: the underlying handle for assertions and resets. */
    __sqlite: sqlite,
  };
}

/** Empties every table (FKs briefly off so order doesn't matter) — for beforeEach resets. */
export function clearAllTables(sqlite: Database.Database): void {
  const tables = sqlite
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`)
    .all() as { name: string }[];
  sqlite.pragma('foreign_keys = OFF');
  for (const { name } of tables) {
    sqlite.exec(`DELETE FROM ${name}`);
  }
  sqlite.pragma('foreign_keys = ON');
}

/** Row count helper for assertions. */
export function countRows(sqlite: Database.Database, table: string): number {
  return (sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
}
