/**
 * Zod shape validation for backup archives (BACKUP_RECOVERY.md §4 step 3).
 * Rows are validated for *shape* only (right columns, right JS types) — the
 * deeper semantic rules (CHECK constraints, FKs, uniqueness) are enforced by
 * SQLite itself on insert into the staging DB, and a failed insert rolls the
 * whole restore back. Row shapes mirror the raw `SELECT *` column names
 * (snake_case) from db/migrations/0001_initial.ts, not the camelCase Drizzle
 * mapping — the archive stores what SQLite returns, for lossless round-trips.
 */

import { z } from 'zod';

export const SUPPORTED_FORMAT_VERSIONS = [1] as const;

export const manifestSchema = z.object({
  formatVersion: z.number().int(),
  appVersion: z.string(),
  schemaVersion: z.number().int().min(1),
  createdAt: z.number().int(),
  counts: z.record(z.string(), z.number().int().min(0)),
  fileCount: z.number().int().min(0),
  totalFileBytes: z.number().int().min(0),
});
export type BackupManifest = z.infer<typeof manifestSchema>;

const syncColumns = {
  id: z.string().min(1),
  created_at: z.number().int(),
  updated_at: z.number().int(),
  deleted_at: z.number().int().nullable(),
};

const motorcycleRowSchema = z.object({
  ...syncColumns,
  nickname: z.string(),
  brand: z.string(),
  model: z.string(),
  year: z.number().int().nullable(),
  drivetrain_type: z.string(),
  photo_path: z.string().nullable(),
  plate_number: z.string().nullable(),
  vin: z.string().nullable(),
  engine_number: z.string().nullable(),
  purchase_date: z.string().nullable(),
  purchase_price_centavos: z.number().int().nullable(),
  current_odometer_km: z.number().int(),
  odometer_offset_km: z.number().int(),
  is_archived: z.number().int(),
  sort_order: z.number().int(),
});

const scheduleRowSchema = z.object({
  ...syncColumns,
  motorcycle_id: z.string(),
  component_type: z.string(),
  custom_name: z.string().nullable(),
  interval_km: z.number().int().nullable(),
  interval_months: z.number().int().nullable(),
  is_enabled: z.number().int(),
  is_muted: z.number().int(),
  snoozed_until: z.string().nullable(),
  anchor_odometer_km: z.number().int().nullable(),
  anchor_date: z.string().nullable(),
  anchor_source: z.string().nullable(),
  is_pinned: z.number().int(),
  pinned_sort_order: z.number().int(),
  sort_order: z.number().int(),
});

const recordRowSchema = z.object({
  ...syncColumns,
  motorcycle_id: z.string(),
  schedule_id: z.string(),
  performed_date: z.string(),
  odometer_km: z.number().int().nullable(),
  service_type: z.string(),
  cost_centavos: z.number().int().nullable(),
  brand: z.string().nullable(),
  quantity: z.string().nullable(),
  details: z.string().nullable(),
  notes: z.string().nullable(),
  photo_path: z.string().nullable(),
  source: z.string(),
});

const repairRowSchema = z.object({
  ...syncColumns,
  motorcycle_id: z.string(),
  title: z.string(),
  repair_date: z.string(),
  odometer_km: z.number().int().nullable(),
  problem: z.string().nullable(),
  diagnosis: z.string().nullable(),
  solution: z.string().nullable(),
  shop_name: z.string().nullable(),
  cost_centavos: z.number().int().nullable(),
  photo_paths: z.string().nullable(),
  notes: z.string().nullable(),
});

const expenseRowSchema = z.object({
  ...syncColumns,
  motorcycle_id: z.string(),
  category: z.string(),
  amount_centavos: z.number().int(),
  expense_date: z.string(),
  notes: z.string().nullable(),
  images: z.string().nullable(),
  build_id: z.string().nullable(),
  schedule_id: z.string().nullable(),
  /** Added in migration 0004; older backups omit it. */
  title: z.string().nullable().optional(),
});

const fuelRowSchema = z.object({
  ...syncColumns,
  motorcycle_id: z.string(),
  fuel_date: z.string(),
  liters: z.number(),
  total_cost_centavos: z.number().int(),
  odometer_km: z.number().int(),
  station: z.string().nullable(),
  is_full_tank: z.number().int(),
  notes: z.string().nullable(),
});

const odometerRowSchema = z.object({
  ...syncColumns,
  motorcycle_id: z.string(),
  reading_km: z.number().int(),
  effective_km: z.number().int(),
  recorded_date: z.string(),
  source: z.string(),
  source_id: z.string().nullable(),
});

const documentRowSchema = z.object({
  ...syncColumns,
  motorcycle_id: z.string().nullable(),
  doc_type: z.string(),
  title: z.string(),
  file_path: z.string(),
  mime_type: z.string(),
  file_size: z.number().int(),
  expiry_date: z.string().nullable(),
  notes: z.string().nullable(),
  document_number: z.string().nullable(),
  link: z.string().nullable(),
  extra_files: z.string().nullable(),
});

const buildRowSchema = z.object({
  ...syncColumns,
  motorcycle_id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  cover_photo: z.string().nullable(),
  budget_centavos: z.number().int().nullable(),
  sort_order: z.number().int(),
});

const buildPlanItemRowSchema = z.object({
  ...syncColumns,
  build_id: z.string(),
  name: z.string(),
  estimated_price_centavos: z.number().int().nullable(),
  photos: z.string().nullable(),
  product_link: z.string().nullable(),
  notes: z.string().nullable(),
  priority: z.string(),
  is_acquired: z.number().int(),
  acquired_expense_id: z.string().nullable(),
  sort_order: z.number().int(),
});

const appSettingRowSchema = z.object({
  key: z.string(),
  value: z.string(),
  updated_at: z.number().int(),
});

/** Owning table → row schema. Order matters for restore insert (FK-safe): builds before expenses (build_id), build_plan_items last (references both builds and expenses). */
export const BACKUP_TABLE_SCHEMAS = {
  motorcycles: motorcycleRowSchema,
  maintenance_schedules: scheduleRowSchema,
  maintenance_records: recordRowSchema,
  repairs: repairRowSchema,
  builds: buildRowSchema,
  expenses: expenseRowSchema,
  fuel_logs: fuelRowSchema,
  odometer_logs: odometerRowSchema,
  documents: documentRowSchema,
  build_plan_items: buildPlanItemRowSchema,
} as const;

export type BackupTableName = keyof typeof BACKUP_TABLE_SCHEMAS;

export const BACKUP_TABLE_ORDER: readonly BackupTableName[] = [
  'motorcycles',
  'maintenance_schedules',
  'maintenance_records',
  'repairs',
  'builds',
  'expenses',
  'fuel_logs',
  'odometer_logs',
  'documents',
  'build_plan_items',
];

export const backupDataSchema = z.object({
  motorcycles: z.array(motorcycleRowSchema),
  maintenance_schedules: z.array(scheduleRowSchema),
  maintenance_records: z.array(recordRowSchema),
  repairs: z.array(repairRowSchema),
  builds: z.array(buildRowSchema),
  expenses: z.array(expenseRowSchema),
  fuel_logs: z.array(fuelRowSchema),
  odometer_logs: z.array(odometerRowSchema),
  documents: z.array(documentRowSchema),
  build_plan_items: z.array(buildPlanItemRowSchema),
  app_settings: z.array(appSettingRowSchema),
});
export type BackupData = z.infer<typeof backupDataSchema>;
