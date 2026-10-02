import { useEffect, useState } from 'react';
import {
  getPricingConfig,
  subscribePricing,
  fetchPricingConfig,
  updatePricingConfig,
  resetPricingConfig,
  getDynamicFeePolicyText,
} from '@/lib/pricingService';
import { PricingConfig } from '@/types/pricing';

export function usePricing() {
  const [pricing, setPricing] = useState<PricingConfig>(getPricingConfig);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Initial fetch from backend
    void fetchPricingConfig();
    // Subscribe to immediate window/localStorage updates
    const unsubscribe = subscribePricing((updated) => {
      setPricing(updated);
    });
    return unsubscribe;
  }, []);

  const update = async (updates: Partial<PricingConfig>, userId?: string) => {
    setLoading(true);
    try {
      const res = await updatePricingConfig(updates, userId);
      setPricing(res);
      return res;
    } finally {
      setLoading(false);
    }
  };

  const reset = async (userId?: string) => {
    setLoading(true);
    try {
      const res = await resetPricingConfig(userId);
      setPricing(res);
      return res;
    } finally {
      setLoading(false);
    }
  };

  return {
    pricing,
    loading,
    updatePricing: update,
    resetPricing: reset,
    feePolicyText: getDynamicFeePolicyText(pricing),
  };
}
