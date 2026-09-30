import { create } from 'zustand';

import { ScheduleRepository } from '@/db/repositories/ScheduleRepository';
import type { ScheduleRow } from '@/db/schema';
import { onDomainEvents } from '@/lib/events';
import { todayIso } from '@/lib/dates';
import { computeHealthScore, type HealthScoreResult, scoreUsesMileage } from '@/services/HealthScoreService';
import type { OdometerSnapshot } from '@/services/odometerEstimate';
import { OdometerService } from '@/services/OdometerService';
import { computeScheduleStatus, type ScheduleStatus } from '@/services/StatusService';

export interface ScheduleWithStatus {
  schedule: ScheduleRow;
  status: ScheduleStatus;
}

interface MaintenanceState {
  bikeId: string | null;
  items: ScheduleWithStatus[];
  health: HealthScoreResult | null;
  /** Actual + estimated odometer the statuses were computed from (estimate when time has passed). */
  odometer: OdometerSnapshot | null;
  /** Calendar day the statuses were computed for — the hook reloads when it changes. */
  day: string | null;
  /** Health Score depends on at least one km status computed from an estimated odometer. */
  healthIsEstimated: boolean;
  status: 'idle' | 'ready';
  load: (bikeId: string, today?: string) => void;
  clear: () => void;
}

/**
 * Schedule statuses + Health Score for the active bike — recomputed on every
 * cascade event (DATA_FLOW.md §4); score always derived (ADR-019).
 */
export const useMaintenanceStore = create<MaintenanceState>((set) => ({
  bikeId: null,
  items: [],
  health: null,
  odometer: null,
  day: null,
  healthIsEstimated: false,
  status: 'idle',
  load: (bikeId, today = todayIso()) => {
    const schedules = ScheduleRepository.listByBike(bikeId);
    // Current mileage = live estimate from the last actual reading (never persisted).
    const odometer = OdometerService.getSnapshot(bikeId, today);
    const currentKm = odometer?.statusKm ?? 0;
    const statuses = new Map<string, ScheduleStatus>();
    const items: ScheduleWithStatus[] = schedules.map((schedule) => {
      const status = computeScheduleStatus(schedule, currentKm, today);
      statuses.set(schedule.id, status);
      return { schedule, status };
    });
    const health = computeHealthScore(schedules, statuses);
    set({
      bikeId,
      items,
      health,
      odometer,
      day: today,
      healthIsEstimated: (odometer?.statusIsEstimate ?? false) && scoreUsesMileage(health, schedules),
      status: 'ready',
    });
  },
  clear: () =>
    set({ bikeId: null, items: [], health: null, odometer: null, day: null, healthIsEstimated: false, status: 'idle' }),
}));

onDomainEvents(
  ['maintenance:changed', 'schedule:changed', 'odometer:changed', 'bike:changed'],
  () => {
    // Reload is driven by the hook layer; mark stale here.
    const state = useMaintenanceStore.getState();
    if (state.status === 'ready') {
      useMaintenanceStore.setState({ status: 'idle' });
    }
  },
);
