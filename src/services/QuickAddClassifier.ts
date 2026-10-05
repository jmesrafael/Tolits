/**
 * Quick Add classification (deterministic, local — no AI). Turns a free-text
 * "what did you buy or do" into the record the rider most likely means.
 *
 * Principle: false negative over false positive. A wrong maintenance match
 * resets the wrong schedule and moves Health Score, so every maintenance rule
 * requires a phrase that clearly names the component. Generic or shared words
 * ("oil", "chain", "battery", "plug", a brand name alone) never map to
 * maintenance by themselves. Anything ambiguous falls back to a plain expense
 * the rider can re-classify in the picker.
 *
 * Rules are ordered: the first match wins, so specific phrases sit above
 * general ones ("chain lube" before "chain", "shell advance" before "shell").
 */

import type { ComponentType, ExpenseCategory } from '@/types/enums';

export type QuickAddTarget =
  | { kind: 'maintenance'; componentType: ComponentType }
  | { kind: 'fuel' }
  | { kind: 'repair' }
  | { kind: 'expense'; category: ExpenseCategory };

export interface ClassifyResult {
  target: QuickAddTarget;
  /** True when a rule matched; false means the generic expense fallback. */
  matched: boolean;
}

type Rule = { pattern: RegExp; target: QuickAddTarget };

const maint = (componentType: ComponentType): QuickAddTarget => ({ kind: 'maintenance', componentType });
const expense = (category: ExpenseCategory): QuickAddTarget => ({ kind: 'expense', category });
const FUEL: QuickAddTarget = { kind: 'fuel' };
const REPAIR: QuickAddTarget = { kind: 'repair' };

/** Viscosity grade such as 10W-40 / 10w40 / 15W50. */
const VISCOSITY = /\b\d{1,2}\s*w\s*-?\s*\d{2}\b/;
/** A word that says the part is being swapped out (vs. cleaned or charged). */
const SWAP = '(replace|replacement|replaced|change|changed|new|bago|palit)';

const RULES: Rule[] = [
  // Chain: needs a chain-specific phrase. A bare "chain" could be a lock or a cover.
  { pattern: /\bchain\s*(kit|replacement|replace)\b/, target: maint('chain_replacement') },
  { pattern: /\bsprockets?\b/, target: maint('sprockets') },
  {
    pattern:
      /\bchain\s*(lube|lubricant|lubrication|lubricate|cleaner|clean|cleaning|adjust|adjustment|tension|grease)\b/,
    target: maint('chain_lube'),
  },

  // CVT / clutch
  { pattern: /\bcvt\b.*\bbelt\b|\bbelt\b.*\bcvt\b/, target: maint('cvt_belt') },
  { pattern: /\bcvt\b.*\broller/, target: maint('cvt_rollers') },
  { pattern: /\bcvt\b.*\bslider/, target: maint('cvt_slider') },
  { pattern: /\bcvt\b.*\bclean/, target: maint('cvt_cleaning') },
  { pattern: /\bclutch\b.*\bclean/, target: maint('clutch_cleaning') },

  // Oil family, specific forms first
  { pattern: /\bgear\s*oil\b/, target: maint('gear_oil') },
  { pattern: /\boil\s*filter\b/, target: maint('oil_filter') },
  // Air filter: clean and replace are explicit; a plain "air filter" is ambiguous.
  { pattern: /\bair\s*filter\b.*\bclean|\bclean\w*\b.*\bair\s*filter\b/, target: maint('air_filter_clean') },
  {
    pattern: new RegExp(`\\bair\\s*filter\\b.*\\b${SWAP}\\b|\\b${SWAP}\\b.*\\bair\\s*filter\\b`),
    target: maint('air_filter_replace'),
  },
  { pattern: /\bair\s*filter\b/, target: expense('service') },
  // Engine oil: a viscosity grade, an explicit "engine oil" or "oil change", or "shell advance" (an oil, not fuel).
  { pattern: VISCOSITY, target: maint('engine_oil') },
  {
    pattern: /\bengine\s*oil\b|\boil\s*change\b|\bchange\s*(the\s*)?oil\b|\bshell\s+advance\b/,
    target: maint('engine_oil'),
  },
  // A bare "oil" could be baby oil or cleaning oil: a plain expense.
  { pattern: /\boil\b/, target: expense('oil') },

  // Other fluids and parts. Each needs its specific phrase.
  { pattern: /\bbrake\s*fluid\b|\bdot\s*[34]\b/, target: maint('brake_fluid') },
  { pattern: /\bcoolant\b/, target: maint('coolant') },
  { pattern: /\bspark\s*plugs?\b/, target: maint('spark_plug') },
  // A battery is a service only with a swap word; a bare "battery" might be a charger.
  {
    pattern: new RegExp(`\\b(battery|batt)\\b.*\\b${SWAP}\\b|\\b${SWAP}\\b.*\\b(battery|batt)\\b`),
    target: maint('battery'),
  },
  { pattern: /\b(battery|batt)\b/, target: expense('other') },

  // Positional parts: resolved only when the position is stated (see resolvePositional).
  { pattern: /\bbrake\s*pads?\b|\bbrake\s*shoes?\b/, target: maint('brake_pads_front') },
  { pattern: /\b(tire|tyre|tires|tyres|gulong|pneu)\b/, target: maint('tire_front') },

  // Fuel: a station or fuel word on its own, optionally with a grade or quantity word.
  // "Shell helmet" and "fuel additive" do not match.
  {
    pattern:
      /^(petron|shell|caltex|phoenix|seaoil|unioil|total|gas|gasoline|fuel|diesel)(\s+(gas|gasoline|fuel|diesel|unleaded|ron\s*\d{2}|\d+))?$/,
    target: FUEL,
  },
  { pattern: /\b(gasolina|unleaded|refuel|gas\s*up|fuel\s*up|pagpuno|pa-?gas)\b/, target: FUEL },

  // Repairs and labor
  { pattern: /\b(repair|repaired|fix|fixed|ayos|sira|labor|labour|mechanic|pagawa)\b/, target: REPAIR },

  // Plain expenses
  {
    pattern: /\b(helmet|jacket|gloves?|accessor(y|ies)|phone\s*holder|mirror|seat\s*cover|riding\s*gear)\b/,
    target: expense('accessories'),
  },
  { pattern: /\b(parking|parkingan|park)\b/, target: expense('parking') },
  { pattern: /\b(registration|rehistro|orcr|lto|renewal)\b/, target: expense('registration') },
  { pattern: /\b(insurance|insurans|seguro)\b/, target: expense('insurance') },
  { pattern: /\b(wash|washing|hugas|carwash|car\s*wash)\b/, target: expense('washing') },
];

/** Normalize for matching: lowercase, unify dashes and whitespace. */
function normalize(text: string): string {
  return text.toLowerCase().replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim();
}

const FRONT = /\b(front|harap)\b/;
const REAR = /\b(rear|back|likod)\b/;

/**
 * Brake pads and tires resolve to a specific component only when the text says
 * front or rear. Otherwise the result is a generic expense, so the rider picks
 * the component in the picker. The component model has no generic "tires" or
 * "brake pads" entry, so there is no safe default to fall back to.
 */
function resolvePositional(normalized: string, target: QuickAddTarget): QuickAddTarget {
  if (target.kind !== 'maintenance') {
    return target;
  }
  const isBrakePads = target.componentType === 'brake_pads_front';
  const isTire = target.componentType === 'tire_front';
  if (!isBrakePads && !isTire) {
    return target;
  }
  const front = FRONT.test(normalized);
  const rear = REAR.test(normalized);
  if (front === rear) {
    return expense(isBrakePads ? 'service' : 'tires');
  }
  if (isBrakePads) {
    return maint(front ? 'brake_pads_front' : 'brake_pads_rear');
  }
  return maint(front ? 'tire_front' : 'tire_rear');
}

export function classifyQuickAdd(text: string): ClassifyResult {
  const normalized = normalize(text);
  if (normalized === '') {
    return { target: expense('other'), matched: false };
  }
  for (const rule of RULES) {
    if (rule.pattern.test(normalized)) {
      return { target: resolvePositional(normalized, rule.target), matched: true };
    }
  }
  return { target: expense('other'), matched: false };
}

/** Stable string key for pickers: "maintenance:engine_oil", "fuel", "repair", "expense:parking". */
export function targetKey(target: QuickAddTarget): string {
  switch (target.kind) {
    case 'maintenance':
      return `maintenance:${target.componentType}`;
    case 'expense':
      return `expense:${target.category}`;
    default:
      return target.kind;
  }
}

/** Inverse of targetKey; returns null for an unknown key. */
export function parseTargetKey(key: string): QuickAddTarget | null {
  if (key === 'fuel') {
    return FUEL;
  }
  if (key === 'repair') {
    return REPAIR;
  }
  const [head, value] = key.split(':');
  if (head === 'maintenance' && value !== undefined) {
    return maint(value as ComponentType);
  }
  if (head === 'expense' && value !== undefined) {
    return expense(value as ExpenseCategory);
  }
  return null;
}
