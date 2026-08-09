/** Fee constants for Mt. Kalisungan hikes (Philippine Peso ₱) */
export const ENTRY_FEE_PER_PERSON = 50;   // ₱50 registration
export const ENV_FEE_PER_PERSON   = 20;   // ₱20 environmental/DSPA
export const GUIDE_FEE_FLAT       = 300;  // ₱300 guide fee per group (mandatory)
export const PEAK_EXTENSION_FEE_PER_HOUR = 100;

export interface FeeBreakdown {
  entryFee: number;
  envFee: number;
  guideFee: number;
  totalFee: number;
}

export function calculateFees(groupSize: number): FeeBreakdown {
  const entryFee = ENTRY_FEE_PER_PERSON * groupSize;
  const envFee   = ENV_FEE_PER_PERSON   * groupSize;
  const guideFee = GUIDE_FEE_FLAT;
  return { entryFee, envFee, guideFee, totalFee: entryFee + envFee + guideFee };
}

export function calculatePeakExtensionFee(hours: number | null | undefined): number {
  return Math.max(0, Math.floor(Number(hours) || 0)) * PEAK_EXTENSION_FEE_PER_HOUR;
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
