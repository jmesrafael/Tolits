/**
 * Static checks that tutorial content matches the current UI:
 *  - every anchorId a tutorial step spotlights is actually rendered somewhere
 *    (a missing anchor would silently skip the step after a 3 s timeout);
 *  - the dashboard tour's wording uses the app's current status/label terms;
 *  - tooltips for every anchored step stay on screen on a small phone.
 */

import * as fs from 'fs';
import * as path from 'path';

import { strings } from '@/i18n/strings';
import { dashboardTour } from './configs/dashboard';
import * as screenTours from './configs/screens';
import * as tips from './configs/tips';
import { placeTooltip } from './placeTooltip';
import type { TutorialConfig } from './types';

const SRC = path.join(__dirname, '..');
const ALL_CONFIGS: TutorialConfig[] = [dashboardTour, ...Object.values(screenTours), ...Object.values(tips)];

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return sourceFiles(full);
    }
    return /\.tsx$/.test(entry.name) && !entry.name.endsWith('.test.tsx') ? [full] : [];
  });
}

/** Anchor ids rendered by the UI: <TutorialAnchor id="…">, `…AnchorId="…"` props, and tab.<route>. */
function renderedAnchorIds(): Set<string> {
  const ids = new Set<string>();
  for (const file of sourceFiles(SRC)) {
    const text = fs.readFileSync(file, 'utf8');
    for (const match of text.matchAll(/TutorialAnchor[^>]*?\bid="([^"]+)"/g)) {
      ids.add(match[1]!);
    }
    for (const match of text.matchAll(/AnchorId="([^"]+)"/g)) {
      ids.add(match[1]!);
    }
  }
  // TabBar registers `tab.${route.name}` for every tab route file.
  const tabsDir = path.join(SRC, 'app', '(tabs)');
  for (const file of fs.readdirSync(tabsDir)) {
    if (file.endsWith('.tsx') && !file.startsWith('_')) {
      ids.add(`tab.${file.replace(/\.tsx$/, '')}`);
    }
  }
  return ids;
}

describe('tutorial anchors exist in the UI', () => {
  const rendered = renderedAnchorIds();
  const referenced = ALL_CONFIGS.flatMap((config) =>
    config.steps.filter((s) => s.anchorId !== undefined).map((s) => [`${config.id}/${s.id}`, s.anchorId!] as const),
  );

  test('sanity: the scan finds the known dashboard anchors', () => {
    expect(rendered.has('dashboard.healthHero')).toBe(true);
    expect(rendered.has('tab.maintenance')).toBe(true);
  });

  test.each(referenced)('%s → %s is rendered', (_step, anchorId) => {
    expect(rendered.has(anchorId)).toBe(true);
  });
});

describe('dashboard tour wording matches the current UI', () => {
  const body = (id: string) => dashboardTour.steps.find((s) => s.id === id)!.body;

  test('status names are the labels the app shows', () => {
    for (const label of Object.values(strings.dashboard.nextMaintenance.due)) {
      expect(body('maintenance-list')).toContain(label);
    }
    expect(body('due-items')).toContain(strings.dashboard.nextMaintenance.due.dueSoon);
    expect(body('due-items')).toContain(strings.dashboard.nextMaintenance.due.overdue);
  });

  test('estimate wording matches the labels on the dashboard', () => {
    expect(body('health')).toContain(strings.dashboard.health.estimated);
    expect(body('odometer')).toContain('~'); // the marker used by every estimated figure
  });

  test('covers the core concepts, concisely', () => {
    const ids = dashboardTour.steps.map((s) => s.id);
    for (const id of ['odometer', 'health', 'due-items', 'quick-actions', 'maintenance-list', 'keep-current']) {
      expect(ids).toContain(id);
    }
    for (const step of dashboardTour.steps) {
      expect(step.body.length).toBeLessThanOrEqual(260); // fits the tooltip without long scrolling
    }
  });
});

describe('tooltips stay on screen on a small phone (320 × 568)', () => {
  const screen = { windowWidth: 320, windowHeight: 568, insetTop: 20, insetBottom: 0 };
  // Card = header + body (ScrollView capped at maxHeight 220) + footer. 360 is a
  // generous ESTIMATE of the ceiling (not measured on a device): longer copy
  // scrolls inside the body instead of growing the card.
  const CARD_HEIGHT = 360;
  const targets = {
    top: { x: 16, y: 60, width: 288, height: 44 },
    middle: { x: 16, y: 220, width: 288, height: 140 },
    bottom: { x: 120, y: 510, width: 80, height: 56 }, // tab bar
  };

  test.each(Object.entries(targets))('%s target', (_name, target) => {
    const placed = placeTooltip({
      target,
      tooltipWidth: 288,
      tooltipHeight: CARD_HEIGHT,
      ...screen,
      gutter: 16,
      gap: 12,
      cornerRadius: 16,
      preferred: 'auto',
    });
    expect(placed.x).toBeGreaterThanOrEqual(16);
    expect(placed.x + 288).toBeLessThanOrEqual(320 - 16);
    expect(placed.y).toBeGreaterThanOrEqual(screen.insetTop);
    expect(placed.y + CARD_HEIGHT).toBeLessThanOrEqual(screen.windowHeight - screen.insetBottom);
  });
});

describe('the offer dialog time promise matches the tour', () => {
  const PROMISED_MINUTES = 3; // strings.tutorial.offer.body says "About 3 minutes"

  test('estimated duration (reading at 200 wpm + ~4 s per step for taps) fits the promise', () => {
    const steps = dashboardTour.steps.filter((s) => s.id !== 'bike-chip-multi'); // longest single-bike path
    const words = steps.reduce((sum, s) => sum + `${s.title} ${s.body}`.split(/\s+/).length, 0);
    const seconds = (words / 200) * 60 + steps.length * 4;
    expect(seconds).toBeLessThanOrEqual(PROMISED_MINUTES * 60);
  });

  test('the copy states the same number in every locale (no stale two-minutes)', () => {
    const { fil } = jest.requireActual<typeof import('@/i18n/locales/fil')>('@/i18n/locales/fil');
    expect(strings.tutorial.offer.body).toContain(`${PROMISED_MINUTES} minutes`);
    expect(strings.tutorial.offer.body).not.toMatch(/two minutes/i);
    expect(fil.tutorial?.offer?.body).toContain(`${PROMISED_MINUTES} minuto`);
  });
});

describe('every tutorial config is valid and fully reachable', () => {
  const ctxFor = (bikeCount: number, hasHistory = false) => ({
    bikeCount,
    hasActiveBike: bikeCount > 0,
    hasMaintenanceHistory: hasHistory,
    hasFuelLogs: false,
    pathname: '/',
  });

  test.each(ALL_CONFIGS.map((c) => [c.id, c] as const))('%s: ids unique, copy present, routes/anchors coherent', (_id, config) => {
    const ids = config.steps.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(config.title.trim()).not.toBe('');
    expect(config.entryRoute.startsWith('/')).toBe(true);
    expect(config.version).toBeGreaterThanOrEqual(1);
    for (const step of config.steps) {
      expect(step.title.trim()).not.toBe('');
      expect(step.body.trim()).not.toBe('');
      if (step.anchorId !== undefined) {
        expect(step.route).toBeDefined(); // the engine waits for the route before looking for the anchor
      }
      if (step.route !== undefined) {
        expect(step.route.startsWith('/')).toBe(true);
      }
      if (step.advance.type === 'navigate') {
        expect(step.advance.route.startsWith('/')).toBe(true);
      }
    }
  });

  test('the dashboard tour resolves a non-empty, contiguous path for 0, 1 and 2+ bikes and any history', () => {
    for (const [bikes, history] of [[0, false], [1, false], [1, true], [2, false], [5, true]] as const) {
      const ctx = ctxFor(bikes, history);
      const steps = dashboardTour.steps.filter((s) => s.condition === undefined || s.condition(ctx));
      expect(steps.length).toBeGreaterThan(0);
      // exactly one of the two bike-chip variants is ever present (never both, never neither)
      const chipSteps = steps.filter((s) => s.id.startsWith('bike-chip'));
      expect(chipSteps).toHaveLength(1);
      expect(chipSteps[0]!.id).toBe(bikes > 1 ? 'bike-chip-multi' : 'bike-chip-single');
    }
  });

  test('the interactive Maintenance-tab step is followed by a step on the route it navigates to', () => {
    const steps = dashboardTour.steps;
    const index = steps.findIndex((s) => s.advance.type === 'navigate');
    expect(index).toBeGreaterThan(-1);
    const nav = steps[index]!.advance as { type: 'navigate'; route: string };
    expect(steps[index]!.anchorId).toBe('tab.maintenance');
    expect(steps[index + 1]!.route).toBe(nav.route);
    // every step after the navigation happens on the destination screen
    for (const step of steps.slice(index + 1)) {
      expect(step.route).toBe(nav.route);
    }
    // and every step before it is on the dashboard
    for (const step of steps.slice(0, index + 1)) {
      expect(step.route).toBe('/');
    }
  });

  test('the tour is registered (reachable from the Help list and the dashboard offer)', () => {
    const indexSource = fs.readFileSync(path.join(__dirname, 'configs', 'index.ts'), 'utf8');
    expect(indexSource).toContain('dashboardTour');
    expect(dashboardTour.entryRoute).toBe('/');
  });

  test('Health Score wording in the tour matches the label the score actually shows', () => {
    const health = dashboardTour.steps.find((s) => s.id === 'health')!;
    expect(health.body).toContain(strings.dashboard.health.estimated);
  });
});
