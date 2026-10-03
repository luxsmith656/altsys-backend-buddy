import { supabase } from '@/integrations/supabase/client';
import { PricingConfig, DEFAULT_PRICING } from '@/types/pricing';

const STORAGE_KEY = 'mtk_kalisungan_pricing';
const PRICING_EVENT = 'mtk-pricing-updated';

let cachedPricing: PricingConfig = (() => {
  if (typeof window === 'undefined') return { ...DEFAULT_PRICING };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PRICING };
    const parsed = JSON.parse(raw);
    return {
      entryFee: Number(parsed.entryFee) >= 0 ? Number(parsed.entryFee) : DEFAULT_PRICING.entryFee,
      envFee: Number(parsed.envFee) >= 0 ? Number(parsed.envFee) : DEFAULT_PRICING.envFee,
      guideFeeMorning: Number(parsed.guideFeeMorning) >= 0 ? Number(parsed.guideFeeMorning) : DEFAULT_PRICING.guideFeeMorning,
      guideFeeNight: Number(parsed.guideFeeNight) >= 0 ? Number(parsed.guideFeeNight) : DEFAULT_PRICING.guideFeeNight,
      guideFeeOvernight: Number(parsed.guideFeeOvernight) >= 0 ? Number(parsed.guideFeeOvernight) : DEFAULT_PRICING.guideFeeOvernight,
      peakExtensionFeePerHour: Number(parsed.peakExtensionFeePerHour) >= 0 ? Number(parsed.peakExtensionFeePerHour) : DEFAULT_PRICING.peakExtensionFeePerHour,
      horseEmergencyFee: Number(parsed.horseEmergencyFee) >= 0 ? Number(parsed.horseEmergencyFee) : DEFAULT_PRICING.horseEmergencyFee,
      horseHighStationFee: Number(parsed.horseHighStationFee) >= 0 ? Number(parsed.horseHighStationFee) : DEFAULT_PRICING.horseHighStationFee,
      maxPaxPerGuide: Number(parsed.maxPaxPerGuide) > 0 ? Number(parsed.maxPaxPerGuide) : DEFAULT_PRICING.maxPaxPerGuide,
      updatedAt: parsed.updatedAt,
      updatedBy: parsed.updatedBy,
    };
  } catch {
    return { ...DEFAULT_PRICING };
  }
})();

export function getPricingConfig(): PricingConfig {
  return { ...cachedPricing };
}

export function getMaxPaxPerGuide(): number {
  return cachedPricing.maxPaxPerGuide > 0 ? cachedPricing.maxPaxPerGuide : 5;
}

export function subscribePricing(listener: (config: PricingConfig) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = () => listener(getPricingConfig());
  window.addEventListener(PRICING_EVENT, handler);
  return () => window.removeEventListener(PRICING_EVENT, handler);
}

function notifySubscribers(config: PricingConfig) {
  cachedPricing = { ...config };
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
      window.dispatchEvent(new CustomEvent(PRICING_EVENT, { detail: config }));
    } catch {
      // Ignore storage errors in restricted contexts
    }
  }
}

export async function fetchPricingConfig(): Promise<PricingConfig> {
  try {
    const { data, error }: any = await (supabase
      .from('system_settings' as any)
      .select('value, updated_at, updated_by')
      .eq('key', 'pricing_config')
      .maybeSingle() as any);

    if (!error && data && data.value && typeof data.value === 'object') {
      const val = data.value as any;
      const loaded: PricingConfig = {
        entryFee: Number(val.entryFee) >= 0 ? Number(val.entryFee) : DEFAULT_PRICING.entryFee,
        envFee: Number(val.envFee) >= 0 ? Number(val.envFee) : DEFAULT_PRICING.envFee,
        guideFeeMorning: Number(val.guideFeeMorning) >= 0 ? Number(val.guideFeeMorning) : DEFAULT_PRICING.guideFeeMorning,
        guideFeeNight: Number(val.guideFeeNight) >= 0 ? Number(val.guideFeeNight) : DEFAULT_PRICING.guideFeeNight,
        guideFeeOvernight: Number(val.guideFeeOvernight) >= 0 ? Number(val.guideFeeOvernight) : DEFAULT_PRICING.guideFeeOvernight,
        peakExtensionFeePerHour: Number(val.peakExtensionFeePerHour) >= 0 ? Number(val.peakExtensionFeePerHour) : DEFAULT_PRICING.peakExtensionFeePerHour,
        horseEmergencyFee: Number(val.horseEmergencyFee) >= 0 ? Number(val.horseEmergencyFee) : DEFAULT_PRICING.horseEmergencyFee,
        horseHighStationFee: Number(val.horseHighStationFee) >= 0 ? Number(val.horseHighStationFee) : DEFAULT_PRICING.horseHighStationFee,
        maxPaxPerGuide: Number(val.maxPaxPerGuide) > 0 ? Number(val.maxPaxPerGuide) : DEFAULT_PRICING.maxPaxPerGuide,
        updatedAt: (data as any).updated_at ?? (val.updatedAt || undefined),
        updatedBy: (data as any).updated_by ?? (val.updatedBy || undefined),
      };
      notifySubscribers(loaded);
      return loaded;
    }
  } catch {
    // Graceful fallback to cached
  }
  return getPricingConfig();
}

export async function updatePricingConfig(
  updates: Partial<PricingConfig>,
  userId?: string
): Promise<PricingConfig> {
  const current = getPricingConfig();
  const next: PricingConfig = {
    entryFee: updates.entryFee !== undefined && Number(updates.entryFee) >= 0 ? Number(updates.entryFee) : current.entryFee,
    envFee: updates.envFee !== undefined && Number(updates.envFee) >= 0 ? Number(updates.envFee) : current.envFee,
    guideFeeMorning: updates.guideFeeMorning !== undefined && Number(updates.guideFeeMorning) >= 0 ? Number(updates.guideFeeMorning) : current.guideFeeMorning,
    guideFeeNight: updates.guideFeeNight !== undefined && Number(updates.guideFeeNight) >= 0 ? Number(updates.guideFeeNight) : current.guideFeeNight,
    guideFeeOvernight: updates.guideFeeOvernight !== undefined && Number(updates.guideFeeOvernight) >= 0 ? Number(updates.guideFeeOvernight) : current.guideFeeOvernight,
    peakExtensionFeePerHour: updates.peakExtensionFeePerHour !== undefined && Number(updates.peakExtensionFeePerHour) >= 0 ? Number(updates.peakExtensionFeePerHour) : current.peakExtensionFeePerHour,
    horseEmergencyFee: updates.horseEmergencyFee !== undefined && Number(updates.horseEmergencyFee) >= 0 ? Number(updates.horseEmergencyFee) : current.horseEmergencyFee,
    horseHighStationFee: updates.horseHighStationFee !== undefined && Number(updates.horseHighStationFee) >= 0 ? Number(updates.horseHighStationFee) : current.horseHighStationFee,
    maxPaxPerGuide: updates.maxPaxPerGuide !== undefined && Number(updates.maxPaxPerGuide) > 0 ? Number(updates.maxPaxPerGuide) : current.maxPaxPerGuide,
    updatedAt: new Date().toISOString(),
    updatedBy: userId || current.updatedBy,
  };

  notifySubscribers(next);

  try {
    await supabase.from('system_settings' as any).upsert(
      {
        key: 'pricing_config',
        value: next,
        updated_at: next.updatedAt,
        updated_by: next.updatedBy ?? null,
      },
      { onConflict: 'key' }
    );
  } catch (err) {
    console.warn('Could not persist pricing to system_settings:', err);
  }

  return next;
}

export async function resetPricingConfig(userId?: string): Promise<PricingConfig> {
  return updatePricingConfig({ ...DEFAULT_PRICING }, userId);
}

export function getDynamicFeePolicyText(pricing: PricingConfig = getPricingConfig()): string {
  const maxPax = pricing.maxPaxPerGuide > 0 ? pricing.maxPaxPerGuide : 5;
  return `Registration is PHP ${pricing.entryFee} per hiker; environmental fee is PHP ${pricing.envFee} per hiker. One guide covers up to ${maxPax} hikers, rounding guide count upward. Each guide costs PHP ${pricing.guideFeeMorning} for morning, PHP ${pricing.guideFeeNight} for night, or PHP ${pricing.guideFeeOvernight} for overnight. These rates apply to all jump-offs and walk-ins. Peak extension is PHP ${pricing.peakExtensionFeePerHour} per hour. Horse help from Stations 5-3 costs PHP ${pricing.horseHighStationFee}; Stations 2-1 costs PHP ${pricing.horseEmergencyFee}. Water, porter and other optional expenses have no fixed published rate: quote only the recorded amount, never invent a price. Recorded admin adjustments and actual receipt charges take precedence over a new estimate. A confirmed booking is not proof of payment.`;
}
