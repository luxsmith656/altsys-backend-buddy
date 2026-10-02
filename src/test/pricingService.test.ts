import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getPricingConfig,
  updatePricingConfig,
  resetPricingConfig,
  getDynamicFeePolicyText,
  subscribePricing,
} from '@/lib/pricingService';
import { calculateFees, getDynamicGuideFee } from '@/lib/payments';
import { DEFAULT_PRICING } from '@/types/pricing';

describe('Pricing Service & Dynamic Fee System', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetPricingConfig();
  });

  it('provides official default pricing', () => {
    const pricing = getPricingConfig();
    expect(pricing.entryFee).toBe(30);
    expect(pricing.envFee).toBe(20);
    expect(pricing.guideFeeMorning).toBe(800);
    expect(pricing.guideFeeNight).toBe(1000);
    expect(pricing.guideFeeOvernight).toBe(1600);
    expect(pricing.peakExtensionFeePerHour).toBe(100);
    expect(pricing.horseEmergencyFee).toBe(500);
  });

  it('updates pricing and notifies subscribers immediately', async () => {
    const listener = vi.fn();
    const unsub = subscribePricing(listener);

    const updated = await updatePricingConfig({
      entryFee: 50,
      envFee: 40,
      guideFeeMorning: 900,
      peakExtensionFeePerHour: 150,
    });

    expect(updated.entryFee).toBe(50);
    expect(updated.envFee).toBe(40);
    expect(updated.guideFeeMorning).toBe(900);
    expect(updated.peakExtensionFeePerHour).toBe(150);

    expect(listener).toHaveBeenCalled();
    unsub();
  });

  it('automatically applies updated pricing to calculateFees across system', async () => {
    // With defaults: 1 solo hiker morning = 30 + 20 + 800 = 850
    const defSolo = calculateFees(1, { hikeType: 'morning' });
    expect(defSolo.totalFee).toBe(850);

    // Update pricing
    await updatePricingConfig({
      entryFee: 45,
      envFee: 25,
      guideFeeMorning: 950,
    });

    // Recalculate: 1 solo hiker morning = 45 + 25 + 950 = 1020
    const updatedSolo = calculateFees(1, { hikeType: 'morning' });
    expect(updatedSolo.entryFee).toBe(45);
    expect(updatedSolo.envFee).toBe(25);
    expect(updatedSolo.guideFee).toBe(950);
    expect(updatedSolo.totalFee).toBe(1020);

    // 5 hikers: 5 * (45 + 25) + 950 = 350 + 950 = 1300
    const updatedFive = calculateFees(5, { hikeType: 'morning' });
    expect(updatedFive.totalFee).toBe(1300);
  });

  it('generates dynamic fee policy text containing updated rates', async () => {
    await updatePricingConfig({
      entryFee: 60,
      envFee: 30,
      guideFeeMorning: 850,
      guideFeeNight: 1200,
      guideFeeOvernight: 1800,
    });

    const text = getDynamicFeePolicyText();
    expect(text).toContain('Registration is PHP 60');
    expect(text).toContain('environmental fee is PHP 30');
    expect(text).toContain('PHP 850 for morning');
    expect(text).toContain('PHP 1200 for night');
    expect(text).toContain('PHP 1800 for overnight');
  });

  it('resets to defaults cleanly', async () => {
    await updatePricingConfig({ entryFee: 100 });
    expect(getPricingConfig().entryFee).toBe(100);

    await resetPricingConfig();
    expect(getPricingConfig().entryFee).toBe(30);
  });
});
