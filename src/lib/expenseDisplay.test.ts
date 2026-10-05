import type { UnifiedExpenseRow } from '@/db/repositories/ExpenseRepository';
import { unifiedRowName } from './expenseDisplay';

type Row = Pick<UnifiedExpenseRow, 'source' | 'category' | 'title' | 'label'>;

describe('unifiedRowName', () => {
  test('standalone expense shows its title', () => {
    expect(unifiedRowName({ source: 'expense', category: 'accessories', title: 'Helmet', label: 'Black, size L' })).toBe(
      'Helmet',
    );
  });

  test('standalone expense without a title shows the category, never its notes', () => {
    expect(unifiedRowName({ source: 'expense', category: 'parking', title: null, label: 'Mall, 2 hours' })).toBe(
      'Parking',
    );
  });

  test('fuel shows the station even though label is null', () => {
    expect(unifiedRowName({ source: 'fuel', category: 'fuel', title: 'Shell', label: null })).toBe('Shell');
  });

  test('fuel with no station shows "Fuel"', () => {
    expect(unifiedRowName({ source: 'fuel', category: 'fuel', title: null, label: null })).toBe('Fuel');
  });

  test('repair shows its title even though label is null', () => {
    expect(unifiedRowName({ source: 'repair', category: 'repair', title: 'Clutch cable', label: null })).toBe(
      'Clutch cable',
    );
  });

  test('maintenance without a custom name shows the component name from label', () => {
    expect(unifiedRowName({ source: 'maintenance', category: 'oil', title: null, label: 'engine_oil' })).toBe(
      'Engine oil',
    );
  });

  test('custom maintenance shows its custom name from title', () => {
    expect(unifiedRowName({ source: 'maintenance', category: 'service', title: 'Gear shifter', label: 'custom' })).toBe(
      'Gear shifter',
    );
  });

  test.each<[Row, string]>([
    [{ source: 'expense', category: 'parking', title: '', label: 'Mall' }, 'Parking'],
    [{ source: 'expense', category: 'parking', title: '   ', label: null }, 'Parking'],
    [{ source: 'fuel', category: 'fuel', title: '   ', label: null }, 'Fuel'],
  ])('blank title is treated as missing: %#', (row, expected) => {
    expect(unifiedRowName(row)).toBe(expected);
  });

  test('title is trimmed before display', () => {
    expect(unifiedRowName({ source: 'repair', category: 'repair', title: '  Brake pads  ', label: null })).toBe(
      'Brake pads',
    );
  });
});
