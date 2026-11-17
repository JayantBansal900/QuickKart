import { describe, expect, it } from 'vitest';
import { formatINR, formatPrice } from './formatters';
describe('authoritative monetary display', () => {
  it('preserves paise in product prices and checkout totals', () => {
    expect(formatINR(25.5)).toBe('₹25.50');
    expect(formatINR(25.5 * 3)).toBe('₹76.50');
  });
  it('formats whole amounts and zero consistently', () => {
    expect(formatINR(1000)).toBe('₹1,000.00');
    expect(formatINR(0)).toBe('₹0.00');
  });
});

describe('formatPrice', () => {
  it('drops .00 for whole rupees and keeps paise otherwise', () => {
    expect(formatPrice(4699)).toBe('₹4,699');
    expect(formatPrice(25.5)).toBe('₹25.50');
    expect(formatPrice(129999)).toBe('₹1,29,999');
    expect(formatPrice(null)).toBe('₹0');
  });
});
