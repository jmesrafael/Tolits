import { create } from 'zustand';

import { MotorcycleRepository } from '@/db/repositories/MotorcycleRepository';
import { ScheduleRepository } from '@/db/repositories/ScheduleRepository';
import { todayIso } from '@/lib/dates';
import { onDomainEvents } from '@/lib/events';
import { OdometerService } from '@/services/OdometerService';
import { buildReminderItems, type ReminderItem } from '@/services/reminderItems';

export type { ReminderItem } from '@/services/reminderItems';

interface ReminderState {
  items: ReminderItem[];
  status: 'idle' | 'ready';
  /** Calendar day the items were computed for — screens reload when it changes. */
  day: string | null;
  load: (today?: string) => void;
}

/** In-app Reminders list (S-05) — overdue/due-soon across all non-archived bikes, no OS scheduling. */
export const useReminderStore = create<ReminderState>((set) => ({
  items: [],
  status: 'idle',
  day: null,
  load: (today = todayIso()) => {
    const items: ReminderItem[] = [];
    for (const bike of MotorcycleRepository.list().filter((b) => b.isArchived === 0)) {
      // Same live estimate the dashboard uses (last actual reading + elapsed days × rate).
      const snapshot = OdometerService.getSnapshot(bike.id, today);
      items.push(...buildReminderItems(bike, ScheduleRepository.listByBike(bike.id), snapshot, today));
    }
    const order: Record<ReminderItem['bucket'], number> = { overdue: 0, thisWeek: 1, later: 2 };
    items.sort((a, b) => order[a.bucket] - order[b.bucket]);
    set({ items, status: 'ready', day: today });
  },
}));

onDomainEvents(
  ['schedule:changed', 'maintenance:changed', 'odometer:changed', 'bike:changed'],
  () => {
    if (useReminderStore.getState().status === 'ready') {
      useReminderStore.getState().load();
    }
  },
);
