/**
 * Drizzle schema — the typed mirror of DATABASE_DESIGN.md §5. The tables are
 * created by the bundled SQL migrations (src/db/migrations); this file exists
 * for compile-time-typed queries. Only db/repositories may import it
 * (FOLDER_STRUCTURE.md §2.4).
 */

import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/** Sync-ready conventions shared by every user-data table (ADR-006). */
const syncColumns = {
  id: text('id').primaryKey(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  deletedAt: integer('deleted_at'),
};

export const motorcycles = sqliteTable('motorcycles', {
  ...syncColumns,
  nickname: text('nickname').notNull(),
  brand: text('brand').notNull(),
  model: text('model').notNull(),
  year: integer('year'),
  drivetrainType: text('drivetrain_type').notNull(),
  photoPath: text('photo_path'),
  plateNumber: text('plate_number'),
  vin: text('vin'),
  engineNumber: text('engine_number'),
  purchaseDate: text('purchase_date'),
  purchasePriceCentavos: integer('purchase_price_centavos'),
  currentOdometerKm: integer('current_odometer_km').notNull().default(0),
  odometerOffsetKm: integer('odometer_offset_km').notNull().default(0),
  isArchived: integer('is_archived').notNull().default(0),
  sortOrder: integer('sort_order').notNull().default(0),
});

export const maintenanceSchedules = sqliteTable('maintenance_schedules', {
  ...syncColumns,
  motorcycleId: text('motorcycle_id').notNull(),
  componentType: text('component_type').notNull(),
  customName: text('custom_name'),
  intervalKm: integer('interval_km'),
  intervalMonths: integer('interval_months'),
  isEnabled: integer('is_enabled').notNull().default(1),
  isMuted: integer('is_muted').notNull().default(0),
  snoozedUntil: text('snoozed_until'),
  anchorOdometerKm: integer('anchor_odometer_km'),
  anchorDate: text('anchor_date'),
  anchorSource: text('anchor_source'),
  /** Pinned to the Dashboard "Quick Logs" section (migration 0002). */
  isPinned: integer('is_pinned').notNull().default(0),
  pinnedSortOrder: integer('pinned_sort_order').notNull().default(0),
  /** Custom Components drag-and-drop order, reusable anywhere components list (migration 0002). */
  sortOrder: integer('sort_order').notNull().default(0),
});

export const maintenanceRecords = sqliteTable('maintenance_records', {
  ...syncColumns,
  motorcycleId: text('motorcycle_id').notNull(),
  scheduleId: text('schedule_id').notNull(),
  performedDate: text('performed_date').notNull(),
  odometerKm: integer('odometer_km'),
  serviceType: text('service_type').notNull(),
  costCentavos: integer('cost_centavos'),
  brand: text('brand'),
  quantity: text('quantity'),
  details: text('details'),
  notes: text('notes'),
  photoPath: text('photo_path'),
  source: text('source').notNull().default('user'),
});

export const repairs = sqliteTable('repairs', {
  ...syncColumns,
  motorcycleId: text('motorcycle_id').notNull(),
  title: text('title').notNull(),
  repairDate: text('repair_date').notNull(),
  odometerKm: integer('odometer_km'),
  problem: text('problem'),
  diagnosis: text('diagnosis'),
  solution: text('solution'),
  shopName: text('shop_name'),
  costCentavos: integer('cost_centavos'),
  photoPaths: text('photo_paths'),
  notes: text('notes'),
});

export const expenses = sqliteTable('expenses', {
  ...syncColumns,
  motorcycleId: text('motorcycle_id').notNull(),
  /** Free-form since migration 0002 (was a closed enum) so users can add their own categories. */
  category: text('category').notNull(),
  amountCentavos: integer('amount_centavos').notNull(),
  expenseDate: text('expense_date').notNull(),
  notes: text('notes'),
  /** JSON array of relative file paths (migration 0002; replaces the old single photo_path). */
  images: text('images'),
  buildId: text('build_id'),
  /** Optional link to the maintenance component this expense was for (migration 0003). */
  scheduleId: text('schedule_id'),
  /** What was bought, e.g. "Motul 10W-40" (migration 0004). Null on rows saved before it existed. */
  title: text('title'),
});

export const fuelLogs = sqliteTable('fuel_logs', {
  ...syncColumns,
  motorcycleId: text('motorcycle_id').notNull(),
  fuelDate: text('fuel_date').notNull(),
  liters: real('liters').notNull(),
  totalCostCentavos: integer('total_cost_centavos').notNull(),
  odometerKm: integer('odometer_km').notNull(),
  station: text('station'),
  isFullTank: integer('is_full_tank').notNull().default(1),
  notes: text('notes'),
});

export const odometerLogs = sqliteTable('odometer_logs', {
  ...syncColumns,
  motorcycleId: text('motorcycle_id').notNull(),
  readingKm: integer('reading_km').notNull(),
  effectiveKm: integer('effective_km').notNull(),
  recordedDate: text('recorded_date').notNull(),
  source: text('source').notNull(),
  sourceId: text('source_id'),
});

export const documents = sqliteTable('documents', {
  ...syncColumns,
  motorcycleId: text('motorcycle_id'),
  docType: text('doc_type').notNull(),
  title: text('title').notNull(),
  filePath: text('file_path').notNull(),
  mimeType: text('mime_type').notNull(),
  fileSize: integer('file_size').notNull(),
  expiryDate: text('expiry_date'),
  notes: text('notes'),
  /** e.g. OR/CR or policy number (migration 0002). */
  documentNumber: text('document_number'),
  /** Optional external URL, e.g. the LTO portal (migration 0002). */
  link: text('link'),
  /** JSON array of {path, mimeType, size} for images beyond the first (migration 0002). */
  extraFiles: text('extra_files'),
});

export const builds = sqliteTable('builds', {
  ...syncColumns,
  motorcycleId: text('motorcycle_id').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  coverPhoto: text('cover_photo'),
  budgetCentavos: integer('budget_centavos'),
  sortOrder: integer('sort_order').notNull().default(0),
});

export const buildPlanItems = sqliteTable('build_plan_items', {
  ...syncColumns,
  buildId: text('build_id').notNull(),
  name: text('name').notNull(),
  estimatedPriceCentavos: integer('estimated_price_centavos'),
  /** JSON array of relative file paths (photos/screenshots). */
  photos: text('photos'),
  productLink: text('product_link'),
  notes: text('notes'),
  priority: text('priority').notNull().default('normal'),
  isAcquired: integer('is_acquired').notNull().default(0),
  acquiredExpenseId: text('acquired_expense_id'),
  sortOrder: integer('sort_order').notNull().default(0),
});

/** Operational — no soft delete, excluded from backup (DATABASE_DESIGN.md §5.9). */
export const scheduledNotifications = sqliteTable('scheduled_notifications', {
  id: text('id').primaryKey(),
  notificationId: text('notification_id').notNull(),
  sourceType: text('source_type').notNull(),
  sourceId: text('source_id'),
  fireAt: integer('fire_at').notNull(),
  createdAt: integer('created_at').notNull(),
});

/** Key-value settings — operational (DATABASE_DESIGN.md §5.10). */
export const appSettings = sqliteTable('app_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export type MotorcycleRow = typeof motorcycles.$inferSelect;
export type ScheduleRow = typeof maintenanceSchedules.$inferSelect;
export type MaintenanceRecordRow = typeof maintenanceRecords.$inferSelect;
export type RepairRow = typeof repairs.$inferSelect;
export type ExpenseRow = typeof expenses.$inferSelect;
export type FuelLogRow = typeof fuelLogs.$inferSelect;
export type OdometerLogRow = typeof odometerLogs.$inferSelect;
export type DocumentRow = typeof documents.$inferSelect;
export type AppSettingRow = typeof appSettings.$inferSelect;
export type BuildRow = typeof builds.$inferSelect;
export type BuildPlanItemRow = typeof buildPlanItems.$inferSelect;
