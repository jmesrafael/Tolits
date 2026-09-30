import { computeHealthScore, healthBand, itemScore, scoreUsesMileage } from './HealthScoreService';
import type { ScheduleStatus } from './StatusService';
import type { ScheduleRow } from '@/db/schema';

function makeSchedule(overrides: Partial<ScheduleRow>): ScheduleRow {
  return {
    id: overrides.id ?? 'sched-1',
    createdAt: 0,
    updatedAt: 0,
    deletedAt: null,
    motorcycleId: 'bike-1',
    componentType: 'engine_oil',
    customName: null,
    intervalKm: null,
    intervalMonths: null,
    isEnabled: 1,
    isMuted: 0,
    snoozedUntil: null,
    anchorOdometerKm: null,
    anchorDate: null,
    anchorSource: 'record',
    isPinned: 0,
    pinnedSortOrder: 0,
    sortOrder: 0,
    ...overrides,
  };
}

function makeStatus(scheduleId: string, ratio: number): ScheduleStatus {
  return {
    scheduleId,
    status: ratio >= 1 ? 'overdue' : ratio >= 0.8 ? 'dueSoon' : 'good',
    ratio,
    remainingKm: null,
    remainingDays: null,
    governs: 'km',
    anchored: true,
  };
}

describe('itemScore — HEALTH_SCORE.md §3 boundary vectors (§7C)', () => {
  test.each([
    [0.8, 100],
    [0.9, 85],
    [1.0, 70],
    [1.5, 35],
    [2.0, 0],
    [3.0, 0],
  ])('s(%f) = %f', (r, expected) => {
    expect(itemScore(r)).toBeCloseTo(expected, 5);
  });
});

describe('healthBand — HEALTH_SCORE.md §6 bands', () => {
  test.each([
    [95, 'excellent'],
    [90, 'excellent'],
    [80, 'good'],
    [75, 'good'],
    [60, 'fair'],
    [50, 'fair'],
    [30, 'poor'],
    [25, 'poor'],
    [10, 'critical'],
    [0, 'critical'],
  ])('band(%i) = %s', (score, band) => {
    expect(healthBand(score)).toBe(band);
  });
});

describe('computeHealthScore — HEALTH_SCORE.md §7 worked examples', () => {
  test('Example A — well-kept scooter → 95, Excellent', () => {
    const schedules: ScheduleRow[] = [
      makeSchedule({ id: 'engine_oil', componentType: 'engine_oil' }),
      makeSchedule({ id: 'cvt_cleaning', componentType: 'cvt_cleaning' }),
      makeSchedule({ id: 'brake_pads_front', componentType: 'brake_pads_front' }),
      makeSchedule({ id: 'tire_rear', componentType: 'tire_rear' }),
      makeSchedule({ id: 'battery', componentType: 'battery' }),
    ];
    const statuses = new Map<string, ScheduleStatus>([
      ['engine_oil', makeStatus('engine_oil', 0.72)],
      ['cvt_cleaning', makeStatus('cvt_cleaning', 0.82)],
      ['brake_pads_front', makeStatus('brake_pads_front', 0.79)],
      ['tire_rear', makeStatus('tire_rear', 0.8987)],
      ['battery', makeStatus('battery', 0.836)],
    ]);
    const result = computeHealthScore(schedules, statuses);
    expect(result.score).toBe(95);
    expect(result.band).toBe('excellent');
  });

  test('Example B — neglected chain bike → 55, Needs attention', () => {
    const schedules: ScheduleRow[] = [
      makeSchedule({ id: 'engine_oil', componentType: 'engine_oil' }),
      makeSchedule({ id: 'chain_lube', componentType: 'chain_lube' }),
      makeSchedule({ id: 'tire_front', componentType: 'tire_front' }),
      makeSchedule({ id: 'brake_pads_rear', componentType: 'brake_pads_rear' }),
    ];
    const statuses = new Map<string, ScheduleStatus>([
      ['engine_oil', makeStatus('engine_oil', 1.5)],
      ['chain_lube', makeStatus('chain_lube', 2.3)],
      ['tire_front', makeStatus('tire_front', 0.5)],
      ['brake_pads_rear', makeStatus('brake_pads_rear', 1.05)],
    ]);
    const result = computeHealthScore(schedules, statuses);
    expect(result.score).toBe(55);
    expect(result.band).toBe('fair');
  });

  test('no enabled anchored schedules → score null, UI shows "Finish setup"', () => {
    const schedules: ScheduleRow[] = [makeSchedule({ id: 'x', isEnabled: 0 })];
    const result = computeHealthScore(schedules, new Map());
    expect(result.score).toBeNull();
    expect(result.band).toBeNull();
  });

  test('anchored < 60% of enabled → isPartial true', () => {
    const schedules: ScheduleRow[] = [
      makeSchedule({ id: 'a' }),
      makeSchedule({ id: 'b' }),
      makeSchedule({ id: 'c' }),
    ];
    const statuses = new Map<string, ScheduleStatus>([['a', makeStatus('a', 0.5)]]);
    const result = computeHealthScore(schedules, statuses);
    expect(result.isPartial).toBe(true);
  });
});

describe('scoreUsesMileage — drives the "estimated" label on the score', () => {
  const base = {
    createdAt: 0,
    updatedAt: 0,
    deletedAt: null,
    motorcycleId: 'b1',
    customName: null,
    isEnabled: 1,
    isMuted: 0,
    snoozedUntil: null,
    anchorSource: 'record',
    isPinned: 0,
    pinnedSortOrder: 0,
    sortOrder: 0,
  };
  const kmItem = { ...base, id: 'oil', componentType: 'engine_oil', intervalKm: 1500, intervalMonths: 3, anchorOdometerKm: 1000, anchorDate: '2026-01-01' };
  const timeOnly = { ...base, id: 'bat', componentType: 'battery', intervalKm: null, intervalMonths: 24, anchorOdometerKm: null, anchorDate: '2026-01-01' };
  const dateAnchored = { ...kmItem, id: 'oil2', anchorOdometerKm: null };
  const status = (id: string) => ({ scheduleId: id, status: 'good' as const, ratio: 0.5, remainingKm: null, remainingDays: null, governs: 'km' as const, anchored: true });

  test('true when a scored item has a km interval AND a km anchor', () => {
    const result = computeHealthScore([kmItem], new Map([['oil', status('oil')]]));
    expect(scoreUsesMileage(result, [kmItem])).toBe(true);
  });

  test('false when every scored item is time-based or date-anchored (score is not mileage-based)', () => {
    const schedules = [timeOnly, dateAnchored];
    const result = computeHealthScore(schedules, new Map([['bat', status('bat')], ['oil2', status('oil2')]]));
    expect(scoreUsesMileage(result, schedules)).toBe(false);
  });

  test('false with no scored items', () => {
    expect(scoreUsesMileage(computeHealthScore([kmItem], new Map()), [kmItem])).toBe(false);
  });
});
