/**
 * The real dashboard tour, driven end to end through the real engine + store +
 * progress persistence. Only the device-bound pieces are stubbed: the settings
 * KV table (in-memory), app-state conditions, and native anchor measurement
 * (anchor EXISTENCE in the UI is checked separately in anchorCoverage.test.ts).
 */

import { useTutorialStore } from '@/stores/useTutorialStore';
import { dashboardTour } from './configs/dashboard';
import { buildConditionCtx } from './conditions';
import { closeTutorial, nextStep, onPathnameChange, prevStep, skipTutorial, startTutorial } from './engine';
import { defaultProgress, type TutorialProgressState } from './progress';
import { registerTutorial } from './registry';
import { decideTourPrompt } from './tourPrompt';
import type { ConditionCtx, TutorialStep } from './types';

jest.mock('@/db/repositories/SettingsRepository', () => {
  const store = new Map<string, string>();
  return {
    SettingsRepository: {
      get: <T,>(key: string, fallback: T): T => {
        const raw = store.get(key);
        return raw === undefined ? fallback : (JSON.parse(raw) as T);
      },
      set: (key: string, value: unknown) => {
        store.set(key, JSON.stringify(value));
      },
      remove: (key: string) => {
        store.delete(key);
      },
      __store: store,
    },
  };
});

jest.mock('./conditions', () => ({ buildConditionCtx: jest.fn() }));

jest.mock('./anchors', () => ({
  ...jest.requireActual<typeof import('./anchors')>('./anchors'),
  waitForAnchor: jest.fn(async () => true),
  measureAnchor: jest.fn(async () => ({ x: 16, y: 200, width: 288, height: 120 })),
  scrollAnchorIntoView: jest.fn(async () => undefined),
}));

const mockCtx = buildConditionCtx as jest.MockedFunction<typeof buildConditionCtx>;
const { SettingsRepository } = jest.requireMock<{
  SettingsRepository: { __store: Map<string, string> };
}>('@/db/repositories/SettingsRepository');

function ctx(bikeCount: number): ConditionCtx {
  return { bikeCount, hasActiveBike: bikeCount > 0, hasMaintenanceHistory: false, hasFuelLogs: false, pathname: '/' };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 10; i += 1) {
    await Promise.resolve();
  }
}

function currentStep(): TutorialStep | undefined {
  const { resolvedSteps, stepIndex } = useTutorialStore.getState();
  return resolvedSteps[stepIndex];
}

/** Performs the real user action each step asks for; returns the visited step ids. */
async function walkToEnd(): Promise<string[]> {
  const visited: string[] = [];
  for (let guard = 0; guard < 30 && useTutorialStore.getState().phase !== 'idle'; guard += 1) {
    const step = currentStep()!;
    expect(useTutorialStore.getState().phase).toBe('showing');
    if (step.anchorId !== undefined) {
      expect(useTutorialStore.getState().targetRect).not.toBeNull(); // spotlight measured
    }
    visited.push(step.id);
    if (step.advance.type === 'navigate') {
      onPathnameChange(step.advance.route); // the user taps the tab
    } else {
      nextStep();
    }
    await flush();
  }
  return visited;
}

function freshUserProgress(): TutorialProgressState {
  return { ...defaultProgress(), welcome: 'completed', setup: 'completed' };
}

registerTutorial(dashboardTour);

beforeEach(async () => {
  SettingsRepository.__store.clear();
  onPathnameChange('/');
  closeTutorial();
  await flush();
  useTutorialStore.setState({ progress: freshUserProgress(), hydrated: true, phase: 'idle' });
  mockCtx.mockReturnValue(ctx(1));
});

const prompt = (progress: TutorialProgressState, extra: Partial<Parameters<typeof decideTourPrompt>[0]> = {}) =>
  decideTourPrompt({
    progress,
    hydrated: true,
    phase: 'idle',
    hasBike: true,
    promptedThisSession: false,
    tourId: dashboardTour.id,
    tourVersion: dashboardTour.version,
    ...extra,
  });

describe('dashboard tour — fresh user', () => {
  test('is offered once setup is done and a bike exists', () => {
    expect(prompt(freshUserProgress())).toBe('offer');
  });

  test('is not offered before the welcome flow, without a bike, twice per session, or mid-tutorial', () => {
    expect(prompt({ ...freshUserProgress(), welcome: 'pending' })).toBeNull();
    expect(prompt(freshUserProgress(), { hasBike: false })).toBeNull();
    expect(prompt(freshUserProgress(), { promptedThisSession: true })).toBeNull();
    expect(prompt(freshUserProgress(), { hydrated: false })).toBeNull();
    expect(prompt(freshUserProgress(), { phase: 'showing' })).toBeNull();
  });

  test('every step is reached in order and the tour completes (single bike)', async () => {
    expect(startTutorial(dashboardTour.id)).toBe(true);
    await flush();
    expect(await walkToEnd()).toEqual([
      'intro',
      'bike-chip-single',
      'odometer',
      'health',
      'due-items',
      'quick-actions',
      'maintenance-tab',
      'maintenance-list',
      'keep-current',
    ]);
    const record = useTutorialStore.getState().progress.tutorials[dashboardTour.id];
    expect(record).toMatchObject({ status: 'completed', version: 2, stepIndex: 0 });
    expect(record?.completedAt).not.toBeNull();
  });

  test('multi-bike users get the switcher step instead of the single-bike one', async () => {
    mockCtx.mockReturnValue(ctx(2));
    startTutorial(dashboardTour.id);
    await flush();
    const visited = await walkToEnd();
    expect(visited).toContain('bike-chip-multi');
    expect(visited).not.toContain('bike-chip-single');
    expect(visited).toHaveLength(9);
  });

  test('the Maintenance step waits for the real tab tap, then continues on that screen', async () => {
    startTutorial(dashboardTour.id, { resumeFrom: 6 });
    await flush();
    expect(currentStep()?.id).toBe('maintenance-tab');
    // Interactive step: the tooltip renders no Next button (TutorialTooltip shows it only
    // for `advance: next`), so the only way on is the real tab tap.
    expect(currentStep()?.advance).toEqual({ type: 'navigate', route: '/maintenance' });
    onPathnameChange('/maintenance');
    await flush();
    expect(currentStep()?.id).toBe('maintenance-list');
    expect(useTutorialStore.getState().phase).toBe('showing');
  });
});

describe('dashboard tour — controls', () => {
  test('Back returns to the previous step; Back on the first step is a no-op', async () => {
    startTutorial(dashboardTour.id);
    await flush();
    prevStep();
    await flush();
    expect(useTutorialStore.getState().stepIndex).toBe(0);
    nextStep();
    await flush();
    nextStep();
    await flush();
    expect(currentStep()?.id).toBe('odometer');
    prevStep();
    await flush();
    expect(currentStep()?.id).toBe('bike-chip-single');
  });

  test('Skip ends the tour, records "skipped", and never re-offers it', async () => {
    startTutorial(dashboardTour.id);
    await flush();
    nextStep();
    await flush();
    skipTutorial();
    const { progress, phase } = useTutorialStore.getState();
    expect(phase).toBe('idle');
    expect(progress.tutorials[dashboardTour.id]).toMatchObject({ status: 'skipped', stepIndex: 0 });
    useTutorialStore.getState().setTourOffer('accepted'); // what "Start tour" recorded
    expect(prompt(useTutorialStore.getState().progress)).toBeNull();
  });

  test('Close keeps the resume point and offers Resume (same version)', async () => {
    useTutorialStore.getState().setTourOffer('accepted');
    startTutorial(dashboardTour.id);
    await flush();
    nextStep();
    await flush();
    nextStep();
    await flush();
    closeTutorial();
    expect(prompt(useTutorialStore.getState().progress)).toBe('resume');
    startTutorial(dashboardTour.id, { resumeFrom: 2 });
    await flush();
    expect(currentStep()?.id).toBe('odometer');
  });
});

describe('dashboard tour — persistence across a restart', () => {
  function restartApp(): void {
    // A cold start: runtime state gone, progress re-read from the settings table.
    useTutorialStore.setState({ progress: defaultProgress(), hydrated: false, phase: 'idle' });
    useTutorialStore.getState().hydrate();
  }

  test('completion is saved and survives a reload without restarting the tour', async () => {
    useTutorialStore.getState().setTourOffer('accepted');
    startTutorial(dashboardTour.id);
    await flush();
    await walkToEnd();
    restartApp();
    const { progress } = useTutorialStore.getState();
    expect(progress.tutorials[dashboardTour.id]?.status).toBe('completed');
    expect(progress.tourOffer).toBe('accepted');
    expect(prompt(progress)).toBeNull();
    expect(useTutorialStore.getState().phase).toBe('idle');
  });

  test('a tour closed midway is still resumable after a reload', async () => {
    useTutorialStore.getState().setTourOffer('accepted');
    startTutorial(dashboardTour.id);
    await flush();
    nextStep();
    await flush();
    closeTutorial();
    restartApp();
    expect(prompt(useTutorialStore.getState().progress)).toBe('resume');
  });
});

describe('dashboard tour — existing users are not forced through it again', () => {
  const withRecord = (record: TutorialProgressState['tutorials'][string], tourOffer: TutorialProgressState['tourOffer']) => ({
    ...freshUserProgress(),
    tourOffer,
    tutorials: { [dashboardTour.id]: record },
  });

  test('users who completed or skipped version 1 are not prompted', () => {
    const done = { status: 'completed' as const, stepIndex: 0, version: 1, replayCount: 0, completedAt: 1 };
    const skipped = { status: 'skipped' as const, stepIndex: 0, version: 1, replayCount: 0, completedAt: null };
    expect(prompt(withRecord(done, 'accepted'))).toBeNull();
    expect(prompt(withRecord(skipped, 'accepted'))).toBeNull();
  });

  test('users who answered "Not now" or "Never" are not prompted', () => {
    expect(prompt({ ...freshUserProgress(), tourOffer: 'later' })).toBeNull();
    expect(prompt({ ...freshUserProgress(), tourOffer: 'never' })).toBeNull();
  });

  test('a version-1 mid-tour resume point is not offered and is not applied to the new step list', async () => {
    const midV1 = { status: 'in_progress' as const, stepIndex: 5, version: 1, replayCount: 0, completedAt: null };
    const progress = withRecord(midV1, 'accepted');
    expect(prompt(progress)).toBeNull(); // regression: used to offer Resume at a stale index
    useTutorialStore.setState({ progress });
    startTutorial(dashboardTour.id, { resumeFrom: 5 }); // e.g. replay from Help with the saved index
    await flush();
    expect(currentStep()?.id).toBe('intro');
    expect(useTutorialStore.getState().progress.tutorials[dashboardTour.id]?.version).toBe(2);
  });
});
