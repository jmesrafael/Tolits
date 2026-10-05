import { migration0001 } from './0001_initial';
import { migration0002 } from './0002_features';
import { migration0003 } from './0003_expense_component_link';
import { migration0004 } from './0004_expense_title';

export interface Migration {
  version: number;
  name: string;
  statements: readonly string[];
}

/**
 * Numbered, append-only, forward-only (ADR-022). `PRAGMA user_version`
 * mirrors the highest applied version (DATABASE_DESIGN.md §8.6).
 */
export const MIGRATIONS: readonly Migration[] = [
  { version: 1, name: 'initial', statements: migration0001 },
  { version: 2, name: 'features', statements: migration0002 },
  { version: 3, name: 'expense_component_link', statements: migration0003 },
  { version: 4, name: 'expense_title', statements: migration0004 },
];
