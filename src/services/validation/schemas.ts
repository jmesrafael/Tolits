/**
 * Zod input schemas — the single validation source (SOFTWARE_ARCHITECTURE.md §5).
 * Field rules trace to FEATURE_SPECIFICATIONS.md; services re-validate at the
 * boundary (defense in depth). UI maps issue codes to localized copy.
 */

import { z } from 'zod';

import { isFutureDate } from '@/lib/dates';
import { COMPONENT_TYPES, DOC_TYPES, DRIVETRAIN_TYPES, SERVICE_TYPES } from '@/types/enums';

const MAX_ODOMETER_KM = 999_999;
const MAX_MONEY_CENTAVOS = 999_999_999; // ₱9,999,999.99 (FEATURE_SPECIFICATIONS.md §1)

const odometerKm = z.number().int().min(0).max(MAX_ODOMETER_KM);
const money = z.number().int().min(0).max(MAX_MONEY_CENTAVOS);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const pastOrTodayDate = isoDate.refine((d) => !isFutureDate(d), { message: 'noFutureDate' });
const notes = z.string().max(500);

export const motorcycleInput = z.object({
  nickname: z.string().trim().min(1).max(30),
  brand: z.string().trim().min(1).max(30),
  model: z.string().trim().min(1).max(40),
  year: z
    .number()
    .int()
    .min(1980)
    .max(new Date().getFullYear() + 1)
    .nullable(),
  drivetrainType: z.enum(DRIVETRAIN_TYPES),
  plateNumber: z
    .string()
    .trim()
    .max(8)
    .transform((s) => s.toUpperCase())
    .nullable(),
  vin: z.string().trim().max(20).nullable(),
  engineNumber: z.string().trim().max(20).nullable(),
  purchaseDate: pastOrTodayDate.nullable(),
  purchasePriceCentavos: money.nullable(),
  currentOdometerKm: odometerKm,
  photoPath: z.string().nullable(),
});
export type MotorcycleInput = z.infer<typeof motorcycleInput>;

export const maintenanceRecordInput = z.object({
  scheduleId: z.string().min(1),
  performedDate: pastOrTodayDate,
  odometerKm: odometerKm.nullable(),
  serviceType: z.enum(SERVICE_TYPES),
  costCentavos: money.nullable(),
  brand: z.string().trim().max(40).nullable(),
  quantity: z.string().trim().max(30).nullable(),
  details: z.record(z.string(), z.union([z.string(), z.number()])).nullable(),
  notes: notes.nullable(),
  photoPath: z.string().nullable(),
});
export type MaintenanceRecordInput = z.infer<typeof maintenanceRecordInput>;

export const fuelLogInput = z.object({
  fuelDate: pastOrTodayDate,
  liters: z.number().min(0.1).max(99.99),
  totalCostCentavos: money,
  odometerKm,
  station: z.string().trim().max(40).nullable(),
  isFullTank: z.boolean(),
  notes: notes.nullable(),
});
export type FuelLogInput = z.infer<typeof fuelLogInput>;

/** Free-form since migration 0002: trimmed, collapsed whitespace, 1-30 chars — built-in EXPENSE_CATEGORIES remain valid values too. */
const expenseCategory = z
  .string()
  .trim()
  .min(1, 'categoryRequired')
  .max(30)
  .transform((s) => s.replace(/\s+/g, ' '));

export const expenseInput = z.object({
  /** Optional item name; absent or blank becomes null (callers that predate migration 0004 omit it). */
  title: z
    .string()
    .trim()
    .max(60)
    .nullish()
    .transform((s) => (s === undefined || s === null || s === '' ? null : s)),
  category: expenseCategory,
  amountCentavos: money.min(1, 'amountRequired'),
  expenseDate: pastOrTodayDate,
  notes: notes.nullable(),
  images: z.array(z.string()).max(6).nullable(),
  buildId: z.string().nullable(),
  scheduleId: z.string().nullable(),
});
export type ExpenseInput = z.infer<typeof expenseInput>;

export const repairInput = z.object({
  title: z.string().trim().min(1).max(60),
  repairDate: pastOrTodayDate,
  odometerKm: odometerKm.nullable(),
  problem: notes.nullable(),
  diagnosis: notes.nullable(),
  solution: notes.nullable(),
  shopName: z.string().trim().max(60).nullable(),
  costCentavos: money.nullable(),
  notes: notes.nullable(),
});
export type RepairInput = z.infer<typeof repairInput>;

const optionalUrl = z
  .string()
  .trim()
  .max(500)
  .refine((s) => s === '' || /^https?:\/\/.+/i.test(s), { message: 'invalidUrl' })
  .transform((s) => (s === '' ? null : s))
  .nullable();

export const documentInput = z.object({
  motorcycleId: z.string().nullable(),
  docType: z.enum(DOC_TYPES),
  title: z.string().trim().min(1).max(60),
  documentNumber: z.string().trim().max(40).nullable(),
  // Expiry may be future — that is its purpose (FEATURE_SPECIFICATIONS.md §1).
  expiryDate: isoDate.nullable(),
  notes: notes.nullable(),
  link: optionalUrl,
});
export type DocumentInput = z.infer<typeof documentInput>;

export const scheduleEditInput = z
  .object({
    customName: z.string().trim().min(1).max(30).nullable(),
    intervalKm: z.number().int().min(100).max(100_000).nullable(),
    intervalMonths: z.number().int().min(1).max(120).nullable(),
    isEnabled: z.boolean(),
  })
  .refine((v) => v.intervalKm !== null || v.intervalMonths !== null, {
    message: 'intervalRequired',
    path: ['intervalKm'],
  });
export type ScheduleEditInput = z.infer<typeof scheduleEditInput>;

export const customComponentInput = z
  .object({
    customName: z.string().trim().min(1).max(30),
    intervalKm: z.number().int().min(100).max(100_000).nullable(),
    intervalMonths: z.number().int().min(1).max(120).nullable(),
  })
  .refine((v) => v.intervalKm !== null || v.intervalMonths !== null, {
    message: 'intervalRequired',
    path: ['intervalKm'],
  });
export type CustomComponentInput = z.infer<typeof customComponentInput>;

export const odometerReadingInput = z.object({
  readingKm: odometerKm,
  recordedDate: pastOrTodayDate,
});
export type OdometerReadingInput = z.infer<typeof odometerReadingInput>;

export const baselineInput = z.object({
  scheduleId: z.string().min(1),
  lastDoneOdometerKm: odometerKm.nullable(),
  lastDoneDate: pastOrTodayDate.nullable(),
});
export type BaselineInput = z.infer<typeof baselineInput>;

export const componentTypeSchema = z.enum(COMPONENT_TYPES);

export const buildInput = z.object({
  name: z.string().trim().min(1).max(50),
  description: z.string().trim().max(500).nullable(),
  coverPhoto: z.string().nullable(),
  budgetCentavos: money.nullable(),
});
export type BuildInput = z.infer<typeof buildInput>;

export const buildPlanItemInput = z.object({
  name: z.string().trim().min(1).max(60),
  estimatedPriceCentavos: money.nullable(),
  photos: z.array(z.string()).max(6).nullable(),
  productLink: optionalUrl,
  notes: notes.nullable(),
  priority: z.enum(['low', 'normal', 'high']),
});
export type BuildPlanItemInput = z.infer<typeof buildPlanItemInput>;
