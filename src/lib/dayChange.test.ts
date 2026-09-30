import { msUntilNextLocalDay, subscribeToDayChange } from './dayChange';

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date(2026, 7, 11, 23, 59, 0)); // Aug 11, 23:59 local
});

afterEach(() => {
  jest.useRealTimers();
});

describe('msUntilNextLocalDay', () => {
  test('counts to the next local midnight', () => {
    expect(msUntilNextLocalDay(new Date(2026, 7, 11, 23, 59, 0))).toBe(60_000);
    expect(msUntilNextLocalDay(new Date(2026, 7, 11, 0, 0, 0))).toBe(24 * 3_600_000);
  });

  test('crosses month and year ends', () => {
    expect(msUntilNextLocalDay(new Date(2026, 11, 31, 23, 0, 0))).toBe(3_600_000);
  });
});

describe('subscribeToDayChange', () => {
  test('fires once just after midnight with the new date, then re-arms (one timer only)', () => {
    const seen: string[] = [];
    const sub = subscribeToDayChange((d) => seen.push(d));
    expect(jest.getTimerCount()).toBe(1);
    jest.advanceTimersByTime(59_000);
    expect(seen).toEqual([]); // not before midnight
    jest.advanceTimersByTime(3_000);
    expect(seen).toEqual(['2026-08-12']);
    expect(jest.getTimerCount()).toBe(1); // re-armed for the next day, no accumulation
    jest.advanceTimersByTime(24 * 3_600_000);
    expect(seen).toEqual(['2026-08-12', '2026-08-13']);
    sub.cancel();
  });

  test('no polling: nothing fires during the day', () => {
    const onChange = jest.fn();
    const sub = subscribeToDayChange(onChange);
    jest.advanceTimersByTime(30_000);
    expect(onChange).not.toHaveBeenCalled();
    sub.cancel();
  });

  test('cancel clears the timer and is idempotent', () => {
    const onChange = jest.fn();
    const sub = subscribeToDayChange(onChange);
    sub.cancel();
    sub.cancel();
    expect(jest.getTimerCount()).toBe(0);
    jest.advanceTimersByTime(48 * 3_600_000);
    expect(onChange).not.toHaveBeenCalled();
  });

  test('check() notifies only when the date actually changed (e.g. on app resume after sleep)', () => {
    const onChange = jest.fn();
    const sub = subscribeToDayChange(onChange);
    sub.check();
    expect(onChange).not.toHaveBeenCalled();
    jest.setSystemTime(new Date(2026, 7, 14, 9, 0, 0)); // phone slept; timers didn't run
    sub.check();
    expect(onChange).toHaveBeenCalledWith('2026-08-14');
    sub.check();
    expect(onChange).toHaveBeenCalledTimes(1);
    sub.cancel();
  });

  test('initialDay: a change that happened before subscribing is still reported', () => {
    const onChange = jest.fn();
    const sub = subscribeToDayChange(onChange, { initialDay: '2026-08-10' });
    sub.check();
    expect(onChange).toHaveBeenCalledWith('2026-08-11');
    sub.cancel();
  });
});
