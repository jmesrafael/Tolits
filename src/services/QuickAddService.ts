/**
 * Quick Add save orchestration. Quick Add is only a different way to create the
 * existing records: this routes to the canonical services and writes nothing
 * itself. Schedule resets, Health Score, odometer logging and fuel math all
 * happen inside those services.
 *
 * Routing:
 *   maintenance (component has a schedule) → MaintenanceService.saveRecord
 *     (the record carries its own cost, so Money already counts it; no second expense)
 *   maintenance (no schedule for that component yet) → ExpenseService (never invent a schedule)
 *   fuel → FuelLogService.saveFuelLog (liters + odometer required by the existing rules)
 *   repair → RepairService.saveRepair
 *   expense → ExpenseService.saveExpense
 */

import { ScheduleRepository } from '@/db/repositories/ScheduleRepository';
import { componentDefaultServiceType } from '@/db/seed/defaults';
import { appError, err, ok, type Result } from '@/lib/result';
import type { ComponentType, ExpenseCategory } from '@/types/enums';
import { ExpenseService } from './ExpenseService';
import { FuelLogService } from './FuelLogService';
import { MaintenanceService } from './MaintenanceService';
import type { QuickAddTarget } from './QuickAddClassifier';
import { RepairService } from './RepairService';

export interface QuickAddInput {
  /** What was bought or done, e.g. "Motul 10W-40". */
  title: string;
  amountCentavos: number;
  /** YYYY-MM-DD; defaults to today at the call site. */
  date: string;
  target: QuickAddTarget;
  /** Fuel only. */
  liters?: number | undefined;
  /** Optional for maintenance/repair (missing odometer never blocks a save); required for fuel. */
  odometerKm?: number | null | undefined;
}

export type QuickAddSaved =
  | { record: 'maintenance'; componentType: ComponentType }
  | { record: 'fuel' }
  | { record: 'repair' }
  | { record: 'expense'; category: ExpenseCategory; fallbackFrom?: ComponentType };

/** Expense category used when a maintenance component has no schedule yet. */
function categoryForComponent(componentType: ComponentType): ExpenseCategory {
  if (componentType === 'engine_oil' || componentType === 'gear_oil') {
    return 'oil';
  }
  if (componentType === 'tire_front' || componentType === 'tire_rear') {
    return 'tires';
  }
  return 'service';
}

export const QuickAddService = {
  save(motorcycleId: string, input: QuickAddInput): Result<QuickAddSaved> {
    const { target } = input;

    if (target.kind === 'maintenance') {
      const schedule = ScheduleRepository.findByBikeComponent(motorcycleId, target.componentType);
      if (schedule === undefined) {
        const saved = ExpenseService.saveExpense(motorcycleId, {
          title: input.title,
          category: categoryForComponent(target.componentType),
          amountCentavos: input.amountCentavos,
          expenseDate: input.date,
          notes: null,
          images: null,
          buildId: null,
          scheduleId: null,
        });
        return saved.ok
          ? ok({
              record: 'expense',
              category: categoryForComponent(target.componentType),
              fallbackFrom: target.componentType,
            })
          : saved;
      }
      const saved = MaintenanceService.saveRecord(motorcycleId, {
        scheduleId: schedule.id,
        performedDate: input.date,
        odometerKm: input.odometerKm ?? null,
        serviceType: componentDefaultServiceType(target.componentType),
        costCentavos: input.amountCentavos,
        brand: input.title.length > 0 ? input.title : null,
        quantity: null,
        details: null,
        notes: null,
        photoPath: null,
      });
      return saved.ok ? ok({ record: 'maintenance', componentType: target.componentType }) : saved;
    }

    if (target.kind === 'fuel') {
      if (input.liters === undefined || input.odometerKm === undefined || input.odometerKm === null) {
        return err(
          appError(
            'ValidationError',
            'quickAdd.fuelNeedsLitersAndOdometer',
            'Fuel needs liters and an odometer reading',
          ),
        );
      }
      const saved = FuelLogService.saveFuelLog(motorcycleId, {
        fuelDate: input.date,
        liters: input.liters,
        totalCostCentavos: input.amountCentavos,
        odometerKm: input.odometerKm,
        station: input.title.length > 0 ? input.title : null,
        isFullTank: true,
        notes: null,
      });
      return saved.ok ? ok({ record: 'fuel' }) : saved;
    }

    if (target.kind === 'repair') {
      const saved = RepairService.saveRepair(motorcycleId, {
        title: input.title.length > 0 ? input.title.slice(0, 60) : 'Repair',
        repairDate: input.date,
        odometerKm: input.odometerKm ?? null,
        problem: null,
        diagnosis: null,
        solution: null,
        shopName: null,
        costCentavos: input.amountCentavos,
        notes: null,
      });
      return saved.ok ? ok({ record: 'repair' }) : saved;
    }

    const saved = ExpenseService.saveExpense(motorcycleId, {
      title: input.title,
      category: target.category,
      amountCentavos: input.amountCentavos,
      expenseDate: input.date,
      notes: null,
      images: null,
      buildId: null,
      scheduleId: null,
    });
    return saved.ok ? ok({ record: 'expense', category: target.category }) : saved;
  },
};
