/**
 * Builds group expenses + planned upgrades into one project (e.g. "Classic
 * Build"). Spent totals are the linked expenses (ADR-021 union pattern
 * extended: expenses.build_id); planned items never count as spent until
 * marked acquired and converted into a real expense (see acquirePlanItem).
 */

import { BuildPlanItemRepository } from '@/db/repositories/BuildPlanItemRepository';
import { BuildRepository } from '@/db/repositories/BuildRepository';
import { ExpenseRepository } from '@/db/repositories/ExpenseRepository';
import type { BuildPlanItemRow, BuildRow, ExpenseRow } from '@/db/schema';
import { emitDomainEvent } from '@/lib/events';
import { appError, err, ok, type Result } from '@/lib/result';
import { runTx } from './MaintenanceService';
import { buildInput, buildPlanItemInput, type BuildInput, type BuildPlanItemInput } from './validation/schemas';
import { guardService, validateWith } from './serviceUtils';

export interface BuildTotals {
  spentCentavos: number;
  budgetCentavos: number | null;
  plannedCentavos: number;
  acquiredCentavos: number;
  remainingPlanCentavos: number;
}

export const BuildService = {
  saveBuild(motorcycleId: string, input: unknown): Result<BuildRow> {
    const parsed = validateWith(buildInput, input);
    if (!parsed.ok) {
      return parsed;
    }
    const value: BuildInput = parsed.value;
    return guardService('build.save', () => {
      const result = runTx(() => BuildRepository.insert({ motorcycleId, ...value }));
      if (result.ok) {
        emitDomainEvent('build:changed', { bikeId: motorcycleId, buildId: result.value.id });
      }
      return result;
    });
  },

  editBuild(buildId: string, input: unknown): Result<void> {
    const parsed = validateWith(buildInput, input);
    if (!parsed.ok) {
      return parsed;
    }
    const value = parsed.value;
    return guardService('build.edit', () => {
      const existing = BuildRepository.getById(buildId);
      if (existing === undefined) {
        return err(appError('BusinessRuleError', 'build.notFound', 'Build not found'));
      }
      const result = runTx(() => BuildRepository.update(buildId, value));
      if (result.ok) {
        emitDomainEvent('build:changed', { bikeId: existing.motorcycleId, buildId });
      }
      return result.ok ? ok(undefined) : result;
    });
  },

  deleteBuild(buildId: string): Result<void> {
    return guardService('build.delete', () => {
      const existing = BuildRepository.getById(buildId);
      if (existing === undefined) {
        return err(appError('BusinessRuleError', 'build.notFound', 'Build not found'));
      }
      const result = runTx(() => {
        // Expenses keep their history; they're just unlinked from the Build (never deleted).
        for (const expense of ExpenseRepository.listByBuild(buildId)) {
          ExpenseRepository.update(expense.id, { buildId: null });
        }
        for (const item of BuildPlanItemRepository.listByBuild(buildId)) {
          BuildPlanItemRepository.softDelete(item.id);
        }
        BuildRepository.softDelete(buildId);
      });
      if (result.ok) {
        emitDomainEvent('build:changed', { bikeId: existing.motorcycleId, buildId });
      }
      return result.ok ? ok(undefined) : result;
    });
  },

  totals(buildId: string): BuildTotals {
    const build = BuildRepository.getById(buildId);
    const spentCentavos = ExpenseRepository.buildTotal(buildId);
    const items = BuildPlanItemRepository.listByBuild(buildId);
    let plannedCentavos = 0;
    let acquiredCentavos = 0;
    for (const item of items) {
      const price = item.estimatedPriceCentavos ?? 0;
      if (item.isAcquired === 1) {
        acquiredCentavos += price;
      } else {
        plannedCentavos += price;
      }
    }
    return {
      spentCentavos,
      budgetCentavos: build?.budgetCentavos ?? null,
      plannedCentavos,
      acquiredCentavos,
      remainingPlanCentavos: plannedCentavos,
    };
  },

  addPlanItem(buildId: string, input: unknown): Result<BuildPlanItemRow> {
    const parsed = validateWith(buildPlanItemInput, input);
    if (!parsed.ok) {
      return parsed;
    }
    const value: BuildPlanItemInput = parsed.value;
    return guardService('build.addPlanItem', () => {
      const build = BuildRepository.getById(buildId);
      if (build === undefined) {
        return err(appError('BusinessRuleError', 'build.notFound', 'Build not found'));
      }
      const result = runTx(() => BuildPlanItemRepository.insert({ buildId, ...value }));
      if (result.ok) {
        emitDomainEvent('build:changed', { bikeId: build.motorcycleId, buildId });
      }
      return result;
    });
  },

  editPlanItem(itemId: string, input: unknown): Result<void> {
    const parsed = validateWith(buildPlanItemInput, input);
    if (!parsed.ok) {
      return parsed;
    }
    const value = parsed.value;
    return guardService('build.editPlanItem', () => {
      const existing = BuildPlanItemRepository.getById(itemId);
      if (existing === undefined) {
        return err(appError('BusinessRuleError', 'build.planItemNotFound', 'Plan item not found'));
      }
      const build = BuildRepository.getById(existing.buildId);
      const result = runTx(() => BuildPlanItemRepository.update(itemId, value));
      if (result.ok) {
        emitDomainEvent('build:changed', { bikeId: build?.motorcycleId, buildId: existing.buildId });
      }
      return result.ok ? ok(undefined) : result;
    });
  },

  deletePlanItem(itemId: string): Result<void> {
    return guardService('build.deletePlanItem', () => {
      const existing = BuildPlanItemRepository.getById(itemId);
      if (existing === undefined) {
        return err(appError('BusinessRuleError', 'build.planItemNotFound', 'Plan item not found'));
      }
      const build = BuildRepository.getById(existing.buildId);
      const result = runTx(() => BuildPlanItemRepository.softDelete(itemId));
      if (result.ok) {
        emitDomainEvent('build:changed', { bikeId: build?.motorcycleId, buildId: existing.buildId });
      }
      return result.ok ? ok(undefined) : result;
    });
  },

  /** Toggles acquired without logging an expense (the "just check it off" path). */
  setAcquired(itemId: string, acquired: boolean): Result<void> {
    return guardService('build.setAcquired', () => {
      const existing = BuildPlanItemRepository.getById(itemId);
      if (existing === undefined) {
        return err(appError('BusinessRuleError', 'build.planItemNotFound', 'Plan item not found'));
      }
      const build = BuildRepository.getById(existing.buildId);
      const result = runTx(() => BuildPlanItemRepository.update(itemId, { isAcquired: acquired ? 1 : 0 }));
      if (result.ok) {
        emitDomainEvent('build:changed', { bikeId: build?.motorcycleId, buildId: existing.buildId });
      }
      return result.ok ? ok(undefined) : result;
    });
  },

  /**
   * "Log as expense?" flow (item 19): pre-fills the expense from the planned
   * item's saved price, links it to the same Build, marks the item acquired,
   * and stores the resulting expense id so it's never duplicated by a second
   * acquire. `expenseDate` comes from the caller (today, or a picked date).
   */
  acquireAsExpense(itemId: string, expenseDate: string, category: string): Result<ExpenseRow> {
    return guardService('build.acquireAsExpense', () => {
      const item = BuildPlanItemRepository.getById(itemId);
      if (item === undefined) {
        return err(appError('BusinessRuleError', 'build.planItemNotFound', 'Plan item not found'));
      }
      if (item.acquiredExpenseId !== null) {
        return err(appError('BusinessRuleError', 'build.alreadyAcquired', 'This item is already logged as an expense'));
      }
      const build = BuildRepository.getById(item.buildId);
      if (build === undefined) {
        return err(appError('BusinessRuleError', 'build.notFound', 'Build not found'));
      }
      const result = runTx(() => {
        const expense = ExpenseRepository.insert({
          motorcycleId: build.motorcycleId,
          title: item.name,
          category,
          amountCentavos: item.estimatedPriceCentavos ?? 0,
          expenseDate,
          notes: null,
          images: item.photos !== null ? (JSON.parse(item.photos) as string[]) : null,
          buildId: build.id,
          scheduleId: null,
        });
        BuildPlanItemRepository.update(itemId, { isAcquired: 1, acquiredExpenseId: expense.id });
        return expense;
      });
      if (result.ok) {
        emitDomainEvent('build:changed', { bikeId: build.motorcycleId, buildId: build.id });
        emitDomainEvent('expense:changed', { bikeId: build.motorcycleId });
      }
      return result;
    });
  },
};
