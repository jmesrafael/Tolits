import { Keyboard } from 'react-native';

import { onDomainEvent } from '@/lib/events';
import { log } from '@/lib/log';
import { useTutorialStore } from '@/stores/useTutorialStore';
import { measureAnchor, scrollAnchorIntoView, waitForAnchor } from './anchors';
import { buildConditionCtx } from './conditions';
import { defaultRecord, reconcileRecordVersion } from './progress';
import { getTutorial } from './registry';
import type { TutorialStep } from './types';

/**
 * Tutorial engine — non-React controller that drives useTutorialStore's
 * runtime slice. Listeners (domain events, timers, route waiters) exist only
 * while a step is live and are torn down on every transition, so the engine
 * costs nothing when idle.
 *
 * Invariant (UX contract): the engine never blocks the app. Every wait has a
 * timeout, unexpected navigation pauses quietly with progress saved, and
 * Skip/Close are honored from any state.
 */

const ANCHOR_TIMEOUT_MS = 3000;
const ROUTE_TIMEOUT_MS = 10000;
const DEFAULT_LONG_PRESS_MS = 500;

/** Invalidates in-flight async work whenever the active step/tutorial changes. */
let generation = 0;
let cleanups: (() => void)[] = [];
let currentPathname = '/';
let routeWaiter: { route: string; resolve: (ok: boolean) => void } | null = null;
let pendingPauseTimer: ReturnType<typeof setTimeout> | null = null;
let reduceMotion = false;

/** Kept in sync by TutorialHost so scroll/measure settling can skip animation waits. */
export function setReduceMotion(value: boolean): void {
  reduceMotion = value;
}

export function getCurrentPathname(): string {
  return currentPathname;
}

function matchRoute(pattern: string, path: string): boolean {
  if (pattern === '/') {
    return path === '/' || path === '/index';
  }
  return path === pattern || path.startsWith(`${pattern}/`);
}

function clearTransientWork(): void {
  generation += 1;
  for (const cleanup of cleanups) {
    cleanup();
  }
  cleanups = [];
  if (routeWaiter !== null) {
    routeWaiter.resolve(false);
    routeWaiter = null;
  }
  if (pendingPauseTimer !== null) {
    clearTimeout(pendingPauseTimer);
    pendingPauseTimer = null;
  }
}

function resetRuntime(): void {
  useTutorialStore.setState({
    phase: 'idle',
    activeId: null,
    activeKind: null,
    stepIndex: 0,
    resolvedSteps: [],
    targetRect: null,
    targetShape: null,
    interactiveAnchorId: null,
  });
}

function currentStep(): TutorialStep | undefined {
  const s = useTutorialStore.getState();
  return s.resolvedSteps[s.stepIndex];
}

export function isTutorialActive(): boolean {
  return useTutorialStore.getState().phase !== 'idle';
}

export interface StartOptions {
  replay?: boolean;
  resumeFrom?: number;
}

/**
 * Starts a tutorial: evaluates smart conditions, resolves the step list, and
 * activates the first (or resumed) step. Returns false when conditions or an
 * unknown id prevent the run.
 */
export function startTutorial(id: string, options: StartOptions = {}): boolean {
  const config = getTutorial(id);
  if (config === undefined) {
    log.warn('tutorial.engine.unknownTutorial', { id });
    return false;
  }
  if (isTutorialActive()) {
    clearTransientWork();
    resetRuntime();
  }
  const ctx = buildConditionCtx(currentPathname);
  if (config.condition !== undefined && !config.condition(ctx)) {
    return false;
  }
  const resolvedSteps = config.steps.filter(
    (step) => step.condition === undefined || step.condition(ctx),
  );
  if (resolvedSteps.length === 0) {
    return false;
  }

  const store = useTutorialStore.getState();
  const stored = store.progress.tutorials[id];
  const record = reconcileRecordVersion(stored ?? defaultRecord(config.version), config.version);
  // A resume point saved under an older config version indexes a different
  // step list — start over rather than land on an unrelated step.
  const resumeValid = stored === undefined || stored.version === config.version;
  const startIndex = Math.min(
    Math.max(resumeValid ? (options.resumeFrom ?? 0) : 0, 0),
    resolvedSteps.length - 1,
  );
  store.updateTutorialRecord(id, {
    status: 'in_progress',
    version: config.version,
    stepIndex: startIndex,
    replayCount: record.replayCount + (options.replay === true ? 1 : 0),
    completedAt: record.completedAt,
  });

  clearTransientWork();
  useTutorialStore.setState({
    activeId: id,
    activeKind: config.kind,
    resolvedSteps,
    stepIndex: startIndex,
    phase: 'preparing',
    targetRect: null,
    targetShape: null,
    interactiveAnchorId: null,
  });
  void activateStep(startIndex, generation);
  return true;
}

function waitForRoute(route: string, gen: number): Promise<boolean> {
  if (matchRoute(route, currentPathname)) {
    return Promise.resolve(true);
  }
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (routeWaiter?.resolve === settle) {
        routeWaiter = null;
      }
      resolve(false);
    }, ROUTE_TIMEOUT_MS);
    const settle = (ok: boolean) => {
      clearTimeout(timer);
      resolve(ok && gen === generation);
    };
    routeWaiter = { route, resolve: settle };
  });
}

function interactiveAnchorFor(step: TutorialStep): string | null {
  if (step.advance.type === 'tap-anchor' || step.advance.type === 'long-press-anchor') {
    return step.advance.anchorId ?? step.anchorId ?? null;
  }
  return null;
}

async function activateStep(index: number, gen: number): Promise<void> {
  if (gen !== generation) {
    return;
  }
  const state = useTutorialStore.getState();
  if (index >= state.resolvedSteps.length) {
    finishTutorial('completed');
    return;
  }
  const step = state.resolvedSteps[Math.max(index, 0)];
  if (step === undefined) {
    finishTutorial('completed');
    return;
  }
  const safeIndex = Math.max(index, 0);
  useTutorialStore.setState({
    stepIndex: safeIndex,
    phase: 'preparing',
    interactiveAnchorId: null,
  });
  const activeId = state.activeId;
  if (activeId !== null) {
    useTutorialStore.getState().updateTutorialRecord(activeId, { stepIndex: safeIndex });
  }
  Keyboard.dismiss();

  // Safety net for the UX invariant above: any unexpected throw in the wait/
  // measure chain below (e.g. a platform API a step's target doesn't support)
  // must never leave the store parked in 'preparing' — that renders the
  // scrim with nothing to show and no dismiss control, trapping the user
  // behind a dark screen forever. Bail out to idle instead.
  try {
    await activateStepBody(step, safeIndex, gen);
  } catch (error) {
    log.error('tutorial.engine.activateStepFailed', {
      stepId: step.id,
      message: error instanceof Error ? error.message : String(error),
    });
    if (gen === generation) {
      pauseQuietly();
    }
  }
}

async function activateStepBody(step: TutorialStep, safeIndex: number, gen: number): Promise<void> {
  if (step.route !== undefined && !matchRoute(step.route, currentPathname)) {
    const reached = await waitForRoute(step.route, gen);
    if (gen !== generation) {
      return;
    }
    if (!reached) {
      pauseQuietly();
      return;
    }
  }

  let targetRect = null;
  if (step.anchorId !== undefined) {
    const registered = await waitForAnchor(step.anchorId, ANCHOR_TIMEOUT_MS);
    if (gen !== generation) {
      return;
    }
    if (!registered) {
      log.warn('tutorial.engine.anchorTimeout', { anchorId: step.anchorId });
      void activateStep(safeIndex + 1, gen);
      return;
    }
    if (step.scrollIntoView !== false) {
      await scrollAnchorIntoView(step.anchorId, reduceMotion);
      if (gen !== generation) {
        return;
      }
    }
    targetRect = await measureAnchor(step.anchorId);
    if (gen !== generation) {
      return;
    }
    if (targetRect === null) {
      log.warn('tutorial.engine.measureFailed', { anchorId: step.anchorId });
      void activateStep(safeIndex + 1, gen);
      return;
    }
  }

  useTutorialStore.setState({
    targetRect,
    targetShape: step.shape ?? { kind: 'rect' },
    phase: 'showing',
    interactiveAnchorId: interactiveAnchorFor(step),
  });
  attachAdvanceTrigger(step, safeIndex, gen);
}

function attachAdvanceTrigger(step: TutorialStep, index: number, gen: number): void {
  const advance = step.advance;
  if (advance.type === 'event') {
    cleanups.push(
      onDomainEvent(advance.event, () => {
        if (gen === generation) {
          void activateStep(index + 1, gen);
        }
      }),
    );
    return;
  }
  if (advance.type === 'delay') {
    const timer = setTimeout(() => {
      if (gen === generation) {
        void activateStep(index + 1, gen);
      }
    }, advance.ms);
    cleanups.push(() => clearTimeout(timer));
  }
  // 'next' advances via the tooltip button; 'navigate' via onPathnameChange;
  // tap/long-press via notifyAnchorInteraction.
}

/** Called by TutorialAnchor when the user really touches the highlighted element. */
export function notifyAnchorInteraction(anchorId: string, pressDurationMs: number): void {
  const state = useTutorialStore.getState();
  if (state.phase !== 'showing' || state.interactiveAnchorId !== anchorId) {
    return;
  }
  const step = currentStep();
  if (step === undefined) {
    return;
  }
  if (
    step.advance.type === 'long-press-anchor' &&
    pressDurationMs < (step.advance.minMs ?? DEFAULT_LONG_PRESS_MS)
  ) {
    return;
  }
  if (pendingPauseTimer !== null) {
    clearTimeout(pendingPauseTimer);
    pendingPauseTimer = null;
  }
  const gen = generation;
  // Defer one tick so a tap that also navigates lands before the next step's
  // route wait begins.
  setTimeout(() => {
    if (gen === generation) {
      void activateStep(state.stepIndex + 1, gen);
    }
  }, 0);
}

/** TutorialHost forwards every expo-router pathname change here. */
export function onPathnameChange(pathname: string): void {
  currentPathname = pathname;
  if (routeWaiter !== null && matchRoute(routeWaiter.route, pathname)) {
    const waiter = routeWaiter;
    routeWaiter = null;
    waiter.resolve(true);
    return;
  }
  const state = useTutorialStore.getState();
  if (state.phase !== 'showing') {
    return;
  }
  const step = currentStep();
  if (step === undefined) {
    return;
  }
  if (step.advance.type === 'navigate' && matchRoute(step.advance.route, pathname)) {
    const gen = generation;
    void activateStep(state.stepIndex + 1, gen);
    return;
  }
  if (step.route !== undefined && matchRoute(step.route, pathname)) {
    return;
  }
  // The user navigated somewhere the step doesn't expect. Never trap them:
  // pause quietly with progress saved. Interactive tap steps get a grace
  // period first — the tap's own navigation may arrive before its notify.
  if (state.interactiveAnchorId !== null) {
    if (pendingPauseTimer === null) {
      pendingPauseTimer = setTimeout(() => {
        pendingPauseTimer = null;
        pauseQuietly();
      }, 200);
    }
    return;
  }
  pauseQuietly();
}

/** Dismisses without judgement: tours keep their resume point, tips count as seen. */
function pauseQuietly(): void {
  const { activeId, activeKind } = useTutorialStore.getState();
  clearTransientWork();
  if (activeId !== null && activeKind === 'tip') {
    useTutorialStore.getState().markTipSeen(activeId);
  }
  resetRuntime();
}

export function nextStep(): void {
  const state = useTutorialStore.getState();
  if (state.phase !== 'showing') {
    return;
  }
  clearTransientWork();
  void activateStep(state.stepIndex + 1, generation);
}

export function prevStep(): void {
  const state = useTutorialStore.getState();
  if (state.phase !== 'showing' || state.stepIndex === 0) {
    return;
  }
  clearTransientWork();
  void activateStep(state.stepIndex - 1, generation);
}

/** Skip button — the user opted out; do not offer resume. */
export function skipTutorial(): void {
  finishTutorial('skipped');
}

/** Close (X) — keep the resume point so we can offer Resume later. */
export function closeTutorial(): void {
  finishTutorial('closed');
}

function finishTutorial(reason: 'completed' | 'skipped' | 'closed'): void {
  const { activeId, activeKind, stepIndex } = useTutorialStore.getState();
  clearTransientWork();
  if (activeId !== null) {
    const store = useTutorialStore.getState();
    if (activeKind === 'tip') {
      store.markTipSeen(activeId);
    } else if (reason === 'completed') {
      store.updateTutorialRecord(activeId, {
        status: 'completed',
        stepIndex: 0,
        completedAt: Date.now(),
      });
    } else if (reason === 'skipped') {
      store.updateTutorialRecord(activeId, { status: 'skipped', stepIndex: 0 });
    } else {
      store.updateTutorialRecord(activeId, { status: 'in_progress', stepIndex });
    }
  }
  resetRuntime();
}

/** Re-measures the active anchor (rotation / fold / dimension changes). */
export async function remeasureActiveTarget(): Promise<void> {
  const state = useTutorialStore.getState();
  const step = currentStep();
  if (state.phase !== 'showing' || step?.anchorId === undefined) {
    return;
  }
  const gen = generation;
  const rect = await measureAnchor(step.anchorId);
  if (gen === generation && rect !== null) {
    useTutorialStore.setState({ targetRect: rect });
  }
}
