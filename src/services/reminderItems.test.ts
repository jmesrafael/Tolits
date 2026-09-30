import type { ScheduleRow } from '@/db/schema';
import { buildOdometerSnapshot } from './odometerEstimate';
import { buildReminderItems } from './reminderItems';
import { formatRemaining } from '@/features/maintenance/remainingText';

const bike = { id: 'b1', nickname: 'Red Click', currentOdometerKm: 20000 };
const TODAY = '2026-07-06';
// Measured history: 10 km/day, last reading today.
const history = [
  { effectiveKm: 19700, recordedDate: '2026-06-06' },
  { effectiveKm: 20000, recordedDate: TODAY },
];

function schedule(overrides: Partial<ScheduleRow>): ScheduleRow {
  return {
    id: 's1',
    createdAt: 0,
    updatedAt: 0,
    deletedAt: null,
    motorcycleId: 'b1',
    componentType: 'engine_oil',
    customName: null,
    intervalKm: 1500,
    intervalMonths: null,
    isEnabled: 1,
    isMuted: 0,
    snoozedUntil: null,
    anchorOdometerKm: 18500,
    anchorDate: null,
    anchorSource: 'record',
    isPinned: 0,
    pinnedSortOrder: 0,
    sortOrder: 0,
    ...overrides,
  };
}

const snapshot = () => buildOdometerSnapshot(20000, TODAY, history, history, TODAY);

describe('buildReminderItems — overdue km is shown as overdue, not "in -N km"', () => {
  const cases: [string, number, string][] = [
    ['due soon', 18800, 'in 300 km'],
    ['exactly due', 18500, 'due now'],
    ['overdue', 18200, 'overdue by 300 km'],
    ['significantly overdue', 16000, 'overdue by 2,500 km'],
  ];
  test.each(cases)('%s', (_label, anchorOdometerKm, text) => {
    const [item] = buildReminderItems(bike, [schedule({ anchorOdometerKm })], snapshot(), TODAY);
    expect(item).toBeDefined();
    expect(formatRemaining(item!.status, item!.kmIsEstimate)).toBe(text);
  });

  test('the signed value is kept for logic', () => {
    const [item] = buildReminderItems(bike, [schedule({ anchorOdometerKm: 18200 })], snapshot(), TODAY);
    expect(item?.remainingKm).toBe(-300);
    expect(item?.bucket).toBe('overdue');
  });
});

describe('buildReminderItems — silent overdue items are flagged, policy unchanged', () => {
  test('recently overdue: nags still coming → not ended', () => {
    // 50 km over today at 10 km/day → due 5 days ago; nags on day 0/7/14 → two still ahead.
    const [item] = buildReminderItems(bike, [schedule({ anchorOdometerKm: 18450 })], snapshot(), TODAY);
    expect(item?.overdueSince).toBe('2026-07-01');
    expect(item?.notificationsEnded).toBe(false);
  });

  test('overdue past the 3rd nag (> 14 days) → still listed, flagged as no more notifications', () => {
    // 300 km over at 10 km/day → due Jun 6, last nag Jun 20.
    const [item] = buildReminderItems(bike, [schedule({ anchorOdometerKm: 18200 })], snapshot(), TODAY);
    expect(item?.bucket).toBe('overdue');
    expect(item?.overdueSince).toBe('2026-06-06');
    expect(item?.notificationsEnded).toBe(true);
  });

  test('boundary: overdue exactly 14 days (last nag is today) → not ended; 15 days → ended', () => {
    // 140 km over at 10 km/day → due Jun 22; 3rd nag Jul 6 (today).
    const [atLastNag] = buildReminderItems(bike, [schedule({ anchorOdometerKm: 18360 })], snapshot(), TODAY);
    expect(atLastNag?.overdueSince).toBe('2026-06-22');
    expect(atLastNag?.notificationsEnded).toBe(false);
    // 150 km over → due Jun 21; 3rd nag Jul 5 (yesterday).
    const [pastLastNag] = buildReminderItems(bike, [schedule({ anchorOdometerKm: 18350 })], snapshot(), TODAY);
    expect(pastLastNag?.overdueSince).toBe('2026-06-21');
    expect(pastLastNag?.notificationsEnded).toBe(true);
  });

  test('muted overdue items say notifications ended too', () => {
    const [item] = buildReminderItems(bike, [schedule({ anchorOdometerKm: 18450, isMuted: 1 })], snapshot(), TODAY);
    expect(item?.notificationsEnded).toBe(true);
  });

  test('due-soon items carry no overdue state', () => {
    const [item] = buildReminderItems(bike, [schedule({ anchorOdometerKm: 18800 })], snapshot(), TODAY);
    // km-only items have no remaining days, so they bucket as "Later" (existing behavior).
    expect(item).toMatchObject({ overdueSince: null, notificationsEnded: false, bucket: 'later' });
  });

  test('disabled and snoozed schedules are excluded (unchanged)', () => {
    const items = buildReminderItems(
      bike,
      [schedule({ id: 'a', isEnabled: 0, anchorOdometerKm: 18200 }), schedule({ id: 'b', snoozedUntil: '2026-07-10', anchorOdometerKm: 18200 })],
      snapshot(),
      TODAY,
    );
    expect(items).toHaveLength(0);
  });
});

describe('buildReminderItems — km-only items bucket by their projected due date', () => {
  // 10 km/day measured, reading today at 20,000 km, interval 1,500 km.
  const bucketOf = (anchorOdometerKm: number, snap = snapshot(), overrides: Partial<ScheduleRow> = {}) =>
    buildReminderItems(bike, [schedule({ anchorOdometerKm, ...overrides })], snap, TODAY)[0];

  test('due soon within the week → This week (regression: km-only was always "Later")', () => {
    const item = bucketOf(18550); // 50 km left → 5 days at 10 km/day
    expect(item?.status.status).toBe('dueSoon');
    expect(item?.bucket).toBe('thisWeek');
  });

  test('due soon but weeks away → Later', () => {
    expect(bucketOf(18800)?.bucket).toBe('later'); // 300 km → 30 days
  });

  test('boundary: 7 days → This week, 8 days → Later', () => {
    expect(bucketOf(18570)?.bucket).toBe('thisWeek'); // 70 km → 7 days
    expect(bucketOf(18580)?.bucket).toBe('later'); // 80 km → 8 days
  });

  test('due today (0 km left) → Overdue bucket, shown as "due now"', () => {
    const item = bucketOf(18500);
    expect(item?.bucket).toBe('overdue');
    expect(formatRemaining(item!.status, item!.kmIsEstimate)).toBe('due now');
  });

  test('overdue → Overdue', () => {
    expect(bucketOf(18000)?.bucket).toBe('overdue');
  });

  test('comfortably in the future → not listed at all', () => {
    expect(bucketOf(19500)).toBeUndefined(); // 500 of 1,500 km used
  });

  test('estimated vs actual: a 20-day-old reading moves the item into This week, marked as an estimate', () => {
    // Actual: 1,250 of 1,500 km used at the Jun 16 reading (~25 days left by the actual reading).
    const stale = buildOdometerSnapshot(
      20000,
      '2026-06-16',
      [
        { effectiveKm: 19700, recordedDate: '2026-05-17' },
        { effectiveKm: 20000, recordedDate: '2026-06-16' },
      ],
      [],
      TODAY,
    );
    const item = bucketOf(18750, stale);
    expect(item?.kmIsEstimate).toBe(true); // statuses use ~20,200 km
    expect(item?.remainingKm).toBe(50);
    expect(item?.bucket).toBe('thisWeek'); // due Jul 11 (Jun 16 + 25 days)
  });

  test('actual reading: same bike read today gives the same bucket from real data', () => {
    const item = bucketOf(18550);
    expect(item?.kmIsEstimate).toBe(false);
    expect(item?.bucket).toBe('thisWeek');
  });

  test('parked bike (default rate): bucketed from today with the rough rate, never pushed into Overdue', () => {
    const parked = buildOdometerSnapshot(20000, '2026-05-07', [], [], TODAY); // no riding history
    expect(bucketOf(18550, parked)?.bucket).toBe('thisWeek'); // 50 km actual → 2 days at 25 km/day
    expect(bucketOf(18800, parked)?.bucket).toBe('later'); // 300 km → 12 days
  });

  test('km + time schedule where km governs: the km due date decides (regression)', () => {
    // Time says ~80 days left; km says 5 days. Old code bucketed by the 80 days → "Later".
    const item = bucketOf(18550, snapshot(), { intervalMonths: 3, anchorDate: '2026-06-26' });
    expect(item?.status.governs).toBe('km');
    expect(item?.bucket).toBe('thisWeek');
  });

  test('time-only schedule is unchanged: bucketed by its calendar due date', () => {
    const timeOnly = { componentType: 'coolant', intervalKm: null, anchorOdometerKm: null, intervalMonths: 1 } as const;
    expect(bucketOf(0, snapshot(), { ...timeOnly, anchorDate: '2026-06-10' })?.bucket).toBe('thisWeek'); // due Jul 10
    expect(buildReminderItems(bike, [schedule({ ...timeOnly, anchorDate: '2026-06-10' })], null, TODAY)[0]?.bucket).toBe(
      'thisWeek',
    );
  });
});
