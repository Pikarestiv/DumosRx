import { describe, it, expect } from 'vitest';
import { calculatePrescriptionItemCost } from '@/lib/utils/prescription-calculations';

describe('calculatePrescriptionItemCost', () => {
  it('multiplies unit cost by quantity', () => {
    expect(calculatePrescriptionItemCost(500, 10)).toBe(5000);
  });

  it('returns 0 for zero quantity', () => {
    expect(calculatePrescriptionItemCost(500, 0)).toBe(0);
  });

  it('returns 0 for negative unit cost or quantity', () => {
    expect(calculatePrescriptionItemCost(-1, 10)).toBe(0);
    expect(calculatePrescriptionItemCost(500, -1)).toBe(0);
  });
});
