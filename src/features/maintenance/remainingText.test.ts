import type { ScheduleStatus } from '@/services/StatusService';
import { formatRemaining } from './remainingText';
import { formatQuickLogDue } from './quickLogText';

function km(remainingKm: number, status: ScheduleStatus['status'] = 'good'): ScheduleStatus {
  return { scheduleId: 's', status, ratio: 0.5, remainingKm, remainingDays: null, governs: 'km', anchored: true };
}

function days(remainingDays: number): ScheduleStatus {
  return { scheduleId: 's', status: 'good', ratio: 0.5, remainingKm: null, remainingDays, governs: 'days', anchored: true };
}

describe('formatRemaining — never a negative distance (Reminders, dashboard, maintenance)', () => {
  test('due soon', () => {
    expect(formatRemaining(km(300, 'dueSoon'))).toBe('in 300 km');
    expect(formatRemaining(km(300, 'dueSoon'), true)).toBe('in ~300 km');
  });

  test('exactly due', () => {
    expect(formatRemaining(km(0, 'overdue'))).toBe('due now');
    expect(formatRemaining(days(0))).toBe('due today');
  });

  test('overdue', () => {
    expect(formatRemaining(km(-300, 'overdue'))).toBe('overdue by 300 km');
    expect(formatRemaining(km(-300, 'overdue'), true)).toBe('overdue by ~300 km');
    expect(formatRemaining(days(-1))).toBe('overdue by 1 day');
  });

  test('significantly overdue', () => {
    expect(formatRemaining(km(-12500, 'overdue'))).toBe('overdue by 12,500 km');
    expect(formatRemaining(days(-400))).toBe('overdue by 400 days');
  });

  test('no output ever contains "-" before a number (the old "in -300 km")', () => {
    for (const value of [-1, -300, -12500]) {
      expect(formatRemaining(km(value, 'overdue'))).not.toMatch(/-\d/);
      expect(formatRemaining(days(value))).not.toMatch(/-\d/);
    }
  });

  test('not set up', () => {
    expect(formatRemaining({ ...km(0), governs: null })).toBe('Not set up');
  });
});

describe('formatQuickLogDue — Quick Log cards use the shared estimate flag', () => {
  test('actual reading → stated plainly', () => {
    expect(formatQuickLogDue(km(1200), false)).toBe('1,200 km left');
    expect(formatQuickLogDue(km(-150, 'overdue'), false)).toBe('150 km overdue');
    expect(formatQuickLogDue(km(0, 'overdue'), false)).toBe('Due now');
  });

  test('estimated odometer → "About"', () => {
    expect(formatQuickLogDue(km(1200), true)).toBe('About 1,200 km left');
    expect(formatQuickLogDue(km(-150, 'overdue'), true)).toBe('About 150 km overdue');
  });

  test('month-governed stays "About" (month rounding), independent of the odometer', () => {
    expect(formatQuickLogDue(days(40), false, '2026-08-01')).toBe(formatQuickLogDue(days(40), true, '2026-08-01'));
    expect(formatQuickLogDue(days(40), false, '2026-08-01')).toMatch(/^About Sep 2026$/);
  });
});
