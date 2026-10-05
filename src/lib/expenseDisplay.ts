import type { UnifiedExpenseRow } from '@/db/repositories/ExpenseRepository';
import { formatCategoryName, formatComponentName } from '@/lib/format';

/**
 * Display name for one row of the unified expense list.
 *
 * `title` carries the item name for every source that has one: standalone
 * expense title, repair title, fuel station, custom maintenance name. `label`
 * is NOT a name: for maintenance it is the raw component type, for standalone
 * expenses it is the notes. Blank or missing titles fall back to the source's
 * own default, never to `label`.
 */
export function unifiedRowName(row: Pick<UnifiedExpenseRow, 'source' | 'category' | 'title' | 'label'>): string {
  const title = row.title?.trim() ?? '';
  if (title !== '') {
    return title;
  }
  if (row.source === 'maintenance' && row.label !== null) {
    return formatComponentName(row.label, null);
  }
  if (row.source === 'fuel') {
    return 'Fuel';
  }
  return formatCategoryName(row.category);
}
