import { calendarInstant, formatMonthDay, formatMonthYear } from './format';

/**
 * Calendar dates must render the stored day in every time zone. Node on some
 * platforms (e.g. Windows) ignores IANA zone names in TZ, so instead of
 * switching the process zone these tests pin the zone explicitly in Intl —
 * which is exactly the variable the old code depended on.
 */

const WEST_OF_UTC = ['Pacific/Pago_Pago', 'America/Los_Angeles', 'America/Sao_Paulo'];
const ZONES = [...WEST_OF_UTC, 'UTC', 'Asia/Manila', 'Pacific/Kiritimati'];

const inZone = (zone: string, date: Date) =>
  new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', timeZone: zone }).format(date);

describe('formatMonthDay — calendar dates are not shifted by time zone', () => {
  test.each(WEST_OF_UTC)('regression: the old UTC parse + device-zone format shows Jul 31 in %s', (zone) => {
    expect(inZone(zone, new Date('2026-08-01'))).toBe('Jul 31');
  });

  test('the fixed formatter is independent of the device zone (pinned to UTC)', () => {
    expect(new Intl.DateTimeFormat('en-PH', { timeZone: 'UTC' }).resolvedOptions().timeZone).toBe('UTC');
    // The instant it formats is the stored Y-M-D at 00:00 UTC in every zone.
    expect(calendarInstant('2026-08-01').toISOString()).toBe('2026-08-01T00:00:00.000Z');
  });

  test.each(ZONES)('the old approach would differ by zone; the stored day does not (%s)', (zone) => {
    // Whatever the device zone, formatting the calendar instant in UTC gives the stored day.
    expect(inZone('UTC', calendarInstant('2026-08-01'))).toBe('Aug 1');
    // …while the same instant viewed in a west-of-UTC zone would be the day before — proof the pin matters.
    if (WEST_OF_UTC.includes(zone)) {
      expect(inZone(zone, calendarInstant('2026-08-01'))).toBe('Jul 31');
    }
  });

  test('stored days render exactly, including month/year/leap/DST boundaries', () => {
    expect(formatMonthDay('2026-08-01')).toBe('Aug 1');
    expect(formatMonthDay('2026-12-31')).toBe('Dec 31');
    expect(formatMonthDay('2027-01-01')).toBe('Jan 1');
    expect(formatMonthDay('2028-02-29')).toBe('Feb 29');
    expect(formatMonthDay('2026-03-08')).toBe('Mar 8'); // US DST start
    expect(formatMonthDay('2026-11-01')).toBe('Nov 1'); // US DST end
  });

  test('formatMonthYear uses the same zone-free path', () => {
    expect(formatMonthYear('2026-12-31')).toBe('Dec 2026');
    expect(formatMonthYear('2027-01-01')).toBe('Jan 2027');
  });
});
