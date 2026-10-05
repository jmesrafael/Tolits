/**
 * Migration 0004 — gives a standalone expense a short name for what was
 * bought ("Motul 10W-40", "Chain lube") so the Money list can lead with it
 * instead of the category. Purely additive: existing expenses get NULL, and
 * the list falls back to the category name for them, same as before.
 */

export const migration0004: readonly string[] = [`ALTER TABLE expenses ADD COLUMN title TEXT`];
