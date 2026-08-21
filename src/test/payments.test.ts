import { describe, it, expect } from 'vitest';
import {
  calculateFees,
  calculateGuidesNeeded,
  calculatePeakExtensionFee,
  calculateEmergencyHorseFee,
  ENTRY_FEE_PER_PERSON,
  ENV_FEE_PER_PERSON,
  GUIDE_FEE_PER_GUIDE,
  MAX_PAX_PER_GUIDE,
  PEAK_EXTENSION_FEE_PER_HOUR,
  HORSE_EMERGENCY_SERVICE_FEE,
  formatPeso,
} from '@/lib/payments';

describe('Payment and Fee Calculation Logic', () => {
  it('has correct fee constants', () => {
    expect(ENTRY_FEE_PER_PERSON).toBe(30);
    expect(ENV_FEE_PER_PERSON).toBe(20);
    expect(GUIDE_FEE_PER_GUIDE).toBe(800);
    expect(MAX_PAX_PER_GUIDE).toBe(8);
    expect(PEAK_EXTENSION_FEE_PER_HOUR).toBe(100);
    expect(HORSE_EMERGENCY_SERVICE_FEE).toBe(500);
  });

  it('calculates correct number of tour guides per 8 pax ratio', () => {
    expect(calculateGuidesNeeded(1)).toBe(1);
    expect(calculateGuidesNeeded(4)).toBe(1);
    expect(calculateGuidesNeeded(8)).toBe(1);
    expect(calculateGuidesNeeded(9)).toBe(2);
    expect(calculateGuidesNeeded(16)).toBe(2);
    expect(calculateGuidesNeeded(17)).toBe(3);
    expect(calculateGuidesNeeded(24)).toBe(3);
    expect(calculateGuidesNeeded(25)).toBe(4);
  });

  it('calculates fees accurately for 1 solo hiker', () => {
    const fees = calculateFees(1);
    expect(fees.entryFee).toBe(30);
    expect(fees.envFee).toBe(20);
    expect(fees.guidesNeeded).toBe(1);
    expect(fees.guideFee).toBe(800);
    expect(fees.totalFee).toBe(850);
  });

  it('calculates fees accurately for 4 hikers', () => {
    const fees = calculateFees(4);
    expect(fees.entryFee).toBe(120); // 30 * 4
    expect(fees.envFee).toBe(80);    // 20 * 4
    expect(fees.guidesNeeded).toBe(1);
    expect(fees.guideFee).toBe(800);
    expect(fees.totalFee).toBe(1000); // 120 + 80 + 800
  });

  it('calculates fees accurately for 8 hikers (max for 1 guide)', () => {
    const fees = calculateFees(8);
    expect(fees.entryFee).toBe(240); // 30 * 8
    expect(fees.envFee).toBe(160);   // 20 * 8
    expect(fees.guidesNeeded).toBe(1);
    expect(fees.guideFee).toBe(800);
    expect(fees.totalFee).toBe(1200);
  });

  it('calculates fees accurately for 9 hikers (triggers 2nd tour guide)', () => {
    const fees = calculateFees(9);
    expect(fees.entryFee).toBe(270);  // 30 * 9
    expect(fees.envFee).toBe(180);    // 20 * 9
    expect(fees.guidesNeeded).toBe(2); // >8 requires 2 guides
    expect(fees.guideFee).toBe(1600); // 800 * 2
    expect(fees.totalFee).toBe(2050); // 270 + 180 + 1600
  });

  it('calculates peak extension fees at ₱100 per hour', () => {
    expect(calculatePeakExtensionFee(0)).toBe(0);
    expect(calculatePeakExtensionFee(1)).toBe(100);
    expect(calculatePeakExtensionFee(3)).toBe(300);

    const fees = calculateFees(4, { peakExtensionHours: 2 });
    expect(fees.peakExtensionHours).toBe(2);
    expect(fees.peakExtensionFee).toBe(200);
    expect(fees.totalFee).toBe(1200); // 1000 base + 200 peak
  });

  it('calculates emergency horse services at ₱500 per horse', () => {
    expect(calculateEmergencyHorseFee(0)).toBe(0);
    expect(calculateEmergencyHorseFee(1)).toBe(500);
    expect(calculateEmergencyHorseFee(2)).toBe(1000);

    const fees = calculateFees(4, {
      peakExtensionHours: 1,
      emergencyHorseCount: 1,
    });
    expect(fees.peakExtensionFee).toBe(100);
    expect(fees.emergencyHorseFee).toBe(500);
    expect(fees.totalFee).toBe(1600); // 1000 base + 100 peak + 500 horse
  });

  it('formats peso string properly', () => {
    expect(formatPeso(1000)).toBe('₱1,000');
    expect(formatPeso(2050)).toBe('₱2,050');
  });
});
