/** Fee constants for Mt. Kalisungan hikes (Philippine Peso ₱) */
export const ENTRY_FEE_PER_PERSON = 30;   // ₱30 registration fee per head
export const ENV_FEE_PER_PERSON   = 20;   // ₱20 environmental/DSPA fee per head
export const MAX_PAX_PER_GUIDE    = 8;    // 1 guide per 1–8 hikers
export const GUIDE_FEE_PER_GUIDE  = 800;  // ₱800 guide fee per guide (up to 8 pax)
export const GUIDE_FEE_FLAT       = 800;  // backwards compatibility alias
export const PEAK_EXTENSION_FEE_PER_HOUR = 100; // ₱100 / extra hour at peak summit
export const HORSE_EMERGENCY_SERVICE_FEE = 500; // ₱500 emergency horse / porter rescue service

export interface FeeOptions {
  peakExtensionHours?: number | null;
  emergencyHorseCount?: number | null;
  customAdjustment?: number | null;
}

export interface FeeBreakdown {
  entryFee: number;
  envFee: number;
  guideFee: number;
  guidesNeeded: number;
  peakExtensionHours: number;
  peakExtensionFee: number;
  emergencyHorseCount: number;
  emergencyHorseFee: number;
  customAdjustment: number;
  totalFee: number;
  total: number;
}

export function calculateGuidesNeeded(groupSize: number): number {
  const size = Math.max(1, groupSize || 1);
  return Math.max(1, Math.ceil(size / MAX_PAX_PER_GUIDE));
}

export function calculatePeakExtensionFee(hours: number | null | undefined): number {
  return Math.max(0, Math.floor(Number(hours) || 0)) * PEAK_EXTENSION_FEE_PER_HOUR;
}

export function calculateEmergencyHorseFee(count: number | null | undefined): number {
  return Math.max(0, Math.floor(Number(count) || 0)) * HORSE_EMERGENCY_SERVICE_FEE;
}

export function calculateFees(groupSize: number, options?: FeeOptions): FeeBreakdown {
  const size = Math.max(1, groupSize || 1);
  const entryFee = ENTRY_FEE_PER_PERSON * size;
  const envFee   = ENV_FEE_PER_PERSON   * size;
  const guidesNeeded = calculateGuidesNeeded(size);
  const guideFee = guidesNeeded * GUIDE_FEE_PER_GUIDE;
  
  const peakExtensionHours = Math.max(0, Math.floor(Number(options?.peakExtensionHours) || 0));
  const peakExtensionFee = peakExtensionHours * PEAK_EXTENSION_FEE_PER_HOUR;
  
  const emergencyHorseCount = Math.max(0, Math.floor(Number(options?.emergencyHorseCount) || 0));
  const emergencyHorseFee = emergencyHorseCount * HORSE_EMERGENCY_SERVICE_FEE;
  
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

export function formatPeso(amount: number): string {
  return `₱${amount.toLocaleString('en-PH')}`;
}

export type PaymentMethod = 'onsite' | 'gcash' | 'bank_transfer';
export type PaymentStatus = 'unpaid' | 'partial' | 'paid';

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  onsite: 'Pay Onsite',
  gcash: 'GCash',
  bank_transfer: 'Bank Transfer',
};

export const GCASH_DETAILS = {
  number: '0917-123-4567',
  name: 'Mt. Kalisungan Tourism Office',
};

export const BANK_DETAILS = {
  bank: 'BDO Unibank',
  accountNo: '0123-4567-8901',
  accountName: 'Barangay Lamot II Tourism Fund',
};
