export interface PricingConfig {
  entryFee: number;              // ₱ registration fee per head (default: 30)
  envFee: number;                // ₱ environmental / DSPA fee per head (default: 20)
  guideFeeMorning: number;       // ₱ morning guide fee (default: 800)
  guideFeeNight: number;         // ₱ night guide fee (default: 1000)
  guideFeeOvernight: number;     // ₱ overnight guide fee (default: 1600)
  peakExtensionFeePerHour: number; // ₱ peak summit extension / hour (default: 100)
  horseEmergencyFee: number;     // ₱ horse rescue Stations 2-1 (default: 500)
  horseHighStationFee: number;   // ₱ horse rescue Stations 5-3 (default: 1000)
  maxPaxPerGuide: number;        // Maximum hikers covered per mountain guide (default: 5)
  updatedAt?: string;
  updatedBy?: string;
}

export const DEFAULT_PRICING: PricingConfig = {
  entryFee: 30,
  envFee: 20,
  guideFeeMorning: 800,
  guideFeeNight: 1000,
  guideFeeOvernight: 1600,
  peakExtensionFeePerHour: 100,
  horseEmergencyFee: 500,
  horseHighStationFee: 1000,
  maxPaxPerGuide: 5,
};
