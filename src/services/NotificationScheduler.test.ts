/**
 * Re-plan invariant against a fake OS notification center: after any replan,
 * the OS holds exactly the planned notifications, no orphans from earlier runs.
 * Orphans are what turn into duplicate reminders later.
 */

import * as client from '@/db/client';
import { ScheduledNotificationRepository } from '@/db/repositories/ScheduledNotificationRepository';
import { clearAllTables } from '@/test/sqliteTestClient';
import { planReminders, type PlanEntry } from './ReminderPlanner';
import { replanNotifications, wireNotificationResponses } from './NotificationScheduler';

jest.mock('@/db/client', () =>
  jest.requireActual<typeof import('@/test/sqliteTestClient')>('@/test/sqliteTestClient').createTestClient(),
);
jest.mock('@/lib/uuid', () => ({
  newUuid: () => jest.requireActual<typeof import('crypto')>('crypto').randomUUID(),
}));
jest.mock('expo-notifications', () => {
  const os = new Map<string, { title: string }>();
  let counter = 0;
  return {
    __os: os,
    AndroidImportance: { HIGH: 4, DEFAULT: 3 },
    SchedulableTriggerInputTypes: { DATE: 'date' },
    setNotificationChannelAsync: jest.fn(async () => undefined),
    setNotificationHandler: jest.fn(),
    getPermissionsAsync: jest.fn(async () => ({ granted: true, canAskAgain: true })),
    requestPermissionsAsync: jest.fn(async () => ({ granted: true })),
    scheduleNotificationAsync: jest.fn(async (request: { content: { title: string } }) => {
      counter += 1;
      const id = `os-${counter}`;
      os.set(id, { title: request.content.title });
      return id;
    }),
    cancelScheduledNotificationAsync: jest.fn(async (id: string) => {
      os.delete(id);
    }),
    cancelAllScheduledNotificationsAsync: jest.fn(async () => {
      os.clear();
    }),
    addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
    getLastNotificationResponseAsync: jest.fn(async () => null),
  };
});
jest.mock('./ReminderPlanner', () => ({
  ...jest.requireActual<typeof import('./ReminderPlanner')>('./ReminderPlanner'),
  planReminders: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Notifications = require('expo-notifications') as {
  __os: Map<string, { title: string }>;
  cancelScheduledNotificationAsync: jest.Mock;
  cancelAllScheduledNotificationsAsync: jest.Mock;
  scheduleNotificationAsync: jest.Mock;
  addNotificationResponseReceivedListener: jest.Mock;
  getLastNotificationResponseAsync: jest.Mock;
};

function tapResponse(identifier: string, key: string) {
  return { notification: { request: { identifier, content: { data: { key } } } } };
}
const planner = planReminders as jest.MockedFunction<typeof planReminders>;

const sqlite = (client as unknown as { __sqlite: import('better-sqlite3').Database }).__sqlite;

function entry(sourceId: string, fireAtMs: number): PlanEntry {
  return {
    key: `schedule:${sourceId}:maintenance_due:2026-08-12`,
    sourceType: 'schedule',
    sourceId,
    bikeId: 'bike-1',
    notificationType: 'maintenance_due',
    fireAtMs,
    fireDateIso: '2026-08-12',
    data: { bikeNickname: 'Click', componentType: 'engine_oil', governs: 'days', remainingDays: 1 },
  } as PlanEntry;
}

beforeEach(() => {
  clearAllTables(sqlite);
  Notifications.__os.clear();
  jest.clearAllMocks();
});

describe('wireNotificationResponses (T-404)', () => {
  test('a cold-start tap opens the reminder target once, even if the listener re-delivers it', () => {
    let listener: ((response: unknown) => void) | undefined;
    Notifications.addNotificationResponseReceivedListener.mockImplementationOnce((fn: (r: unknown) => void) => {
      listener = fn;
      return { remove: jest.fn() };
    });
    const response = tapResponse('req-1', 'document:doc-9:document_expiry:2026-09-01');
    Notifications.getLastNotificationResponseAsync.mockResolvedValueOnce(response);
    const open = jest.fn();

    wireNotificationResponses(open);
    return Promise.resolve().then(() => {
      listener?.(response);
      expect(open).toHaveBeenCalledTimes(1);
      expect(open).toHaveBeenCalledWith('/documents/doc-9');
    });
  });

  test('a warm tap opens the maintenance component screen; unsubscribe removes the listener', () => {
    const remove = jest.fn();
    let listener: ((response: unknown) => void) | undefined;
    Notifications.addNotificationResponseReceivedListener.mockImplementationOnce((fn: (r: unknown) => void) => {
      listener = fn;
      return { remove };
    });
    const open = jest.fn();

    const off = wireNotificationResponses(open);
    listener?.(tapResponse('req-2', 'schedule:sched-7:maintenance_due:2026-08-12'));
    off();

    expect(open).toHaveBeenCalledWith('/maintenance/component/sched-7');
    expect(remove).toHaveBeenCalledTimes(1);
  });
});

describe('replanNotifications: OS state matches the plan', () => {
  test('a previously scheduled reminder that was not re-planned leaves no orphan in the OS', async () => {
    // Earlier run left one reminder in the OS and in our table.
    Notifications.__os.set('os-old', { title: 'Old reminder' });
    ScheduledNotificationRepository.insertMany([
      { notificationId: 'os-old', sourceType: 'schedule', sourceId: 'old-schedule', fireAt: 1 },
    ]);
    planner.mockReturnValue([entry('new-schedule', Date.parse('2026-08-12T08:00:00'))]);

    await replanNotifications();

    expect([...Notifications.__os.values()].map((n) => n.title)).toHaveLength(1);
    expect(Notifications.__os.has('os-old')).toBe(false);
    expect(ScheduledNotificationRepository.listAll()).toHaveLength(1);
  });

  test('a single failed per-notification cancel never leaves a stale notification behind', async () => {
    Notifications.__os.set('os-stuck', { title: 'Stuck reminder' });
    ScheduledNotificationRepository.insertMany([
      { notificationId: 'os-stuck', sourceType: 'schedule', sourceId: 'old-schedule', fireAt: 1 },
    ]);
    Notifications.cancelScheduledNotificationAsync.mockRejectedValueOnce(new Error('native cancel failed'));
    planner.mockReturnValue([entry('new-schedule', Date.parse('2026-08-12T08:00:00'))]);

    await replanNotifications();

    expect(Notifications.__os.has('os-stuck')).toBe(false);
    expect(Notifications.__os.size).toBe(1);
  });

  test('if the OS cannot clear old notifications, the replan schedules nothing new on top of them', async () => {
    Notifications.__os.set('os-old', { title: 'Old reminder' });
    ScheduledNotificationRepository.insertMany([
      { notificationId: 'os-old', sourceType: 'schedule', sourceId: 'old-schedule', fireAt: 1 },
    ]);
    Notifications.cancelAllScheduledNotificationsAsync.mockRejectedValueOnce(new Error('native cancel failed'));
    planner.mockReturnValue([entry('new-schedule', Date.parse('2026-08-12T08:00:00'))]);

    await replanNotifications();

    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
    expect(Notifications.__os.has('os-old')).toBe(true);
  });

  test('replanning twice with the same plan yields one OS notification per planned reminder', async () => {
    planner.mockReturnValue([
      entry('schedule-a', Date.parse('2026-08-12T08:00:00')),
      entry('schedule-b', Date.parse('2026-08-13T08:00:00')),
    ]);

    await replanNotifications();
    await replanNotifications();

    expect(Notifications.__os.size).toBe(2);
    expect(ScheduledNotificationRepository.listAll()).toHaveLength(2);
  });
});
