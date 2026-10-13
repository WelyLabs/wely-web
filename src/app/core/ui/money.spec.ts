import { describe, it, expect } from 'vitest';
import { centsToInput, formatCents, parseEuros } from './money';

describe('money', () => {
  it('formatCents_shouldWriteEurosTheFrenchWay', () => {
    // Intl separates thousands and the sign with narrow no-break spaces.
    expect(formatCents(1234).replace(/\s/g, ' ')).toBe('12,34 €');
    expect(formatCents(123456).replace(/\s/g, ' ')).toBe('1 234,56 €');
    expect(formatCents(0).replace(/\s/g, ' ')).toBe('0,00 €');
  });

  it('parseEuros_shouldReadCommaDotAndCurrencySign', () => {
    expect(parseEuros('12,5')).toBe(1250);
    expect(parseEuros('12.50')).toBe(1250);
    expect(parseEuros(' 12 € ')).toBe(1200);
    expect(parseEuros('1 234,56')).toBe(123456);
  });

  it('parseEuros_shouldNotGoThroughAFloat', () => {
    // 0.29 * 100 is 28.999999999999996 in floating point.
    expect(parseEuros('0,29')).toBe(29);
    expect(parseEuros('1,10')).toBe(110);
  });

  it('parseEuros_shouldRefuseWhatIsNotAnAmount', () => {
    expect(parseEuros('')).toBeNull();
    expect(parseEuros('abc')).toBeNull();
    expect(parseEuros('12,345')).toBeNull();
    expect(parseEuros('-5')).toBeNull();
    expect(parseEuros('1,2,3')).toBeNull();
  });

  it('centsToInput_shouldGiveAnEditableAmount', () => {
    expect(centsToInput(1250)).toBe('12,50');
    expect(centsToInput(7)).toBe('0,07');
  });
});
