import { create } from 'zustand';

import type { ScheduleRow } from '@/db/schema';
import type { HealthScoreResult } from '@/services/HealthScoreService';
import type { OdometerSnapshot } from '@/services/odometerEstimate';
import type { ScheduleStatus } from '@/services/StatusService';

export interface ScheduleWithStatus {
  schedule: ScheduleRow;
  status: ScheduleStatus;
}

interface MaintenanceState {
  bikeId: string | null;
  items: ScheduleWithStatus[];
  health: HealthScoreResult | null;
  odometer: OdometerSnapshot | null;
  day: string | null;
  healthIsEstimated: boolean;
  status: 'idle' | 'ready';
  load: (bikeId: string, today?: string) => void;
  clear: () => void;
}

/** Web preview store: maintenance schedules are native SQLite data. */
export const useMaintenanceStore = create<MaintenanceState>((set) => ({
  bikeId: null,
  items: [],
  health: null,
  odometer: null,
  day: null,
  healthIsEstimated: false,
  status: 'idle',
  load: (bikeId, today) =>
    set({ bikeId, items: [], health: null, odometer: null, day: today ?? null, healthIsEstimated: false, status: 'ready' }),
  clear: () =>
    set({ bikeId: null, items: [], health: null, odometer: null, day: null, healthIsEstimated: false, status: 'idle' }),
}));
