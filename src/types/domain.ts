/**
 * Shared domain view-model types used by the dashboard (STATE_MANAGEMENT.md §3:
 * screens render view models, not raw rows). Vocabulary per GLOSSARY.md.
 */

import type { IconName } from '@/components/Icon';

/** Per-schedule due status (BUSINESS_RULES.md §4) + neutral for un-anchored. */
export type DueStatus = 'good' | 'dueSoon' | 'overdue' | 'neutral';

/** Health Score display bands (HEALTH_SCORE.md §6). */
export type HealthBandId = 'excellent' | 'good' | 'fair' | 'poor' | 'critical';

export interface MotorcycleVm {
  id: string;
  nickname: string;
  brand: string;
  model: string;
  plate: string;
  /** Last ACTUAL reading (effective km). */
  odometerKm: number;
  /** Date that actual reading was recorded — never "today" by default; null if unknown. */
  odometerAsOf: string | null;
  /** Live estimate for today; null when the actual reading is current (never persisted). */
  estimatedOdometerKm: number | null;
  /** Estimate rests on a low-confidence rate (90-day fallback or a stale reading, §7.5) — say "rough". */
  estimateIsRough: boolean;
  /** Time has passed but there is no riding history to estimate from — ask for another reading. */
  needsMoreReadings: boolean;
}

export interface UpcomingScheduleVm {
  id: string;
  icon: IconName;
  label: string;
  status: DueStatus;
  remainingText: string;
}

export type ActivityKind = 'maintenance' | 'fuel' | 'repair';

export interface ActivityVm {
  id: string;
  kind: ActivityKind;
  icon: IconName;
  title: string;
  dateIso: string;
  odometerKm?: number;
  amountCentavos: number;
}

export interface MonthCategoryVm {
  id: string;
  label: string;
  amountCentavos: number;
  /** Fixed chart-slot assignment — entity-stable (DESIGN_SYSTEM.md §3). */
  slot: 'slot1' | 'slot2' | 'slot3' | 'slot4' | 'slot5' | 'other';
}

export interface MonthSummaryVm {
  label: string;
  totalCentavos: number;
  deltaCaption: string;
  categories: MonthCategoryVm[];
}

export interface DocumentWarningVm {
  id: string;
  message: string;
}

export interface DashboardData {
  bike: MotorcycleVm;
  /** null = no enabled anchored schedules (HEALTH_SCORE.md §5) — UI shows "—" + setup CTA. */
  healthScore: number | null;
  isPartialScore: boolean;
  /** Score used an estimated (not freshly read) odometer for at least one km-based item. */
  isEstimatedScore: boolean;
  upcoming: UpcomingScheduleVm[];
  documentWarning?: DocumentWarningVm;
  activity: ActivityVm[];
  month: MonthSummaryVm;
}
