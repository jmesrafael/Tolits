/**
 * Calendar-day change notifications, local time. One timer armed for just past
 * the next local midnight (no polling); `check()` lets callers re-test after
 * the app resumes, since timers don't run while a phone sleeps.
 */

import { toIsoDate } from './dates';

/** Slack past midnight so the timer never fires a hair early and sees the old day. */
const MIDNIGHT_SLACK_MS = 1_000;

/** Milliseconds from `now` until the next local midnight (DST-safe: uses calendar math). */
export function msUntilNextLocalDay(now: Date): number {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return next.getTime() - now.getTime();
}

export interface DaySubscription {
  /** Re-checks the date now (call on app resume); notifies only if the day changed. */
  check: () => void;
  /** Stops the timer. Safe to call more than once. */
  cancel: () => void;
}

export interface DayChangeOptions {
  /** The day the caller currently shows; defaults to today at subscribe time. */
  initialDay?: string;
  /** Clock override for tests. */
  now?: () => Date;
}

export function subscribeToDayChange(
  onDayChange: (todayIso: string) => void,
  { initialDay, now = () => new Date() }: DayChangeOptions = {},
): DaySubscription {
  let current = initialDay ?? toIsoDate(now());
  let timer: ReturnType<typeof setTimeout> | null = null;
  let cancelled = false;

  const check = (): void => {
    if (cancelled) {
      return;
    }
    const today = toIsoDate(now());
    if (today !== current) {
      current = today;
      onDayChange(today);
    }
  };

  const arm = (): void => {
    timer = setTimeout(() => {
      timer = null;
      check();
      if (!cancelled) {
        arm();
      }
    }, msUntilNextLocalDay(now()) + MIDNIGHT_SLACK_MS);
  };

  arm();

  return {
    check,
    cancel: () => {
      cancelled = true;
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };
}
