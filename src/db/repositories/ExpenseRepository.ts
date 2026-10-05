import { and, desc, eq, isNull, like, sql } from 'drizzle-orm';

import { db, rawDb } from '@/db/client';
import { expenses, type ExpenseRow } from '@/db/schema';
import type { ExpenseCategory } from '@/types/enums';
import { guard, insertMeta, softDeleteMeta, touchMeta } from './base';

export interface NewExpense {
  motorcycleId: string;
  /** Free-form since migration 0002 — built-in ExpenseCategory values remain valid, plus user-added ones. */
  category: ExpenseCategory | string;
  amountCentavos: number;
  expenseDate: string;
  notes: string | null;
  /** Relative file paths (FileAdapter), stored as a JSON array. */
  images: string[] | null;
  buildId: string | null;
  /** Optional link to the maintenance component this expense was for (migration 0003). */
  scheduleId: string | null;
  /** What was bought (migration 0004). */
  title: string | null;
}

export type ExpenseUpdate = Partial<Omit<NewExpense, 'motorcycleId'>>;

/** One row of the unified expense view (ADR-021): derived + standalone, read-time union. */
export interface UnifiedExpenseRow {
  id: string;
  source: 'fuel' | 'maintenance' | 'repair' | 'expense';
  motorcycleId: string;
  date: string;
  /** Free-form since migration 0002 for standalone expenses; derived rows (fuel/maintenance/repair) still use the fixed buckets from UNION_SQL below. */
  category: ExpenseCategory | string;
  amountCentavos: number;
  /** What was bought: expense title, repair title, fuel station, custom maintenance name. Null when the source has none (fall back to the category). */
  title: string | null;
  /** Secondary detail. Standalone expenses: notes. Maintenance: the raw component_type (display via formatComponentName). */
  label: string | null;
}

export interface UnifiedFilter {
  motorcycleId?: string;
  /** 'YYYY-MM' month scope. */
  month?: string;
  category?: ExpenseCategory | string;
  limit?: number;
  offset?: number;
}

export interface CategoryTotal {
  category: ExpenseCategory | string;
  totalCentavos: number;
}

export interface MonthCategoryTotal extends CategoryTotal {
  month: string;
}

/**
 * The union subquery — category mapping in SQL (BUSINESS_RULES.md §9.1).
 * Raw SQL is allowed here only (SQLITE_GUIDE.md §2); always parameterized.
 */
const UNION_SQL = `
  SELECT f.id AS id, 'fuel' AS source, f.motorcycle_id AS motorcycle_id, f.fuel_date AS date,
         'fuel' AS category, f.total_cost_centavos AS amount_centavos, f.station AS title, NULL AS label
    FROM fuel_logs f WHERE f.deleted_at IS NULL
  UNION ALL
  SELECT r.id, 'maintenance', r.motorcycle_id, r.performed_date,
         CASE WHEN s.component_type IN ('engine_oil','gear_oil') THEN 'oil'
              WHEN s.component_type IN ('tire_front','tire_rear') THEN 'tires'
              ELSE 'service' END,
         r.cost_centavos,
         CASE WHEN s.component_type = 'custom' THEN s.custom_name ELSE NULL END,
         s.component_type
    FROM maintenance_records r
    JOIN maintenance_schedules s ON s.id = r.schedule_id
   WHERE r.deleted_at IS NULL AND r.cost_centavos > 0
  UNION ALL
  SELECT p.id, 'repair', p.motorcycle_id, p.repair_date, 'repair', p.cost_centavos, p.title, NULL
    FROM repairs p WHERE p.deleted_at IS NULL AND p.cost_centavos > 0
  UNION ALL
  SELECT e.id, 'expense', e.motorcycle_id, e.expense_date, e.category, e.amount_centavos, e.title, e.notes
    FROM expenses e WHERE e.deleted_at IS NULL
`;

interface RawUnifiedRow {
  id: string;
  source: UnifiedExpenseRow['source'];
  motorcycle_id: string;
  date: string;
  category: ExpenseCategory;
  amount_centavos: number;
  title: string | null;
  label: string | null;
}

/** All-bikes scopes exclude archived bikes by default (BUSINESS_RULES.md §9.5). */
const NON_ARCHIVED_SCOPE = 'motorcycle_id IN (SELECT id FROM motorcycles WHERE deleted_at IS NULL AND is_archived = 0)';

function unifiedWhere(filter: UnifiedFilter): {
  clause: string;
  params: string[];
} {
  const conditions: string[] = [];
  const params: string[] = [];
  if (filter.motorcycleId !== undefined) {
    conditions.push('motorcycle_id = ?');
    params.push(filter.motorcycleId);
  } else {
    conditions.push(NON_ARCHIVED_SCOPE);
  }
  if (filter.month !== undefined) {
    conditions.push('substr(date, 1, 7) = ?');
    params.push(filter.month);
  }
  if (filter.category !== undefined) {
    conditions.push('category = ?');
    params.push(filter.category);
  }
  return {
    clause: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
    params,
  };
}

const notDeleted = isNull(expenses.deletedAt);

export const ExpenseRepository = {
  getById(id: string): ExpenseRow | undefined {
    return guard('expenses.getById', () =>
      db
        .select()
        .from(expenses)
        .where(and(eq(expenses.id, id), notDeleted))
        .get(),
    );
  },

  insert(input: NewExpense): ExpenseRow {
    return guard('expenses.insert', () => {
      const row = {
        ...insertMeta(),
        ...input,
        images: input.images !== null ? JSON.stringify(input.images) : null,
      };
      db.insert(expenses).values(row).run();
      return row as ExpenseRow;
    });
  },

  update(id: string, changes: ExpenseUpdate): void {
    const { images, ...rest } = changes;
    guard('expenses.update', () =>
      db
        .update(expenses)
        .set({
          ...rest,
          ...(images !== undefined ? { images: images !== null ? JSON.stringify(images) : null } : {}),
          ...touchMeta(),
        })
        .where(eq(expenses.id, id))
        .run(),
    );
  },

  /** Built-in categories are always offered; this adds whatever custom ones are already in use, deduped case-insensitively by the caller. */
  listDistinctCategories(): string[] {
    return guard('expenses.listDistinctCategories', () =>
      rawDb
        .getAllSync<{ category: string }>(
          `SELECT DISTINCT category FROM expenses WHERE deleted_at IS NULL ORDER BY category COLLATE NOCASE`,
        )
        .map((r) => r.category),
    );
  },

  listByBuild(buildId: string): ExpenseRow[] {
    return guard('expenses.listByBuild', () =>
      db
        .select()
        .from(expenses)
        .where(and(eq(expenses.buildId, buildId), notDeleted))
        .orderBy(desc(expenses.expenseDate))
        .all(),
    );
  },

  listBySchedule(scheduleId: string): ExpenseRow[] {
    return guard('expenses.listBySchedule', () =>
      db
        .select()
        .from(expenses)
        .where(and(eq(expenses.scheduleId, scheduleId), notDeleted))
        .orderBy(desc(expenses.expenseDate))
        .all(),
    );
  },

  buildTotal(buildId: string): number {
    return guard(
      'expenses.buildTotal',
      () =>
        db
          .select({
            total: sql<number>`COALESCE(SUM(${expenses.amountCentavos}), 0)`,
          })
          .from(expenses)
          .where(and(eq(expenses.buildId, buildId), notDeleted))
          .get()?.total ?? 0,
    );
  },

  softDelete(id: string): void {
    guard('expenses.softDelete', () => db.update(expenses).set(softDeleteMeta()).where(eq(expenses.id, id)).run());
  },

  softDeleteByBike(motorcycleId: string): void {
    guard('expenses.softDeleteByBike', () =>
      db
        .update(expenses)
        .set(softDeleteMeta())
        .where(and(eq(expenses.motorcycleId, motorcycleId), notDeleted))
        .run(),
    );
  },

  /** Unified expense list — sorted+paged as one query (SQLITE_GUIDE.md §3). */
  listUnified(filter: UnifiedFilter = {}): UnifiedExpenseRow[] {
    return guard('expenses.listUnified', () => {
      const { clause, params } = unifiedWhere(filter);
      const rows = rawDb.getAllSync<RawUnifiedRow>(
        `SELECT * FROM (${UNION_SQL}) ${clause} ORDER BY date DESC LIMIT ? OFFSET ?`,
        [...params, filter.limit ?? 50, filter.offset ?? 0],
      );
      return rows.map((r) => ({
        id: r.id,
        source: r.source,
        motorcycleId: r.motorcycle_id,
        date: r.date,
        category: r.category,
        amountCentavos: r.amount_centavos,
        title: r.title,
        label: r.label,
      }));
    });
  },

  /** Category totals within an optional month/bike scope (dashboard "this month", S-22). */
  categoryTotals(filter: UnifiedFilter = {}): CategoryTotal[] {
    return guard('expenses.categoryTotals', () => {
      const { clause, params } = unifiedWhere(filter);
      return rawDb
        .getAllSync<{ category: ExpenseCategory; total: number }>(
          `SELECT category, SUM(amount_centavos) AS total FROM (${UNION_SQL}) ${clause}
         GROUP BY category ORDER BY total DESC`,
          params,
        )
        .map((r) => ({ category: r.category, totalCentavos: r.total }));
    });
  },

  /** Per-month per-category totals from `fromMonth` ('YYYY-MM') — chart series. */
  monthlyCategoryTotals(motorcycleId: string | undefined, fromMonth: string): MonthCategoryTotal[] {
    return guard('expenses.monthlyCategoryTotals', () => {
      const conditions = ['substr(date, 1, 7) >= ?'];
      const params: string[] = [fromMonth];
      if (motorcycleId !== undefined) {
        conditions.push('motorcycle_id = ?');
        params.push(motorcycleId);
      } else {
        conditions.push(NON_ARCHIVED_SCOPE);
      }
      return rawDb
        .getAllSync<{
          month: string;
          category: ExpenseCategory;
          total: number;
        }>(
          `SELECT substr(date, 1, 7) AS month, category, SUM(amount_centavos) AS total
           FROM (${UNION_SQL}) WHERE ${conditions.join(' AND ')}
          GROUP BY month, category ORDER BY month ASC`,
          params,
        )
        .map((r) => ({
          month: r.month,
          category: r.category,
          totalCentavos: r.total,
        }));
    });
  },

  /** Overall union total (statistics §9.2), optional bike + [from, to] date scope. */
  unionTotal(motorcycleId: string | undefined, fromDate?: string, toDate?: string): number {
    return guard('expenses.unionTotal', () => {
      const conditions: string[] = [];
      const params: string[] = [];
      if (motorcycleId !== undefined) {
        conditions.push('motorcycle_id = ?');
        params.push(motorcycleId);
      } else {
        conditions.push(NON_ARCHIVED_SCOPE);
      }
      if (fromDate !== undefined) {
        conditions.push('date >= ?');
        params.push(fromDate);
      }
      if (toDate !== undefined) {
        conditions.push('date <= ?');
        params.push(toDate);
      }
      const clause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      return (
        rawDb.getFirstSync<{ total: number }>(
          `SELECT COALESCE(SUM(amount_centavos), 0) AS total FROM (${UNION_SQL}) ${clause}`,
          params,
        )?.total ?? 0
      );
    });
  },

  /** Date of the earliest money record — for average-monthly-spend divisor (§9.3). */
  firstMoneyDate(motorcycleId: string | undefined): string | null {
    return guard('expenses.firstMoneyDate', () => {
      const conditions: string[] = [];
      const params: string[] = [];
      if (motorcycleId !== undefined) {
        conditions.push('motorcycle_id = ?');
        params.push(motorcycleId);
      } else {
        conditions.push(NON_ARCHIVED_SCOPE);
      }
      const clause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      return (
        rawDb.getFirstSync<{ first: string | null }>(`SELECT MIN(date) AS first FROM (${UNION_SQL}) ${clause}`, params)
          ?.first ?? null
      );
    });
  },

  /** Per-source totals (statistics §9.2), optional bike scope. */
  sourceTotals(motorcycleId: string | undefined): Record<UnifiedExpenseRow['source'], number> {
    return guard('expenses.sourceTotals', () => {
      const conditions: string[] = [];
      const params: string[] = [];
      if (motorcycleId !== undefined) {
        conditions.push('motorcycle_id = ?');
        params.push(motorcycleId);
      } else {
        conditions.push(NON_ARCHIVED_SCOPE);
      }
      const clause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const rows = rawDb.getAllSync<{
        source: UnifiedExpenseRow['source'];
        total: number;
      }>(
        `SELECT source, COALESCE(SUM(amount_centavos), 0) AS total FROM (${UNION_SQL}) ${clause}
         GROUP BY source`,
        params,
      );
      const totals: Record<UnifiedExpenseRow['source'], number> = {
        fuel: 0,
        maintenance: 0,
        repair: 0,
        expense: 0,
      };
      for (const row of rows) {
        totals[row.source] = row.total;
      }
      return totals;
    });
  },

  search(query: string, limit: number): ExpenseRow[] {
    const pattern = `%${query}%`;
    return guard('expenses.search', () =>
      db
        .select()
        .from(expenses)
        .where(and(notDeleted, like(expenses.notes, pattern)))
        .orderBy(desc(expenses.expenseDate))
        .limit(limit)
        .all(),
    );
  },

  /** Standalone-expense count (edge diagnostics); excludes derived rows by design. */
  count(): number {
    return guard(
      'expenses.count',
      () =>
        db
          .select({ n: sql<number>`count(*)` })
          .from(expenses)
          .where(notDeleted)
          .get()?.n ?? 0,
    );
  },
};
