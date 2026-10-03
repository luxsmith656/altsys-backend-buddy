/** Fee constants for Mt. Kalisungan hikes (Philippine Peso ₱) */
import { getGuideFeePerGuide, GUIDE_FEE_BY_HIKE_TYPE } from './hike-fees.ts';
import type { BookingMeta } from '../../../src/types/index.ts';

export function getRecordedRevenue(meta: BookingMeta): number {
  const amount = Number(meta.amountPaid ?? 0);
  if (!Number.isFinite(amount) || amount < 0) return 0;
  // Settlement stores a net amount; older check-in payments store cash plus returned overpayment.
  const returned = meta.paymentSettledAt ? 0 : Number(meta.refundAmount ?? 0);
  return Math.max(0, amount - (Number.isFinite(returned) ? Math.max(0, returned) : 0));
}

export const ENTRY_FEE_PER_PERSON = 30;   // ₱30 registration fee per head
export const ENV_FEE_PER_PERSON   = 20;   // ₱20 environmental/DSPA fee per head
export const MAX_PAX_PER_GUIDE    = 5;    // 1 guide per 1–5 hikers
export const GUIDE_FEE_PER_GUIDE  = GUIDE_FEE_BY_HIKE_TYPE.morning;
export const GUIDE_FEE_FLAT       = GUIDE_FEE_PER_GUIDE;
export const PEAK_EXTENSION_FEE_PER_HOUR = 100; // ₱100 / extra hour at peak summit
export const HORSE_EMERGENCY_SERVICE_FEE = 500; // ₱500 emergency horse / porter rescue service
export const HORSE_HIGH_STATION_FEE = 1000;
export const FEE_POLICY_TEXT = `Registration is PHP ${ENTRY_FEE_PER_PERSON} per hiker; environmental fee is PHP ${ENV_FEE_PER_PERSON} per hiker. One guide covers up to ${MAX_PAX_PER_GUIDE} hikers, rounding guide count upward. Each guide costs PHP ${GUIDE_FEE_BY_HIKE_TYPE.morning} for morning, PHP ${GUIDE_FEE_BY_HIKE_TYPE.night} for night, or PHP ${GUIDE_FEE_BY_HIKE_TYPE.overnight} for overnight. These rates apply to all jump-offs and walk-ins. Peak extension is PHP ${PEAK_EXTENSION_FEE_PER_HOUR} per hour. Horse help from Stations 5-3 costs PHP ${HORSE_HIGH_STATION_FEE}; Stations 2-1 costs PHP ${HORSE_EMERGENCY_SERVICE_FEE}. Water, porter and other optional expenses have no fixed published rate: quote only the recorded amount, never invent a price. Recorded admin adjustments and actual receipt charges take precedence over a new estimate. A confirmed booking is not proof of payment.`;

export function formatFeePolicyText(pricing?: {
  entryFee?: number;
  envFee?: number;
  guideFeeMorning?: number;
  guideFeeNight?: number;
  guideFeeOvernight?: number;
  peakExtensionFeePerHour?: number;
  horseEmergencyFee?: number;
  horseHighStationFee?: number;
  maxPaxPerGuide?: number;
} | null): string {
  const entryFee = pricing?.entryFee !== undefined && Number(pricing.entryFee) >= 0 ? Number(pricing.entryFee) : ENTRY_FEE_PER_PERSON;
  const envFee = pricing?.envFee !== undefined && Number(pricing.envFee) >= 0 ? Number(pricing.envFee) : ENV_FEE_PER_PERSON;
  const maxPax = pricing?.maxPaxPerGuide !== undefined && Number(pricing.maxPaxPerGuide) > 0 ? Number(pricing.maxPaxPerGuide) : MAX_PAX_PER_GUIDE;
  const morning = pricing?.guideFeeMorning !== undefined && Number(pricing.guideFeeMorning) >= 0 ? Number(pricing.guideFeeMorning) : GUIDE_FEE_BY_HIKE_TYPE.morning;
  const night = pricing?.guideFeeNight !== undefined && Number(pricing.guideFeeNight) >= 0 ? Number(pricing.guideFeeNight) : GUIDE_FEE_BY_HIKE_TYPE.night;
  const overnight = pricing?.guideFeeOvernight !== undefined && Number(pricing.guideFeeOvernight) >= 0 ? Number(pricing.guideFeeOvernight) : GUIDE_FEE_BY_HIKE_TYPE.overnight;
  const peak = pricing?.peakExtensionFeePerHour !== undefined && Number(pricing.peakExtensionFeePerHour) >= 0 ? Number(pricing.peakExtensionFeePerHour) : PEAK_EXTENSION_FEE_PER_HOUR;
  const horseHigh = pricing?.horseHighStationFee !== undefined && Number(pricing.horseHighStationFee) >= 0 ? Number(pricing.horseHighStationFee) : HORSE_HIGH_STATION_FEE;
  const horseEmerg = pricing?.horseEmergencyFee !== undefined && Number(pricing.horseEmergencyFee) >= 0 ? Number(pricing.horseEmergencyFee) : HORSE_EMERGENCY_SERVICE_FEE;

  return `Registration is PHP ${entryFee} per hiker; environmental fee is PHP ${envFee} per hiker. One guide covers up to ${maxPax} hikers, rounding guide count upward. Each guide costs PHP ${morning} for morning, PHP ${night} for night, or PHP ${overnight} for overnight. These rates apply to all jump-offs and walk-ins. Peak extension is PHP ${peak} per hour. Horse help from Stations 5-3 costs PHP ${horseHigh}; Stations 2-1 costs PHP ${horseEmerg}. Water, porter and other optional expenses have no fixed published rate: quote only the recorded amount, never invent a price. Recorded admin adjustments and actual receipt charges take precedence over a new estimate. A confirmed booking is not proof of payment.`;
}

export interface FeeOptions {
  hikeType?: string | null;
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
  const guideFee = guidesNeeded * getGuideFeePerGuide(options?.hikeType);
  
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
