import { useEffect } from 'react';

import { useToday } from '@/hooks/useToday';
import { useMaintenanceStore } from '@/stores/useMaintenanceStore';

/**
 * Binds schedule statuses + Health Score to a bike (SOFTWARE_ARCHITECTURE.md §2).
 * The store reads the bike's odometer snapshot itself (last actual reading +
 * live estimate) and is re-marked stale on every odometer/maintenance event;
 * it also reloads when the calendar day changes (estimates move with the date).
 */
export function useSchedules(bikeId: string | null) {
  const today = useToday();
  const status = useMaintenanceStore((s) => s.status);
  const items = useMaintenanceStore((s) => s.items);
  const health = useMaintenanceStore((s) => s.health);
  const healthIsEstimated = useMaintenanceStore((s) => s.healthIsEstimated);
  const odometer = useMaintenanceStore((s) => s.odometer);
  const storeBikeId = useMaintenanceStore((s) => s.bikeId);
  const storeDay = useMaintenanceStore((s) => s.day);
  const load = useMaintenanceStore((s) => s.load);
  const clear = useMaintenanceStore((s) => s.clear);

  useEffect(() => {
    if (bikeId === null) {
      clear();
      return;
    }
    if (status === 'idle' || storeBikeId !== bikeId || storeDay !== today) {
      load(bikeId, today);
    }
  }, [bikeId, today, status, storeBikeId, storeDay, load, clear]);

  const current = storeBikeId === bikeId;
  return {
    items: current ? items : [],
    health: current ? health : null,
    healthIsEstimated: current ? healthIsEstimated : false,
    odometer: current ? odometer : null,
    today,
    ready: status === 'ready' && current,
  };
}
