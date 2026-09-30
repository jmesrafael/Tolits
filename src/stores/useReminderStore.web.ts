import { create } from 'zustand';

import type { ReminderItem } from '@/services/reminderItems';

export type { ReminderItem } from '@/services/reminderItems';

interface ReminderState {
  items: ReminderItem[];
  status: 'idle' | 'ready';
  day: string | null;
  load: (today?: string) => void;
}

/** Web preview store: reminders are derived from native SQLite data. */
export const useReminderStore = create<ReminderState>((set) => ({
  items: [],
  status: 'idle',
  day: null,
  load: (today) => set({ items: [], status: 'ready', day: today ?? null }),
}));
