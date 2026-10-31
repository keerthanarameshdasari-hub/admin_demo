import { describe, expect, it } from 'vitest';
import { formatDateTime, formatMoney, humanise } from './format.ts';

describe('format', () => {
  it('formats minor units with the currency’s own decimals', () => {
    expect(formatMoney(250_000, 'INR')).toBe('₹2,500.00');
    expect(formatMoney(999, 'INR')).toBe('₹9.99');
    expect(formatMoney(1500, 'JPY')).toBe('JP¥1,500'); // zero-decimal currency: minor unit = yen
  });

  it('shows a dash for missing or invalid dates', () => {
    expect(formatDateTime(null)).toBe('—');
    expect(formatDateTime('not a date')).toBe('—');
    expect(formatDateTime('2026-10-31T10:00:00.000Z')).toMatch(/2026/);
  });

  it('humanises enum values', () => {
    expect(humanise('TIMED_OUT')).toBe('Timed out');
  });
});
