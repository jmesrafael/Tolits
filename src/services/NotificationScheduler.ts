/**
 * NotificationScheduler — the expo-notifications adapter side of
 * NOTIFICATION_ENGINE.md. Gathers rows via repositories, hands them to the
 * pure `planReminders`, then executes the plan against the OS: cancel
 * everything Tolits owns, schedule the fresh plan, persist the new
 * `scheduled_notifications` rows (§5). Never throws — scheduling failures are
 * logged and swallowed (§9); the in-app Reminders list (S-05) remains the
 * source of truth regardless of whether this succeeded.
 *
 * Tap handling lives in `wireNotificationResponses` (T-404). Still open (see
 * docs/PROGRESS.md): device-real verification (T-407) and the dev fire-time override (T-406).
 */

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import type { DocumentRow, ScheduleRow } from '@/db/schema';
import { DocumentRepository } from '@/db/repositories/DocumentRepository';
import { MotorcycleRepository } from '@/db/repositories/MotorcycleRepository';
import { ScheduleRepository } from '@/db/repositories/ScheduleRepository';
import { ScheduledNotificationRepository } from '@/db/repositories/ScheduledNotificationRepository';
import { SettingsRepository } from '@/db/repositories/SettingsRepository';
import { componentLabel } from '@/features/maintenance/componentMeta';
import { interpolate, strings } from '@/i18n/strings';
import { daysBetween, nowMs, todayIso } from '@/lib/dates';
import { onDomainEvents } from '@/lib/events';
import { formatMonthDay } from '@/lib/format';
import { log } from '@/lib/log';
import type { ComponentType, DocType } from '@/types/enums';
import type { DailyRateResult } from './FuelService';
import { OdometerService } from './OdometerService';
import { routeForNotificationKey } from './notificationRoute';
import {
  DEFAULT_REMINDER_SETTINGS,
  type NotificationPrefs,
  type PlanEntry,
  type PlannerInput,
  planReminders,
  type QuietHours,
  type ReminderSettings,
} from './ReminderPlanner';

const CHANNEL = {
  maintenance: 'maintenance',
  documents: 'documents',
  utility: 'utility',
} as const;

const SETTINGS_KEYS = {
  fireTime: 'fire_time',
  quietHours: 'quiet_hours',
  prefs: 'notification_prefs',
} as const;

export function loadReminderSettings(): ReminderSettings {
  return {
    fireTime: SettingsRepository.get<string>(SETTINGS_KEYS.fireTime, DEFAULT_REMINDER_SETTINGS.fireTime),
    quietHours: SettingsRepository.get<QuietHours | null>(SETTINGS_KEYS.quietHours, DEFAULT_REMINDER_SETTINGS.quietHours),
    prefs: SettingsRepository.get<NotificationPrefs>(SETTINGS_KEYS.prefs, DEFAULT_REMINDER_SETTINGS.prefs),
  };
}

export function saveReminderSettings(settings: ReminderSettings): void {
  SettingsRepository.set(SETTINGS_KEYS.fireTime, settings.fireTime);
  SettingsRepository.set(SETTINGS_KEYS.quietHours, settings.quietHours);
  SettingsRepository.set(SETTINGS_KEYS.prefs, settings.prefs);
}

async function configureAndroidChannels(): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }
  await Notifications.setNotificationChannelAsync(CHANNEL.maintenance, {
    name: 'Maintenance reminders',
    importance: Notifications.AndroidImportance.HIGH,
  });
  await Notifications.setNotificationChannelAsync(CHANNEL.documents, {
    name: 'Document expiry',
    importance: Notifications.AndroidImportance.HIGH,
  });
  await Notifications.setNotificationChannelAsync(CHANNEL.utility, {
    name: 'Backup & other reminders',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

/** Call once at app startup (ADR-025: local-only, best-effort delivery). */
export function initNotifications(): void {
  if (Platform.OS === 'web') {
    return;
  }
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
  configureAndroidChannels().catch((error: unknown) => {
    log.error('notifications.channelSetupFailed', { error: String(error) });
  });
}

export type PermissionStatus = 'granted' | 'denied' | 'undetermined';

export async function getNotificationPermissionStatus(): Promise<PermissionStatus> {
  if (Platform.OS === 'web') {
    return 'denied';
  }
  try {
    const settings = await Notifications.getPermissionsAsync();
    if (settings.granted) {
      return 'granted';
    }
    return settings.canAskAgain === false ? 'denied' : 'undetermined';
  } catch (error) {
    log.error('notifications.getPermissionsFailed', { error: String(error) });
    return 'undetermined';
  }
}

/** S-00e / S-31 "Enable reminders" action. */
export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'web') {
    return false;
  }
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) {
      return true;
    }
    const requested = await Notifications.requestPermissionsAsync();
    return requested.granted;
  } catch (error) {
    log.error('notifications.requestPermissionFailed', { error: String(error) });
    return false;
  }
}

function gatherPlannerInput(settings: ReminderSettings): PlannerInput {
  const today = todayIso();
  const schedulesByBike: Record<string, ScheduleRow[]> = {};
  const rateByBike: Record<string, DailyRateResult> = {};
  const bikes: PlannerInput['bikes'][number][] = [];
  for (const b of MotorcycleRepository.list()) {
    // Actual reading + its real date + the shared rate; the planner projects from these.
    const snapshot = b.isArchived === 1 ? null : OdometerService.getSnapshot(b.id, today);
    bikes.push({
      id: b.id,
      nickname: b.nickname,
      currentOdometerKm: b.currentOdometerKm,
      lastReadingDate: snapshot?.actualDate ?? null,
      isArchived: b.isArchived,
    });
    if (snapshot === null) {
      continue;
    }
    schedulesByBike[b.id] = ScheduleRepository.listByBike(b.id);
    rateByBike[b.id] = snapshot.rate;
  }

  const documents: DocumentRow[] = DocumentRepository.listAll();

  return { bikes, schedulesByBike, rateByBike, documents, settings };
}

function relativeDayLabel(daysUntil: number): string {
  if (daysUntil <= 0) {
    return strings.notification.relativeDay.today;
  }
  if (daysUntil === 1) {
    return strings.notification.relativeDay.tomorrow;
  }
  return interpolate(strings.notification.relativeDay.inDays, { days: daysUntil });
}

function overdueAmountLabel(entry: PlanEntry): string {
  if (entry.data.governs === 'km' && entry.data.remainingKm !== null && entry.data.remainingKm !== undefined) {
    return `${Math.abs(entry.data.remainingKm)} km`;
  }
  if (entry.data.remainingDays !== null && entry.data.remainingDays !== undefined) {
    const days = Math.abs(entry.data.remainingDays);
    return days === 1 ? '1 day' : `${days} days`;
  }
  return 'a while';
}

function buildContent(entry: PlanEntry, todayIso_: string): { title: string; body: string; channelId: string } {
  if (entry.notificationType === 'maintenance_due' || entry.notificationType === 'maintenance_overdue') {
    const component = componentLabel((entry.data.componentType as ComponentType) ?? 'custom', entry.data.customName ?? null);
    const bike = entry.data.bikeNickname ?? '';

    if (entry.notificationType === 'maintenance_overdue') {
      return {
        title: interpolate(strings.notification.overdue.title, { component }),
        body: interpolate(strings.notification.overdue.body, { bike, component, overdueAmount: overdueAmountLabel(entry) }),
        channelId: CHANNEL.maintenance,
      };
    }

    if (entry.data.lowConfidence) {
      return {
        title: interpolate(strings.notification.due.lowConfidence.title, { component }),
        body: interpolate(strings.notification.due.lowConfidence.body, {
          bike,
          component,
          date: formatMonthDay(entry.fireDateIso),
        }),
        channelId: CHANNEL.maintenance,
      };
    }

    if (entry.data.governs === 'km') {
      return {
        title: interpolate(strings.notification.due.km.title, { component }),
        body: interpolate(strings.notification.due.km.body, {
          bike,
          component,
          remainingKm: entry.data.remainingKm ?? 0,
        }),
        channelId: CHANNEL.maintenance,
      };
    }

    const relativeDay = relativeDayLabel(daysBetween(todayIso_, entry.fireDateIso));
    return {
      title: interpolate(strings.notification.due.time.title, { component, relativeDay }),
      body: interpolate(strings.notification.due.time.body, { bike, component, relativeDay }),
      channelId: CHANNEL.maintenance,
    };
  }

  // document_expiry
  const docTypeLabel = strings.docTypes[(entry.data.docType as DocType) ?? 'other'];
  const relativeDay = relativeDayLabel(daysBetween(todayIso_, entry.fireDateIso));
  return {
    title: interpolate(strings.notification.documentExpiry.title, { docType: docTypeLabel, relativeDay }),
    body: interpolate(strings.notification.documentExpiry.body, {
      bike: entry.data.bikeNickname ?? entry.data.docTitle ?? '',
      date: formatMonthDay(entry.fireDateIso),
    }),
    channelId: CHANNEL.documents,
  };
}

/**
 * Runs the full re-plan cycle (NOTIFICATION_ENGINE.md §5): cancel everything
 * Tolits owns, compute the fresh plan, schedule it, persist the new rows.
 * Safe to call as often as needed — every domain event and app foreground.
 */
export async function replanNotifications(): Promise<void> {
  if (Platform.OS === 'web') {
    return; // local scheduled notifications aren't a web concern for this MVP
  }
  try {
    const permission = await getNotificationPermissionStatus();
    if (permission !== 'granted') {
      return; // in-app Reminders list remains correct regardless (§9a)
    }

    const settings = loadReminderSettings();
    const plannerInput = gatherPlannerInput(settings);
    const plan = planReminders(plannerInput, nowMs());

    // Clear at the OS level, not per row: a row we fail to cancel would be
    // dropped from the table and its OS notification would fire forever as an
    // orphan, duplicating every later reminder. Every scheduled notification in
    // this app is Tolits's, so cancel-all is safe (same assumption as delete-all).
    // If the OS refuses, schedule nothing new on top of the old ones.
    try {
      await Notifications.cancelAllScheduledNotificationsAsync();
    } catch (error) {
      log.error('notifications.cancelAllFailed', { error: String(error) });
      return;
    }
    ScheduledNotificationRepository.deleteAll();

    const today = todayIso();
    const persisted: { notificationId: string; sourceType: 'schedule' | 'document'; sourceId: string; fireAt: number }[] = [];
    for (const entry of plan) {
      const content = buildContent(entry, today);
      try {
        const notificationId = await Notifications.scheduleNotificationAsync({
          content: { title: content.title, body: content.body, data: { key: entry.key } },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: entry.fireAtMs,
            channelId: content.channelId,
          },
        });
        persisted.push({ notificationId, sourceType: entry.sourceType, sourceId: entry.sourceId, fireAt: entry.fireAtMs });
      } catch (error) {
        log.error('notifications.scheduleFailed', { error: String(error), key: entry.key });
      }
    }
    ScheduledNotificationRepository.insertMany(persisted);
  } catch (error) {
    log.error('notifications.replanFailed', { error: String(error) });
  }
}

/**
 * Cancels every notification Tolits has scheduled with the OS (Delete all data,
 * SECURITY.md §6). Must run BEFORE the `scheduled_notifications` rows are
 * wiped — re-planning afterwards could only cancel what it still has rows for,
 * so already-scheduled reminders for deleted bikes would still fire. Uses the
 * OS-level cancel-all (every scheduled notification in this app is Tolits's),
 * which also catches any row the table lost track of. Never throws.
 */
export async function cancelAllOwnedNotifications(): Promise<void> {
  if (Platform.OS === 'web') {
    return;
  }
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch (error) {
    log.warn('notifications.cancelAllFailed', { error: String(error) });
  }
}

let replanInFlight = false;
let replanQueued = false;

/**
 * Serialized re-plan trigger (§5, T-403): coalesces bursts of domain events
 * and foreground triggers into a single in-flight `replanNotifications` call,
 * queuing at most one more run for whatever changed after it started.
 */
export function triggerReplan(): void {
  if (replanInFlight) {
    replanQueued = true;
    return;
  }
  replanInFlight = true;
  replanNotifications()
    .catch((error: unknown) => log.error('notifications.triggerReplanFailed', { error: String(error) }))
    .then(() => {
      replanInFlight = false;
      if (replanQueued) {
        replanQueued = false;
        triggerReplan();
      }
    });
}

/**
 * Subscribes the re-plan trigger to every event NOTIFICATION_ENGINE.md §5
 * lists (all data changes that can move a due date or expiry). App
 * foreground is wired separately in `_layout.tsx` via `AppState` (§9a: this
 * is also the reboot/timezone recovery path). Call once at startup.
 */
export function wireNotificationCascade(): () => void {
  return onDomainEvents(
    [
      'maintenance:changed',
      'odometer:changed',
      'fuel:changed',
      'schedule:changed',
      'document:changed',
      'bike:changed',
      'settings:changed',
    ],
    () => triggerReplan(),
  );
}

/**
 * Opens the record a reminder is about when the user taps it (T-404). Covers a
 * tap while running, a tap that cold-starts the app (last response), and the
 * same tap delivered again on relaunch: each response is handled once.
 */
export function wireNotificationResponses(open: (route: string) => void): () => void {
  if (Platform.OS === 'web') {
    return () => {};
  }
  let handled: string | null = null;
  const handle = (response: Notifications.NotificationResponse | null) => {
    if (response === null) {
      return;
    }
    const identifier = response.notification.request.identifier;
    if (identifier === handled) {
      return;
    }
    handled = identifier;
    open(routeForNotificationKey(response.notification.request.content.data?.key));
  };
  const subscription = Notifications.addNotificationResponseReceivedListener(handle);
  Notifications.getLastNotificationResponseAsync()
    .then(handle)
    .catch((error: unknown) => log.warn('notifications.lastResponseFailed', { error: String(error) }));
  return () => subscription.remove();
}
