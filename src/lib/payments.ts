import * as shared from '../../supabase/functions/_shared/payments';
import { getPricingConfig, getDynamicFeePolicyText } from './pricingService';
import type { PricingConfig } from '@/types/pricing';

export * from '../../supabase/functions/_shared/payments';

export interface ExtendedFeeOptions extends shared.FeeOptions {
  pricing?: PricingConfig | null;
}

export function getDynamicGuideFee(hikeType?: string | null, pricing: PricingConfig = getPricingConfig()): number {
  if (hikeType === 'night') return pricing.guideFeeNight;
  if (hikeType === 'overnight') return pricing.guideFeeOvernight;
  return pricing.guideFeeMorning;
}

/**
 * Calculates hike fees using the system's dynamic pricing schedule.
 * Automatically respects Central Admin updates, defaulting to standard official rates.
 */
export function calculateFees(groupSize: number, options?: ExtendedFeeOptions): shared.FeeBreakdown {
  const pricing = options?.pricing || getPricingConfig();
  const size = Math.max(1, groupSize || 1);

  const entryFee = pricing.entryFee * size;
  const envFee = pricing.envFee * size;
  const guidesNeeded = shared.calculateGuidesNeeded(size);
  const guideFee = guidesNeeded * getDynamicGuideFee(options?.hikeType, pricing);

  const peakExtensionHours = Math.max(0, Math.floor(Number(options?.peakExtensionHours) || 0));
  const peakExtensionFee = peakExtensionHours * pricing.peakExtensionFeePerHour;

  const emergencyHorseCount = Math.max(0, Math.floor(Number(options?.emergencyHorseCount) || 0));
  const emergencyHorseFee = emergencyHorseCount * pricing.horseEmergencyFee;

  const customAdjustment = Number(options?.customAdjustment) || 0;
  const totalFee = entryFee + envFee + guideFee + peakExtensionFee + emergencyHorseFee + customAdjustment;

  return {
    entryFee,
    envFee,
    guideFee,
    guidesNeeded,
    peakExtensionHours,
    peakExtensionFee,
    emergencyHorseCount,
    emergencyHorseFee,
    customAdjustment,
    totalFee,
    total: totalFee,
  };
}

export { getPricingConfig, getDynamicFeePolicyText };
