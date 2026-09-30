import type { DocumentRow, ScheduleRow } from '@/db/schema';
import {
  DEFAULT_REMINDER_SETTINGS,
  overdueNagDates,
  overdueNotificationsEnded,
  type PlannerBike,
  type PlannerInput,
  planReminders,
  REMINDER_CAP_PER_BIKE,
  REMINDER_CAP_TOTAL,
} from './ReminderPlanner';

const NOW = new Date('2026-07-06T00:00:00').getTime(); // matches other suites' reference date

function makeBike(overrides: Partial<PlannerBike> = {}): PlannerBike {
  // Last actual reading taken "today" by default, so the pre-existing cases have no elapsed time to project.
  return {
    id: 'bike-1',
    nickname: 'Red Click',
    currentOdometerKm: 20000,
    lastReadingDate: '2026-07-06',
    isArchived: 0,
    ...overrides,
  };
}

function makeSchedule(overrides: Partial<ScheduleRow> = {}): ScheduleRow {
  return {
    id: 'sched-1',
    createdAt: 0,
    updatedAt: 0,
    deletedAt: null,
    motorcycleId: 'bike-1',
    componentType: 'engine_oil',
    customName: null,
    intervalKm: 1500,
    intervalMonths: null,
    isEnabled: 1,
    isMuted: 0,
    snoozedUntil: null,
    anchorOdometerKm: 20000,
    anchorDate: null,
    anchorSource: 'record',
    isPinned: 0,
    pinnedSortOrder: 0,
    sortOrder: 0,
    ...overrides,
  };
}

function makeDocument(overrides: Partial<DocumentRow> = {}): DocumentRow {
  return {
    id: 'doc-1',
    createdAt: 0,
    updatedAt: 0,
    deletedAt: null,
    motorcycleId: 'bike-1',
    docType: 'orcr',
    title: 'OR/CR',
    filePath: '/x',
    mimeType: 'image/jpeg',
    fileSize: 100,
    expiryDate: null,
    notes: null,
    documentNumber: null,
    link: null,
    extraFiles: null,
    ...overrides,
  };
}

function plan(input: Partial<PlannerInput>, now = NOW) {
  return planReminders(
    {
      bikes: [makeBike()],
      schedulesByBike: {},
      rateByBike: {},
      documents: [],
      settings: DEFAULT_REMINDER_SETTINGS,
      ...input,
    },
    now,
  );
}

describe('planReminders — km-based due soon (§4)', () => {
  test('outside the 3-day lead window → nothing planned yet', () => {
    // rate 100 km/day, remaining 1000 km → 10 days out, lead window is 3 days
    const schedule = makeSchedule({ anchorOdometerKm: 19000, intervalKm: 2000 }); // used 1000, remaining 1000
    const entries = plan({
      schedulesByBike: { 'bike-1': [schedule] },
      rateByBike: { 'bike-1': { rate: 100, confidence: 'high', source: 'window30' } },
    });
    expect(entries).toHaveLength(0);
  });

  test('inside the 3-day lead window → plans the -3-day and due-date entries', () => {
    // anchor 18800, interval 1500, current 20000 → used 1200, remaining 300; at 100 km/day → due in 3 days
    const schedule = makeSchedule({ anchorOdometerKm: 18800, intervalKm: 1500 });
    const entries = plan({
      schedulesByBike: { 'bike-1': [schedule] },
      rateByBike: { 'bike-1': { rate: 100, confidence: 'high', source: 'window30' } },
    });
    expect(entries).toHaveLength(2);
    expect(entries.every((e) => e.notificationType === 'maintenance_due')).toBe(true);
    expect(entries.map((e) => e.fireDateIso).sort()).toEqual(['2026-07-06', '2026-07-09']);
  });

  test('low-confidence rate is surfaced on the entry', () => {
    const schedule = makeSchedule({ anchorOdometerKm: 18800, intervalKm: 1500 });
    const entries = plan({
      schedulesByBike: { 'bike-1': [schedule] },
      rateByBike: { 'bike-1': { rate: 100, confidence: 'low', source: 'window90' } },
    });
    expect(entries[0]?.data.lowConfidence).toBe(true);
  });
});

describe('planReminders — time-based due soon (§3)', () => {
  test('outside the 7-day lead window → nothing planned', () => {
    const schedule = makeSchedule({
      componentType: 'coolant',
      intervalKm: null,
      intervalMonths: 12,
      anchorOdometerKm: null,
      anchorDate: '2025-08-01', // due 2026-08-01ish, well past 7 days out from 2026-07-06
    });
    const entries = plan({ schedulesByBike: { 'bike-1': [schedule] } });
    expect(entries).toHaveLength(0);
  });

  test('inside the 7-day lead window → plans -7-day and due-date entries', () => {
    // interval_days = round(1 * 30.44) = 30; anchor 2026-06-06 → due 2026-07-06 (today)
    const schedule = makeSchedule({
      componentType: 'coolant',
      intervalKm: null,
      intervalMonths: 1,
      anchorOdometerKm: null,
      anchorDate: '2026-06-06',
    });
    const entries = plan({ schedulesByBike: { 'bike-1': [schedule] } });
    // due date is today → this is the r>=1.00 boundary, so it's classified overdue (day 0), not due-soon.
    expect(entries.every((e) => e.notificationType === 'maintenance_overdue')).toBe(true);
  });
});

describe('planReminders — overdue nags (§6)', () => {
  test('plans up to 3 weekly occurrences from the due date, silent once all have passed', () => {
    // due date was 20 days ago (well past 3 nags at +0/+7/+14)
    const schedule = makeSchedule({ anchorOdometerKm: 18000, intervalKm: 1500 }); // due at 19500; bike at 20000 → 500 over
    const entries = plan({
      schedulesByBike: { 'bike-1': [schedule] },
      rateByBike: { 'bike-1': { rate: 25, confidence: 'high', source: 'window30' } }, // 500km / 25 = 20 days overdue
    });
    expect(entries).toHaveLength(0); // all 3 occurrences (day 0, 7, 14) are in the past
  });

  test('recently overdue → remaining future occurrences only', () => {
    // anchor 18450, interval 1500, current 20000 → 50 km over → 2 days overdue at 25 km/day.
    // Occurrences at due-2, due+5, due+12 relative to today; only the future two survive.
    const schedule = makeSchedule({ anchorOdometerKm: 18450, intervalKm: 1500 });
    const entries = plan({
      schedulesByBike: { 'bike-1': [schedule] },
      rateByBike: { 'bike-1': { rate: 25, confidence: 'high', source: 'window30' } },
    });
    expect(entries.every((e) => e.notificationType === 'maintenance_overdue')).toBe(true);
    expect(entries.map((e) => e.fireDateIso).sort()).toEqual(['2026-07-11', '2026-07-18']);
  });

  test('due exactly today (ratio boundary = 1.00) is the first overdue occurrence', () => {
    const schedule = makeSchedule({ anchorOdometerKm: 18500, intervalKm: 1500 }); // due at 20000 == current
    const entries = plan({
      schedulesByBike: { 'bike-1': [schedule] },
      rateByBike: { 'bike-1': { rate: 25, confidence: 'high', source: 'window30' } },
    });
    expect(entries.map((e) => e.fireDateIso).sort()).toEqual(['2026-07-06', '2026-07-13', '2026-07-20']);
  });
});

describe('planReminders — schedule filters', () => {
  test('disabled schedule is skipped entirely', () => {
    const schedule = makeSchedule({ isEnabled: 0, anchorOdometerKm: 18500, intervalKm: 1500 });
    expect(plan({ schedulesByBike: { 'bike-1': [schedule] } })).toHaveLength(0);
  });

  test('muted schedule is skipped entirely', () => {
    const schedule = makeSchedule({ isMuted: 1, anchorOdometerKm: 18500, intervalKm: 1500 });
    expect(plan({ schedulesByBike: { 'bike-1': [schedule] } })).toHaveLength(0);
  });

  test('snoozed schedule (until a future date) is skipped', () => {
    const schedule = makeSchedule({ snoozedUntil: '2026-07-20', anchorOdometerKm: 18500, intervalKm: 1500 });
    expect(plan({ schedulesByBike: { 'bike-1': [schedule] } })).toHaveLength(0);
  });

  test('un-anchored schedule is skipped (no due dimension to project)', () => {
    const schedule = makeSchedule({ anchorOdometerKm: null, anchorDate: null, anchorSource: null });
    expect(plan({ schedulesByBike: { 'bike-1': [schedule] } })).toHaveLength(0);
  });

  test('archived bike contributes no entries', () => {
    const schedule = makeSchedule({ anchorOdometerKm: 18500, intervalKm: 1500 });
    const entries = plan({
      bikes: [makeBike({ isArchived: 1 })],
      schedulesByBike: { 'bike-1': [schedule] },
    });
    expect(entries).toHaveLength(0);
  });

  test('disabling the maintenance_overdue pref suppresses overdue entries', () => {
    const schedule = makeSchedule({ anchorOdometerKm: 18500, intervalKm: 1500 });
    const entries = plan({
      schedulesByBike: { 'bike-1': [schedule] },
      settings: { ...DEFAULT_REMINDER_SETTINGS, prefs: { ...DEFAULT_REMINDER_SETTINGS.prefs, maintenance_overdue: false } },
    });
    expect(entries).toHaveLength(0);
  });
});

describe('planReminders — document expiry (§7)', () => {
  test('30/7/1-day lead entries for a future expiry', () => {
    const doc = makeDocument({ expiryDate: '2026-08-05' }); // 30 days out from 2026-07-06
    const entries = plan({ documents: [doc] });
    expect(entries.map((e) => e.fireDateIso).sort()).toEqual(['2026-07-06', '2026-07-29', '2026-08-04']);
    expect(entries.every((e) => e.notificationType === 'document_expiry')).toBe(true);
  });

  test('non-expiry doc type produces no entries', () => {
    const doc = makeDocument({ docType: 'receipt', expiryDate: '2026-08-05' });
    expect(plan({ documents: [doc] })).toHaveLength(0);
  });

  test('already-expired document produces no entries (one-off case is deferred)', () => {
    const doc = makeDocument({ expiryDate: '2026-01-01' });
    expect(plan({ documents: [doc] })).toHaveLength(0);
  });
});

describe('planReminders — quiet hours (§6)', () => {
  test('a fire time inside quiet hours shifts to 08:00', () => {
    const schedule = makeSchedule({ anchorOdometerKm: 18500, intervalKm: 1500 });
    const entries = plan({
      schedulesByBike: { 'bike-1': [schedule] },
      settings: { ...DEFAULT_REMINDER_SETTINGS, fireTime: '22:00' }, // inside default 21:00–07:00 quiet window
    });
    const fired = new Date(entries[0]!.fireAtMs);
    expect(fired.getHours()).toBe(8);
    expect(fired.getMinutes()).toBe(0);
  });

  test('a fire time outside quiet hours is used as-is', () => {
    const schedule = makeSchedule({ anchorOdometerKm: 18500, intervalKm: 1500 });
    const entries = plan({
      schedulesByBike: { 'bike-1': [schedule] },
      settings: { ...DEFAULT_REMINDER_SETTINGS, fireTime: '10:00' },
    });
    const fired = new Date(entries[0]!.fireAtMs);
    expect(fired.getHours()).toBe(10);
  });

  test('quiet hours disabled (null) never shifts the fire time', () => {
    const schedule = makeSchedule({ anchorOdometerKm: 18500, intervalKm: 1500 });
    const entries = plan({
      schedulesByBike: { 'bike-1': [schedule] },
      settings: { ...DEFAULT_REMINDER_SETTINGS, fireTime: '22:00', quietHours: null },
    });
    const fired = new Date(entries[0]!.fireAtMs);
    expect(fired.getHours()).toBe(22);
  });
});

describe('planReminders — caps and priority (§5.3)', () => {
  test('caps at 12 pending per bike, keeping nearest-date-first within priority', () => {
    // 20 independent overdue schedules on the same bike, each producing 1 future occurrence.
    const schedules = Array.from({ length: 20 }, (_, i) =>
      makeSchedule({
        id: `sched-${i}`,
        anchorOdometerKm: 18500 - i, // slightly different due dates → distinct fire dates
        intervalKm: 1500,
      }),
    );
    const entries = plan({
      schedulesByBike: { 'bike-1': schedules },
      rateByBike: { 'bike-1': { rate: 25, confidence: 'high', source: 'window30' } },
    });
    expect(entries.length).toBeLessThanOrEqual(REMINDER_CAP_PER_BIKE);
  });

  test('caps at 48 total across many bikes', () => {
    const bikes = Array.from({ length: 6 }, (_, i) => makeBike({ id: `bike-${i}`, nickname: `Bike ${i}` }));
    const schedulesByBike: Record<string, ScheduleRow[]> = {};
    for (const bike of bikes) {
      schedulesByBike[bike.id] = Array.from({ length: 15 }, (_, i) =>
        makeSchedule({ id: `${bike.id}-sched-${i}`, motorcycleId: bike.id, anchorOdometerKm: 18500 - i, intervalKm: 1500 }),
      );
    }
    const rateByBike = Object.fromEntries(bikes.map((b) => [b.id, { rate: 25, confidence: 'high' as const, source: 'window30' as const }]));
    const entries = plan({ bikes, schedulesByBike, rateByBike });
    expect(entries.length).toBeLessThanOrEqual(REMINDER_CAP_TOTAL);
  });

  test('overdue entries outrank due-soon entries under the cap', () => {
    const overdue = makeSchedule({ id: 'overdue', anchorOdometerKm: 18500, intervalKm: 1500 });
    const dueSoon = makeSchedule({ id: 'due-soon', anchorOdometerKm: 18800, intervalKm: 1500 });
    const entries = plan({
      schedulesByBike: { 'bike-1': [overdue, dueSoon] },
      rateByBike: { 'bike-1': { rate: 100, confidence: 'high', source: 'window30' } },
    });
    const types = entries.map((e) => e.notificationType);
    expect(types).toContain('maintenance_overdue');
    expect(types).toContain('maintenance_due');
  });
});

describe('planReminders — projection starts from the last ACTUAL reading, not today', () => {
  const at = (iso: string) => new Date(`${iso}T00:00:00`).getTime();
  const high = (rate: number) => ({ rate, confidence: 'high' as const, source: 'window30' as const });

  test('scenario 1: reading 10 days old — those 10 days of riding are counted', () => {
    // 300 km left at the Jun 26 reading; 30 km/day → due Jul 6 (today), not Jul 16.
    const schedule = makeSchedule({ anchorOdometerKm: 18800, intervalKm: 1500 });
    const entries = plan({
      bikes: [makeBike({ currentOdometerKm: 20000, lastReadingDate: '2026-06-26' })],
      schedulesByBike: { 'bike-1': [schedule] },
      rateByBike: { 'bike-1': high(30) },
    });
    expect(entries.map((e) => e.notificationType)).toEqual([
      'maintenance_overdue',
      'maintenance_overdue',
      'maintenance_overdue',
    ]);
    expect(entries.map((e) => e.fireDateIso).sort()).toEqual(['2026-07-06', '2026-07-13', '2026-07-20']);
    // Copy uses today's estimate: 20,000 + 10 × 30 = 20,300 → 0 km left.
    expect(entries[0]?.data.remainingKm).toBe(0);
  });

  test('scenario 1 (contrast): the same reading taken today yields the later date', () => {
    const schedule = makeSchedule({ anchorOdometerKm: 18800, intervalKm: 1500 });
    const entries = plan({
      bikes: [makeBike({ currentOdometerKm: 20000, lastReadingDate: '2026-07-06' })],
      schedulesByBike: { 'bike-1': [schedule] },
      rateByBike: { 'bike-1': high(30) },
    });
    expect(entries).toHaveLength(0); // due Jul 16 — outside the 3-day lead window
  });

  test('scenario 2: the due date does not drift later while the user stops logging', () => {
    // Last reading Jun 26, 300 km left, 10 km/day → due Jul 26, whichever day the plan runs.
    const input = {
      bikes: [makeBike({ currentOdometerKm: 20000, lastReadingDate: '2026-06-26' })],
      schedulesByBike: { 'bike-1': [makeSchedule({ anchorOdometerKm: 18800, intervalKm: 1500 })] },
      rateByBike: { 'bike-1': high(10) },
    };
    expect(plan(input, at('2026-07-06'))).toHaveLength(0); // 20 days out
    expect(plan(input, at('2026-07-24')).map((e) => e.fireDateIso)).toEqual(['2026-07-26']);
    expect(plan(input, at('2026-07-25')).map((e) => e.fireDateIso)).toEqual(['2026-07-26']);
    // Past due: weekly nags keep counting from Jul 26 (the old formula would have reset to "today + 30 days").
    const late = plan(input, at('2026-07-30'));
    expect(late.every((e) => e.notificationType === 'maintenance_overdue')).toBe(true);
    expect(late.map((e) => e.fireDateIso).sort()).toEqual(['2026-08-02', '2026-08-09']);
  });

  test('scenario 3: no usable history — default rate, low confidence, deterministic', () => {
    // No rate entry (→ 25 km/day default) and no reading date (→ nothing elapsed to project).
    const input = {
      bikes: [makeBike({ currentOdometerKm: 20000, lastReadingDate: null })],
      schedulesByBike: { 'bike-1': [makeSchedule({ anchorOdometerKm: 18550, intervalKm: 1500 })] }, // 50 km left
      rateByBike: {},
    };
    const first = plan(input);
    expect(first.map((e) => e.fireDateIso)).toEqual(['2026-07-08']); // ceil(50 / 25) = 2 days; -3d lead is past
    expect(first[0]?.data.lowConfidence).toBe(true);
    // Text is computed for the fire date (Jul 8): 50 km left today − 2 days × 25 = 0 by then.
    expect(first[0]?.data.remainingKm).toBe(0);
    expect(plan(input)).toEqual(first);
  });

  test('time-based schedules are unaffected by the reading date', () => {
    const schedule = makeSchedule({
      componentType: 'coolant',
      intervalKm: null,
      intervalMonths: 1,
      anchorOdometerKm: null,
      anchorDate: '2026-06-10', // due 2026-07-10
    });
    const recent = plan({ bikes: [makeBike()], schedulesByBike: { 'bike-1': [schedule] } });
    const stale = plan({ bikes: [makeBike({ lastReadingDate: '2026-01-01' })], schedulesByBike: { 'bike-1': [schedule] } });
    expect(stale).toEqual(recent);
    expect(recent.map((e) => e.fireDateIso)).toEqual(['2026-07-10']);
  });
});

describe('planReminders — parked bike: no riding history (default rate)', () => {
  const assumed = { rate: 25, confidence: 'low' as const, source: 'default' as const };

  test('a reading 60 days old is NOT turned into an overdue item by the 25 km/day assumption', () => {
    // 300 km actually left at the last reading. The old projection assumed 60 × 25 = 1,500 km ridden → overdue nags.
    const entries = plan({
      bikes: [makeBike({ currentOdometerKm: 20000, lastReadingDate: '2026-05-07' })],
      schedulesByBike: { 'bike-1': [makeSchedule({ anchorOdometerKm: 18800, intervalKm: 1500 })] },
      rateByBike: { 'bike-1': assumed },
    });
    expect(entries.filter((e) => e.notificationType === 'maintenance_overdue')).toHaveLength(0);
    expect(entries).toHaveLength(0); // due ≈ today + 12 days: outside the lead window
  });

  test('a rough "due around" reminder is still planned from today when close', () => {
    const entries = plan({
      bikes: [makeBike({ currentOdometerKm: 20000, lastReadingDate: '2026-05-07' })],
      schedulesByBike: { 'bike-1': [makeSchedule({ anchorOdometerKm: 18550, intervalKm: 1500 })] }, // 50 km left
      rateByBike: { 'bike-1': assumed },
    });
    expect(entries.map((e) => [e.notificationType, e.fireDateIso, e.data.lowConfidence])).toEqual([
      ['maintenance_due', '2026-07-08', true],
    ]);
  });

  test('actually overdue km (by the real reading) is still overdue', () => {
    const entries = plan({
      bikes: [makeBike({ currentOdometerKm: 20000, lastReadingDate: '2026-05-07' })],
      schedulesByBike: { 'bike-1': [makeSchedule({ anchorOdometerKm: 18500, intervalKm: 1500 })] }, // 0 km left
      rateByBike: { 'bike-1': assumed },
    });
    expect(entries.map((e) => e.notificationType)).toContain('maintenance_overdue');
  });

  test('a measured (window) rate still counts the elapsed days — unchanged behavior', () => {
    const entries = plan({
      bikes: [makeBike({ currentOdometerKm: 20000, lastReadingDate: '2026-05-07' })],
      schedulesByBike: { 'bike-1': [makeSchedule({ anchorOdometerKm: 18800, intervalKm: 1500 })] },
      rateByBike: { 'bike-1': { rate: 25, confidence: 'low', source: 'window90' } },
    });
    expect(entries.every((e) => e.notificationType === 'maintenance_overdue')).toBe(true);
  });
});

describe('planReminders — notification text reflects the estimate on its own fire date', () => {
  test('the -3-day and due-day notifications carry different remaining km', () => {
    // Reading today, 300 km left, 100 km/day → due Jul 9; notifications on Jul 6 and Jul 9.
    const entries = plan({
      schedulesByBike: { 'bike-1': [makeSchedule({ anchorOdometerKm: 18800, intervalKm: 1500 })] },
      rateByBike: { 'bike-1': { rate: 100, confidence: 'high', source: 'window30' } },
    });
    const byDate = Object.fromEntries(entries.map((e) => [e.fireDateIso, e.data.remainingKm]));
    expect(byDate).toEqual({ '2026-07-06': 300, '2026-07-09': 0 });
  });

  test('later overdue nags report the larger overdue distance for their date', () => {
    // 50 km over at today's reading, 25 km/day → nags Jul 11 and Jul 18 (earlier one is past).
    const entries = plan({
      schedulesByBike: { 'bike-1': [makeSchedule({ anchorOdometerKm: 18450, intervalKm: 1500 })] },
      rateByBike: { 'bike-1': { rate: 25, confidence: 'high', source: 'window30' } },
    });
    const byDate = Object.fromEntries(entries.map((e) => [e.fireDateIso, e.data.remainingKm]));
    // Jul 11: 20,000 + 5 × 25 = 20,125 → 20,130 (10 km rounding) → 1,500 − 1,680 = −180; Jul 18: 20,300 → −350
    expect(byDate).toEqual({ '2026-07-11': -180, '2026-07-18': -350 });
  });

  test('time-governed notifications carry remaining days for their fire date', () => {
    const entries = plan({
      schedulesByBike: {
        'bike-1': [
          makeSchedule({ componentType: 'coolant', intervalKm: null, intervalMonths: 1, anchorOdometerKm: null, anchorDate: '2026-06-10' }),
        ],
      },
    });
    // due Jul 10: the Jul 10 entry says 0 days (the Jul 3 entry is already past)
    expect(entries.map((e) => [e.fireDateIso, e.data.remainingDays])).toEqual([['2026-07-10', 0]]);
  });
});

describe('overdue nag window — policy kept, end made visible', () => {
  test('three weekly dates from the due date', () => {
    expect(overdueNagDates('2026-07-01')).toEqual(['2026-07-01', '2026-07-08', '2026-07-15']);
  });

  test('ended only after the last nag date has passed', () => {
    expect(overdueNotificationsEnded('2026-07-01', '2026-07-15')).toBe(false); // last nag is today
    expect(overdueNotificationsEnded('2026-07-01', '2026-07-16')).toBe(true);
    expect(overdueNotificationsEnded('2026-07-10', '2026-07-06')).toBe(false); // not even due yet
  });

  test('planner and helper agree: no nags are planned once the window has ended', () => {
    // 20 days overdue at 25 km/day (the existing "silent" case)
    const schedule = makeSchedule({ anchorOdometerKm: 18000, intervalKm: 1500 });
    const entries = plan({
      schedulesByBike: { 'bike-1': [schedule] },
      rateByBike: { 'bike-1': { rate: 25, confidence: 'high', source: 'window30' } },
    });
    expect(entries).toHaveLength(0);
    expect(overdueNotificationsEnded('2026-06-16', '2026-07-06')).toBe(true);
  });
});

describe('planReminders — never schedules a fire time that has already passed today', () => {
  const localTime = (iso: string, h: number, m = 0, sec = 0, ms = 0) => {
    const [y, mo, d] = iso.split('-').map(Number);
    return new Date(y!, mo! - 1, d!, h, m, sec, ms).getTime();
  };
  // Due exactly today (0 km left) → overdue nags Jul 6, 13, 20 at the 08:00 fire time.
  const dueToday = {
    schedulesByBike: { 'bike-1': [makeSchedule({ anchorOdometerKm: 18500, intervalKm: 1500 })] },
    rateByBike: { 'bike-1': { rate: 25, confidence: 'high' as const, source: 'window30' as const } },
  };

  test('before the fire time: today’s notification is kept', () => {
    const entries = plan(dueToday, localTime('2026-07-06', 7, 59, 59, 999));
    expect(entries.map((e) => e.fireDateIso).sort()).toEqual(['2026-07-06', '2026-07-13', '2026-07-20']);
  });

  test('exactly at the fire time: dropped (it is no longer in the future)', () => {
    const entries = plan(dueToday, localTime('2026-07-06', 8));
    expect(entries.map((e) => e.fireDateIso).sort()).toEqual(['2026-07-13', '2026-07-20']);
  });

  test('after the fire time (10:00): dropped, later occurrences unaffected', () => {
    const entries = plan(dueToday, localTime('2026-07-06', 10));
    expect(entries.map((e) => e.fireDateIso).sort()).toEqual(['2026-07-13', '2026-07-20']);
    expect(entries.every((e) => e.fireAtMs > localTime('2026-07-06', 10))).toBe(true);
  });

  test('a custom fire time is respected (19:30 still ahead at 10:00)', () => {
    const settings = { ...DEFAULT_REMINDER_SETTINGS, fireTime: '19:30', quietHours: null };
    const entries = plan({ ...dueToday, settings }, localTime('2026-07-06', 10));
    expect(entries.map((e) => e.fireDateIso)).toContain('2026-07-06');
  });

  test('due-soon lead entry for today is dropped after its time; the due-day entry remains', () => {
    // 300 km left at 100 km/day → due Jul 9; lead entry Jul 6 08:00.
    const entries = plan(
      {
        schedulesByBike: { 'bike-1': [makeSchedule({ anchorOdometerKm: 18800, intervalKm: 1500 })] },
        rateByBike: { 'bike-1': { rate: 100, confidence: 'high', source: 'window30' } },
      },
      localTime('2026-07-06', 12),
    );
    expect(entries.map((e) => e.fireDateIso)).toEqual(['2026-07-09']);
  });

  test('document expiry reminders follow the same rule', () => {
    // Expires Jul 13 → reminders Jun 13 (past), Jul 6, Jul 12.
    const documents = [makeDocument({ expiryDate: '2026-07-13' })];
    expect(plan({ documents }, localTime('2026-07-06', 7)).map((e) => e.fireDateIso)).toEqual(['2026-07-06', '2026-07-12']);
    expect(plan({ documents }, localTime('2026-07-06', 9)).map((e) => e.fireDateIso)).toEqual(['2026-07-12']);
  });

  test('a dropped past entry does not consume a cap slot', () => {
    const now = localTime('2026-07-06', 10);
    const entries = plan(dueToday, now);
    expect(entries.every((e) => e.fireAtMs > now)).toBe(true);
    expect(entries).toHaveLength(2);
  });
});

describe('planReminders — regression: interactions with quiet hours, caps and the 14-day policy', () => {
  const localTime = (iso: string, h: number, m = 0) => {
    const [y, mo, d] = iso.split('-').map(Number);
    return new Date(y!, mo! - 1, d!, h, m).getTime();
  };
  const rate = { rate: 25, confidence: 'high' as const, source: 'window30' as const };

  test('quiet-hours shift still applies: a 22:00 fire time becomes 08:00, and is dropped once 08:00 has passed', () => {
    const settings = { ...DEFAULT_REMINDER_SETTINGS, fireTime: '22:00' }; // inside 21:00–07:00 quiet hours
    const input = {
      settings,
      schedulesByBike: { 'bike-1': [makeSchedule({ anchorOdometerKm: 18500, intervalKm: 1500 })] }, // due today
      rateByBike: { 'bike-1': rate },
    };
    const early = plan(input, localTime('2026-07-06', 6, 30));
    const shifted = early.find((e) => e.fireDateIso === '2026-07-06');
    expect(shifted?.fireAtMs).toBe(localTime('2026-07-06', 8)); // 22:00 → 08:00, not left in quiet hours
    const late = plan(input, localTime('2026-07-06', 9));
    expect(late.some((e) => e.fireDateIso === '2026-07-06')).toBe(false);
    expect(late.map((e) => e.fireDateIso).sort()).toEqual(['2026-07-13', '2026-07-20']); // later nags untouched
  });

  test('no quiet hours: the raw fire time is used for the past check', () => {
    const settings = { ...DEFAULT_REMINDER_SETTINGS, fireTime: '22:00', quietHours: null };
    const entries = plan(
      {
        settings,
        schedulesByBike: { 'bike-1': [makeSchedule({ anchorOdometerKm: 18500, intervalKm: 1500 })] },
        rateByBike: { 'bike-1': rate },
      },
      localTime('2026-07-06', 15),
    );
    expect(entries.find((e) => e.fireDateIso === '2026-07-06')?.fireAtMs).toBe(localTime('2026-07-06', 22));
  });

  test('per-bike cap: dropped past entries free their slot for future ones', () => {
    // 5 schedules due today → 3 nags each = 15 entries (cap 12/bike). At 10:00 the 5 same-day entries are
    // dropped, leaving 10 future entries — all kept. (Before the drop-past step they'd compete for 12 slots.)
    const schedules = Array.from({ length: 5 }, (_, i) => makeSchedule({ id: `s${i}`, anchorOdometerKm: 18500, intervalKm: 1500 }));
    const input = { schedulesByBike: { 'bike-1': schedules }, rateByBike: { 'bike-1': rate } };
    expect(plan(input, localTime('2026-07-06', 7))).toHaveLength(REMINDER_CAP_PER_BIKE); // capped at 12 of 15
    const afterEight = plan(input, localTime('2026-07-06', 10));
    expect(afterEight).toHaveLength(10);
    expect(afterEight.every((e) => e.fireDateIso !== '2026-07-06')).toBe(true);
  });

  test('priority order is unchanged: overdue outranks due-soon when the cap bites', () => {
    const entries = plan({
      schedulesByBike: { 'bike-1': [makeSchedule({ id: 'due', anchorOdometerKm: 18800, intervalKm: 1500 }), makeSchedule({ id: 'over', anchorOdometerKm: 18450, intervalKm: 1500 })] },
      rateByBike: { 'bike-1': { rate: 100, confidence: 'high', source: 'window30' } },
    });
    expect(entries[0]?.notificationType).toBe('maintenance_overdue');
  });

  test('14-day policy preserved: overdue exactly 14 days keeps its last nag today; 15 days is silent', () => {
    // due Jun 22 (14 days ago at 25 km/day → 350 km over): 3rd nag = Jul 6 08:00
    const at14 = plan(
      { schedulesByBike: { 'bike-1': [makeSchedule({ anchorOdometerKm: 18150, intervalKm: 1500 })] }, rateByBike: { 'bike-1': rate } },
      localTime('2026-07-06', 7),
    );
    expect(at14.map((e) => e.fireDateIso)).toEqual(['2026-07-06']);
    const at15 = plan(
      { schedulesByBike: { 'bike-1': [makeSchedule({ anchorOdometerKm: 18125, intervalKm: 1500 })] }, rateByBike: { 'bike-1': rate } },
      localTime('2026-07-06', 7),
    );
    expect(at15).toHaveLength(0);
  });

  test('exactly due (0 km left) still starts the overdue cycle, and copy data says 0 km', () => {
    const entries = plan(
      { schedulesByBike: { 'bike-1': [makeSchedule({ anchorOdometerKm: 18500, intervalKm: 1500 })] }, rateByBike: { 'bike-1': rate } },
      localTime('2026-07-06', 7),
    );
    expect(entries[0]).toMatchObject({ notificationType: 'maintenance_overdue', fireDateIso: '2026-07-06' });
    expect(entries[0]?.data.remainingKm).toBe(0);
  });
});
