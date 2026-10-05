import { classifyQuickAdd, parseTargetKey, targetKey } from './QuickAddClassifier';

describe('classifyQuickAdd: clear matches', () => {
  test.each([
    ['Motul 10W-40', { kind: 'maintenance', componentType: 'engine_oil' }],
    ['10w40', { kind: 'maintenance', componentType: 'engine_oil' }],
    ['oil change', { kind: 'maintenance', componentType: 'engine_oil' }],
    ['shell advance', { kind: 'maintenance', componentType: 'engine_oil' }],
    ['Motul DOT 4', { kind: 'maintenance', componentType: 'brake_fluid' }],
    ['gear oil', { kind: 'maintenance', componentType: 'gear_oil' }],
    ['oil filter', { kind: 'maintenance', componentType: 'oil_filter' }],
    ['replace air filter', { kind: 'maintenance', componentType: 'air_filter_replace' }],
    ['clean air filter', { kind: 'maintenance', componentType: 'air_filter_clean' }],
    ['front brake pads', { kind: 'maintenance', componentType: 'brake_pads_front' }],
    ['brake pad replacement rear', { kind: 'maintenance', componentType: 'brake_pads_rear' }],
    ['front tire', { kind: 'maintenance', componentType: 'tire_front' }],
    ['rear tyre', { kind: 'maintenance', componentType: 'tire_rear' }],
    ['rear gulong', { kind: 'maintenance', componentType: 'tire_rear' }],
    ['chain lube', { kind: 'maintenance', componentType: 'chain_lube' }],
    ['chain adjustment', { kind: 'maintenance', componentType: 'chain_lube' }],
    ['chain cleaner', { kind: 'maintenance', componentType: 'chain_lube' }],
    ['chain replacement', { kind: 'maintenance', componentType: 'chain_replacement' }],
    ['spark plug', { kind: 'maintenance', componentType: 'spark_plug' }],
    ['replace battery', { kind: 'maintenance', componentType: 'battery' }],
    ['Petron', { kind: 'fuel' }],
    ['Petron 95', { kind: 'fuel' }],
    ['shell', { kind: 'fuel' }],
    ['gas', { kind: 'fuel' }],
    ['brake repair', { kind: 'repair' }],
  ])('"%s" → %j', (text, expected) => {
    const result = classifyQuickAdd(text);
    expect(result.matched).toBe(true);
    expect(result.target).toEqual(expected);
  });

  test.each([
    ['helmet', 'accessories'],
    ['phone holder', 'accessories'],
    ['parking', 'parking'],
    ['registration', 'registration'],
    ['car wash', 'washing'],
  ])('plain expense "%s" → expense:%s', (text, category) => {
    expect(classifyQuickAdd(text).target).toEqual({ kind: 'expense', category });
  });
});

describe('classifyQuickAdd: ambiguous parts stay expenses (no guessed component)', () => {
  test('ambiguous tire input', () => {
    expect(classifyQuickAdd('gulong').target).toEqual({ kind: 'expense', category: 'tires' });
    expect(classifyQuickAdd('tire').target).toEqual({ kind: 'expense', category: 'tires' });
  });

  test('ambiguous brake pad input', () => {
    expect(classifyQuickAdd('brake pads').target).toEqual({ kind: 'expense', category: 'service' });
  });

  test('ambiguous air filter input', () => {
    expect(classifyQuickAdd('air filter').target).toEqual({ kind: 'expense', category: 'service' });
  });
});

describe('classifyQuickAdd: false-positive guards', () => {
  // Each of these used to, or could, map to a maintenance component and reset a schedule.
  test.each([
    ['chain lock', { kind: 'expense', category: 'other' }],
    ['chain cover', { kind: 'expense', category: 'other' }],
    ['oil', { kind: 'expense', category: 'oil' }],
    ['baby oil', { kind: 'expense', category: 'oil' }],
    ['Castrol', { kind: 'expense', category: 'other' }],
    ['Motul', { kind: 'expense', category: 'other' }],
    ['battery charger', { kind: 'expense', category: 'other' }],
    ['battery', { kind: 'expense', category: 'other' }],
    ['phone plug', { kind: 'expense', category: 'other' }],
    ['plug', { kind: 'expense', category: 'other' }],
    ['shell helmet', { kind: 'expense', category: 'accessories' }],
    ['fuel additive', { kind: 'expense', category: 'other' }],
    ['unknown cleaner', { kind: 'expense', category: 'other' }],
    ['random accessory', { kind: 'expense', category: 'accessories' }],
    ['xyzzy widget', { kind: 'expense', category: 'other' }],
  ])('"%s" → %j', (text, expected) => {
    expect(classifyQuickAdd(text).target).toEqual(expected);
  });

  test('empty input is an expense fallback', () => {
    expect(classifyQuickAdd('   ')).toEqual({ target: { kind: 'expense', category: 'other' }, matched: false });
  });
});

describe('target keys (picker override)', () => {
  test('round-trip through the picker key format', () => {
    for (const target of [
      { kind: 'maintenance', componentType: 'engine_oil' },
      { kind: 'maintenance', componentType: 'tire_rear' },
      { kind: 'expense', category: 'parking' },
      { kind: 'fuel' },
      { kind: 'repair' },
    ] as const) {
      expect(parseTargetKey(targetKey(target))).toEqual(target);
    }
  });

  test('unknown keys are rejected', () => {
    expect(parseTargetKey('bogus')).toBeNull();
  });
});
