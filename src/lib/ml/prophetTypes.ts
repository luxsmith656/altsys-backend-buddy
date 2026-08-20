/**
 * Facebook Prophet Time-Series Forecasting Types for Mt. Kalisungan Trail Management
 */

export interface ProphetDataPoint {
  /** Date string in YYYY-MM-DD format */
  ds: string;
  /** Actual confirmed bookings or visitor headcount */
  y: number;
  /** Maximum capacity ceiling (for logistic growth) */
  cap?: number;
  /** Minimum floor (default 0) */
  floor?: number;
  /** Rain probability (0 - 100%) */
  rain_prob?: number;
  /** Precipitation amount (mm) */
  precipitation_mm?: number;
  /** Max temperature (°C) */
  temp_max?: number;
  /** PAGASA Tropical Cyclone Wind Signal (0 = None, 1 = Signal #1, 2 = Signal #2, 3 = Signal #3, 4 = Signal #4) */
  typhoon_signal?: number;
  /** Natural calamity severity: none | yellow | orange | red */
  calamity_alert?: 'none' | 'yellow' | 'orange' | 'red';
  /** LGU announcement impact weight (-1.0 to +1.0) */
  lgu_impact?: number;
  /** Name of national/local holiday or event if any */
  holiday_name?: string;
  /** Metadata tag e.g. 'actual' | 'synthetic_baseline' */
  source?: 'actual' | 'synthetic_baseline';
}

export interface ProphetHyperparameters {
  growth: 'linear' | 'logistic';
  nChangepoints: number;
  changepointRange: number; // e.g. 0.8 (place changepoints in first 80% of data)
  changepointPriorScale: number; // tau (regularization parameter)
  seasonalityPriorScale: number;
  holidaysPriorScale: number;
  yearlySeasonalityOrder: number; // Fourier order for annual cycle (P=365.25)
  weeklySeasonalityOrder: number; // Fourier order for weekly cycle (P=7)
  monthlySeasonalityOrder: number; // Fourier order for monthly cycle (P=30.4375)
  intervalWidth: number; // 0.80 or 0.95 (confidence interval)
  uncertaintySamples: number; // Monte Carlo / residual bootstrapping iterations
}

export const DEFAULT_PROPHET_PARAMS: ProphetHyperparameters = {
  growth: 'linear',
  nChangepoints: 20,
  changepointRange: 0.8,
  changepointPriorScale: 0.05,
  seasonalityPriorScale: 10.0,
  holidaysPriorScale: 10.0,
  yearlySeasonalityOrder: 5,
  weeklySeasonalityOrder: 3,
  monthlySeasonalityOrder: 2,
  intervalWidth: 0.95,
  uncertaintySamples: 200,
};

export interface ProphetForecastPoint {
  ds: string;
  /** Date object for sorting & formatting */
  date: Date;
  /** Day of week: 'Mon', 'Tue', etc. */
  dayOfWeek: string;
  /** Formatted label */
  displayLabel: string;
  /** Actual historical value if known */
  y?: number;
  /** Final combined forecast */
  yhat: number;
  /** Lower bound of confidence interval */
  yhat_lower: number;
  /** Upper bound of confidence interval */
  yhat_upper: number;
  /** Base trend component g(t) */
  trend: number;
  /** Weekly seasonality component s_weekly(t) */
  weekly: number;
  /** Yearly seasonality component s_yearly(t) */
  yearly: number;
  /** Monthly payday seasonality component s_monthly(t) */
  monthly: number;
  /** Combined holiday & event effect h(t) */
  holidays: number;
  /** Specific regressor effects */
  weatherEffect: number;
  calamityEffect: number;
  lguEffect: number;
  /** Capacity limit on this date */
  capacityLimit: number;
  /** Flag if forecasted value exceeds capacity limit */
  isOverCapacity: boolean;
  /** Regressor input details */
  factors: {
    rainProb: number;
    precipitationMm: number;
    tempMax: number;
    typhoonSignal: number;
    calamityAlert: 'none' | 'yellow' | 'orange' | 'red';
    lguAnnouncement?: string;
    holiday?: string;
  };
  isFuture: boolean;
}

export interface AggregatedForecastPoint {
  periodLabel: string;
  startDate: string;
  endDate: string;
  yhatTotal: number;
  yhatLowerTotal: number;
  yhatUpperTotal: number;
  actualTotal?: number;
  trendAvg: number;
  weeklyAvg: number;
  yearlyAvg: number;
  regressorsTotal: number;
  maxCapacityTotal: number;
  isOverCapacity: boolean;
  peakDayDate: string;
  peakDayYhat: number;
  daysCount: number;
}

export interface ProphetEvaluationMetrics {
  mae: number; // Mean Absolute Error
  rmse: number; // Root Mean Squared Error
  mape: number; // Mean Absolute Percentage Error (%)
  coverage: number; // % of actual values inside [yhat_lower, yhat_upper]
  r2: number; // R² Score
  testSamples: number;
  trainingSamples: number;
}

export interface ProphetDecompositionData {
  trendSeries: { ds: string; trend: number; changepointRateDelta?: number }[];
  weeklyProfile: { day: string; dayIndex: number; effectPercent: number; deltaHikers: number }[];
  yearlyProfile: { month: string; monthIndex: number; effectPercent: number; label: string }[];
  regressorContributions: { name: string; impactDelta: number; description: string }[];
}

export interface ScenarioSimulationParams {
  typhoonSignal: number; // 0-4
  typhoonStartDate?: string;
  typhoonEndDate?: string;
  lguPromoActive: boolean;
  lguPromoDelta: number; // e.g. +0.30 (+30%)
  lguMaintenanceActive: boolean;
  lguMaintenanceDelta: number; // e.g. -0.50 (-50%)
  extremeRainBoost: number; // 0 to 100% added rain probability
  growthMultiplier: number; // 0.5 to 2.0
}

export const DEFAULT_SCENARIO_PARAMS: ScenarioSimulationParams = {
  typhoonSignal: 0,
  lguPromoActive: false,
  lguPromoDelta: 0.25,
  lguMaintenanceActive: false,
  lguMaintenanceDelta: -0.4,
  extremeRainBoost: 0,
  growthMultiplier: 1.0,
};
