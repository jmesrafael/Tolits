import { parsePesosToCentavos, sanitizePesosText } from './format';

describe('parsePesosToCentavos', () => {
  test.each([
    ['450', 45000],
    ['450.5', 45050],
    ['450.50', 45050],
    ['0.01', 1],
    ['1200.25', 120025],
    ['.75', 75],
    ['0', 0],
  ])('"%s" → %i centavos (exact)', (text, centavos) => {
    expect(parsePesosToCentavos(text)).toBe(centavos);
  });

  test('exact where floating-point multiplication drifts', () => {
    // 0.29 * 100 === 28.999999999999996 in floating point; the string parse is exact.
    expect(parsePesosToCentavos('0.29')).toBe(29);
    expect(parsePesosToCentavos('1.15')).toBe(115);
  });

  test.each(['', '.', '1.2.3', '4.567', 'abc', '-5', '1,200'])('rejects "%s"', (text) => {
    expect(parsePesosToCentavos(text)).toBeNull();
  });
});

describe('sanitizePesosText', () => {
  test('keeps digits and a single decimal point with at most two decimals', () => {
    expect(sanitizePesosText('1.2.3')).toBe('1.23');
    expect(sanitizePesosText('4.567')).toBe('4.56');
    expect(sanitizePesosText('₱ 450')).toBe('450');
    expect(sanitizePesosText('.5')).toBe('.5');
    expect(sanitizePesosText('12')).toBe('12');
  });
});
