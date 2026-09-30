import { buildOdometerSnapshot } from './odometerEstimate';
import { computeScheduleStatus } from './StatusService';
import type { ScheduleRow } from '@/db/schema';

const reading = (effectiveKm: number, recordedDate: string) => ({ effectiveKm, recordedDate });

// Last actual reading 12,000 km on Aug 1; 20 km/day measured over the 30 days before it.
const ACTUAL_KM = 12000;
const ACTUAL_DATE = '2026-08-01';
const HISTORY = [reading(11400, '2026-07-02'), reading(12000, '2026-08-01')];

describe('buildOdometerSnapshot — actual vs. estimated odometer', () => {
  test('keeps the actual reading and its real date; estimates today from them', () => {
    // Today Aug 11: 10 days × 20 km/day = +200 km
    const s = buildOdometerSnapshot(ACTUAL_KM, ACTUAL_DATE, HISTORY, HISTORY, '2026-08-11');
    expect(s.actualKm).toBe(12000);
    expect(s.actualDate).toBe('2026-08-01');
    expect(s.daysSinceReading).toBe(10);
    expect(s.rate).toEqual({ rate: 20, confidence: 'high', source: 'window30' });
    expect(s.estimatedKm).toBe(12200);
    expect(s.statusKm).toBe(12200);
  });

  test('a stale reading stays stale: the actual date is never moved to today', () => {
    // Today Sep 30: 60 days later, the readings fall outside 30d but inside 90d.
    const s = buildOdometerSnapshot(ACTUAL_KM, ACTUAL_DATE, [], HISTORY, '2026-09-30');
    expect(s.actualKm).toBe(12000);
    expect(s.actualDate).toBe('2026-08-01');
    expect(s.daysSinceReading).toBe(60);
    expect(s.rate.confidence).toBe('low');
    expect(s.estimatedKm).toBe(13200); // 12,000 + 60 × 20
  });

  test('reading taken today → no estimate; status uses the actual value', () => {
    const s = buildOdometerSnapshot(ACTUAL_KM, '2026-08-11', HISTORY, HISTORY, '2026-08-11');
    expect(s.estimatedKm).toBeNull();
    expect(s.statusKm).toBe(12000);
  });

  test('no readings at all → no date, no estimate, safe defaults', () => {
    const s = buildOdometerSnapshot(0, null, [], [], '2026-08-11');
    expect(s.actualDate).toBeNull();
    expect(s.daysSinceReading).toBeNull();
    expect(s.estimatedKm).toBeNull();
    expect(s.statusKm).toBe(0);
    expect(s.rate.source).toBe('default');
  });

  test('parked bike / no riding history: no estimate is invented from the 25 km/day default', () => {
    // Regression: this used to estimate 12,100 km (4 days × 25) and feed it into status.
    const s = buildOdometerSnapshot(ACTUAL_KM, ACTUAL_DATE, [], [reading(12000, ACTUAL_DATE)], '2026-08-05');
    expect(s.rate).toEqual({ rate: 25, confidence: 'low', source: 'default' });
    expect(s.estimatedKm).toBeNull();
    expect(s.statusIsEstimate).toBe(false);
    expect(s.statusKm).toBe(12000);
    expect(s.needsMoreReadings).toBe(true);
  });

  test('parked bike reading taken today: nothing to ask for yet', () => {
    const s = buildOdometerSnapshot(ACTUAL_KM, ACTUAL_DATE, [reading(12000, ACTUAL_DATE)], [], ACTUAL_DATE);
    expect(s.needsMoreReadings).toBe(false);
    expect(s.estimatedKm).toBeNull();
  });

  test('status uses the estimate: an item "good" at the stale reading is due soon by today', () => {
    const oil: ScheduleRow = {
      id: 'oil',
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
      anchorOdometerKm: 11000,
      anchorDate: null,
      anchorSource: 'record',
      isPinned: 0,
      pinnedSortOrder: 0,
      sortOrder: 0,
    };
    const s = buildOdometerSnapshot(ACTUAL_KM, ACTUAL_DATE, [], HISTORY, '2026-08-11');
    expect(computeScheduleStatus(oil, s.actualKm, '2026-08-11').status).toBe('good'); // 1000/1500
    const byEstimate = computeScheduleStatus(oil, s.statusKm, '2026-08-11'); // 1200/1500 = 0.8
    expect(byEstimate.status).toBe('dueSoon');
    expect(byEstimate.remainingKm).toBe(300);
  });
});
