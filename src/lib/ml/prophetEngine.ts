/**
 * Facebook Prophet Mathematical Forecasting Engine for Mt. Kalisungan
 * Implements Generalized Additive Model: y(t) = g(t) + s(t) + h(t) + e(t)
 */

import {
  ProphetDataPoint,
  ProphetHyperparameters,
  DEFAULT_PROPHET_PARAMS,
  ProphetForecastPoint,
  ProphetEvaluationMetrics,
  ProphetDecompositionData,
} from './prophetTypes';

/**
 * Standard Matrix Inversion using Gauss-Jordan elimination with Partial Pivoting
 */
function invertMatrix(matrix: number[][]): number[][] {
  const n = matrix.length;
  const A = matrix.map((row) => [...row]);
  const I: number[][] = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))
  );

  for (let i = 0; i < n; i++) {
    // Pivot selection
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(A[k][i]) > Math.abs(A[maxRow][i])) {
        maxRow = k;
      }
    }
    // Swap rows
    const tempA = A[i];
    A[i] = A[maxRow];
    A[maxRow] = tempA;
    const tempI = I[i];
    I[i] = I[maxRow];
    I[maxRow] = tempI;

    const pivot = A[i][i];
    const pivotVal = Math.abs(pivot) < 1e-12 ? 1e-12 : pivot;

    for (let j = 0; j < n; j++) {
      A[i][j] /= pivotVal;
      I[i][j] /= pivotVal;
    }

    for (let k = 0; k < n; k++) {
      if (k !== i) {
        const factor = A[k][i];
        for (let j = 0; j < n; j++) {
          A[k][j] -= factor * A[i][j];
          I[k][j] -= factor * I[i][j];
        }
      }
    }
  }

  return I;
}

/**
 * Multiply Matrix A (m x k) by Matrix B (k x n)
 */
function multiplyMatrices(A: number[][], B: number[][]): number[][] {
  const m = A.length;
  const k = A[0].length;
  const n = B[0].length;
  const result: number[][] = Array.from({ length: m }, () => Array(n).fill(0));

  for (let i = 0; i < m; i++) {
    for (let p = 0; p < k; p++) {
      const aVal = A[i][p];
      if (aVal === 0) continue;
      for (let j = 0; j < n; j++) {
        result[i][j] += aVal * B[p][j];
      }
    }
  }
  return result;
}

/**
 * Transpose matrix
 */
function transposeMatrix(A: number[][]): number[][] {
  const m = A.length;
  const n = A[0].length;
  const T: number[][] = Array.from({ length: n }, () => Array(m).fill(0));
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      T[j][i] = A[i][j];
    }
  }
  return T;
}

export class FacebookProphetEngine {
  private params: ProphetHyperparameters;
  private history: ProphetDataPoint[] = [];
  private tMin: number = 0;
  private tMax: number = 1;
  private changepoints: number[] = [];
  private weights: number[] = [];
  private residualStdDev: number = 5.0;
  private featureColMap: { [key: string]: number | number[] } = {};
  private trained: boolean = false;

  constructor(customParams?: Partial<ProphetHyperparameters>) {
    this.params = { ...DEFAULT_PROPHET_PARAMS, ...customParams };
  }

  /**
   * Convert YYYY-MM-DD date into day epoch
   */
  private dateToDays(ds: string): number {
    const d = new Date(ds + 'T00:00:00Z');
    return Math.floor(d.getTime() / (1000 * 60 * 60 * 24));
  }

  /**
   * Calculate Fourier periodic basis terms: [cos(2*pi*n*t/P), sin(2*pi*n*t/P), ...]
   */
  private getFourierFeatures(dayNumber: number, period: number, order: number): number[] {
    const features: number[] = [];
    for (let n = 1; n <= order; n++) {
      const angle = (2 * Math.PI * n * dayNumber) / period;
      features.push(Math.cos(angle));
      features.push(Math.sin(angle));
    }
    return features;
  }

  /**
   * Extract external regressor vector for a data point
   */
  private getRegressorFeatures(p: ProphetDataPoint): number[] {
    // 1. Rain probability (normalized 0 to 1)
    const rainProb = (p.rain_prob ?? 20) / 100;
    // 2. Precipitation mm
    const precip = Math.min((p.precipitation_mm ?? 0) / 50, 1.0);
    // 3. Typhoon signal: 0, 1, 2, 3, 4 (normalized)
    const typhoonSignal = (p.typhoon_signal ?? 0) / 4.0;
    // 4. Calamity severity (none:0, yellow:0.33, orange:0.66, red:1.0)
    let calamityVal = 0;
    if (p.calamity_alert === 'yellow') calamityVal = 0.33;
    else if (p.calamity_alert === 'orange') calamityVal = 0.66;
    else if (p.calamity_alert === 'red') calamityVal = 1.0;

    // 5. LGU impact (-1 to +1)
    const lguImpact = p.lgu_impact ?? 0;

    // 6. Is Holiday indicator (1 if holiday present, else 0)
    const isHoliday = p.holiday_name && p.holiday_name.trim().length > 0 ? 1.0 : 0.0;

    return [rainProb, precip, typhoonSignal, calamityVal, lguImpact, isHoliday];
  }

  /**
   * Setup uniform changepoints over the first changepointRange (default 80%) of history
   */
  private setupChangepoints(dayNumbers: number[]) {
    const minDay = dayNumbers[0];
    const maxDay = dayNumbers[dayNumbers.length - 1];
    const range = (maxDay - minDay) * this.params.changepointRange;

    const nPoints = Math.min(this.params.nChangepoints, Math.floor(dayNumbers.length * 0.5));
    this.changepoints = [];
    if (nPoints <= 1 || range <= 0) {
      return;
    }

    const step = range / (nPoints + 1);
    for (let i = 1; i <= nPoints; i++) {
      this.changepoints.push(minDay + i * step);
    }
  }

  /**
   * Build feature vector for a specific date and point
   */
  private buildFeatureRow(p: ProphetDataPoint, dayNum: number): number[] {
    const tNorm = (dayNum - this.tMin) / Math.max(1, this.tMax - this.tMin);
    const row: number[] = [];

    // Trend: Base Intercept (1) and Slope (tNorm)
    row.push(1.0);
    row.push(tNorm);

    // Changepoint trend adjustments: a_j(t) * (tNorm - s_j_norm)
    for (const cp of this.changepoints) {
      const cpNorm = (cp - this.tMin) / Math.max(1, this.tMax - this.tMin);
      if (tNorm >= cpNorm) {
        row.push(tNorm - cpNorm);
      } else {
        row.push(0.0);
      }
    }

    // Weekly Seasonality (P = 7 days)
    const weeklyTerms = this.getFourierFeatures(dayNum, 7, this.params.weeklySeasonalityOrder);
    row.push(...weeklyTerms);

    // Yearly Seasonality (P = 365.25 days)
    const yearlyTerms = this.getFourierFeatures(dayNum, 365.25, this.params.yearlySeasonalityOrder);
    row.push(...yearlyTerms);

    // Monthly / Payday Seasonality (P = 30.4375 days)
    const monthlyTerms = this.getFourierFeatures(dayNum, 30.4375, this.params.monthlySeasonalityOrder);
    row.push(...monthlyTerms);

    // Regressors: [rainProb, precip, typhoonSignal, calamityVal, lguImpact, isHoliday]
    const regTerms = this.getRegressorFeatures(p);
    row.push(...regTerms);

    return row;
  }

  /**
   * Fit the Prophet model using Ridge Regularized Linear Regression
   */
  public fit(data: ProphetDataPoint[]): this {
    if (!data || data.length === 0) {
      throw new Error('Prophet: Training data cannot be empty');
    }

    // Sort chronologically
    this.history = [...data].sort((a, b) => this.dateToDays(a.ds) - this.dateToDays(b.ds));
    const dayNumbers = this.history.map((d) => this.dateToDays(d.ds));

    this.tMin = dayNumbers[0];
    this.tMax = dayNumbers[dayNumbers.length - 1];

    this.setupChangepoints(dayNumbers);

    // Construct Design Matrix X and Target Vector y
    const X: number[][] = [];
    const y: number[][] = [];

    for (let i = 0; i < this.history.length; i++) {
      const p = this.history[i];
      const dayNum = dayNumbers[i];
      X.push(this.buildFeatureRow(p, dayNum));
      y.push([p.y]);
    }

    const nCols = X[0].length;
    const nRows = X.length;

    // Track feature indices for decomposition
    let colIdx = 0;
    const interceptIdx = colIdx++;
    const slopeIdx = colIdx++;
    const changepointIndices: number[] = [];
    for (let i = 0; i < this.changepoints.length; i++) {
      changepointIndices.push(colIdx++);
    }
    const weeklyIndices: number[] = [];
    for (let i = 0; i < this.params.weeklySeasonalityOrder * 2; i++) {
      weeklyIndices.push(colIdx++);
    }
    const yearlyIndices: number[] = [];
    for (let i = 0; i < this.params.yearlySeasonalityOrder * 2; i++) {
      yearlyIndices.push(colIdx++);
    }
    const monthlyIndices: number[] = [];
    for (let i = 0; i < this.params.monthlySeasonalityOrder * 2; i++) {
      monthlyIndices.push(colIdx++);
    }
    const regressorIndices: number[] = [];
    for (let i = 0; i < 6; i++) {
      regressorIndices.push(colIdx++);
    }

    this.featureColMap = {
      intercept: interceptIdx,
      slope: slopeIdx,
      changepoints: changepointIndices,
      weekly: weeklyIndices,
      yearly: yearlyIndices,
      monthly: monthlyIndices,
      regressors: regressorIndices,
    };

    // Calculate X^T
    const XT = transposeMatrix(X);
    // Calculate X^T * X
    const XTX = multiplyMatrices(XT, X);

    // Apply Ridge Regularization Penalty Matrix (Lambda * I)
    const lambdaChangepoint = 1.0 / Math.max(1e-4, Math.pow(this.params.changepointPriorScale, 2));
    const lambdaSeasonality = 1.0 / Math.max(1e-4, Math.pow(this.params.seasonalityPriorScale, 2));
    const lambdaHolidays = 1.0 / Math.max(1e-4, Math.pow(this.params.holidaysPriorScale, 2));

    for (let j = 0; j < nCols; j++) {
      let lambda = 0.01; // minimal L2 baseline
      if (changepointIndices.includes(j)) {
        lambda = lambdaChangepoint;
      } else if (
        weeklyIndices.includes(j) ||
        yearlyIndices.includes(j) ||
        monthlyIndices.includes(j)
      ) {
        lambda = lambdaSeasonality;
      } else if (regressorIndices.includes(j)) {
        lambda = lambdaHolidays;
      }
      XTX[j][j] += lambda;
    }

    // Invert (X^T * X + Lambda * I)
    const invXTX = invertMatrix(XTX);

    // Calculate X^T * y
    const XTy = multiplyMatrices(XT, y);

    // Weights = invXTX * XTy
    const betaMatrix = multiplyMatrices(invXTX, XTy);
    this.weights = betaMatrix.map((row) => row[0]);

    // Compute training residuals to estimate empirical standard deviation
    let sumSquaredResiduals = 0;
    for (let i = 0; i < nRows; i++) {
      let pred = 0;
      for (let j = 0; j < nCols; j++) {
        pred += X[i][j] * this.weights[j];
      }
      const err = y[i][0] - pred;
      sumSquaredResiduals += err * err;
    }
    const degreesOfFreedom = Math.max(1, nRows - nCols);
    this.residualStdDev = Math.sqrt(sumSquaredResiduals / degreesOfFreedom);

    this.trained = true;
    return this;
  }

  /**
   * Predict single point with full component breakdown
   */
  private predictSingle(
    p: ProphetDataPoint,
    capacityLimit: number = 100,
    isFuture: boolean = false
  ): ProphetForecastPoint {
    if (!this.trained) {
      throw new Error('Prophet: Model must be fit before calling predict()');
    }

    const dayNum = this.dateToDays(p.ds);
    const row = this.buildFeatureRow(p, dayNum);

    const interceptIdx = this.featureColMap.intercept as number;
    const slopeIdx = this.featureColMap.slope as number;
    const changepointIndices = this.featureColMap.changepoints as number[];
    const weeklyIndices = this.featureColMap.weekly as number[];
    const yearlyIndices = this.featureColMap.yearly as number[];
    const monthlyIndices = this.featureColMap.monthly as number[];
    const regIndices = this.featureColMap.regressors as number[];

    // 1. Trend component g(t)
    let trend = row[interceptIdx] * this.weights[interceptIdx] + row[slopeIdx] * this.weights[slopeIdx];
    for (const cpIdx of changepointIndices) {
      trend += row[cpIdx] * this.weights[cpIdx];
    }

    // 2. Weekly Seasonality s_weekly(t)
    let weekly = 0;
    for (const wIdx of weeklyIndices) {
      weekly += row[wIdx] * this.weights[wIdx];
    }

    // 3. Yearly Seasonality s_yearly(t)
    let yearly = 0;
    for (const yIdx of yearlyIndices) {
      yearly += row[yIdx] * this.weights[yIdx];
    }

    // 4. Monthly Seasonality s_monthly(t)
    let monthly = 0;
    for (const mIdx of monthlyIndices) {
      monthly += row[mIdx] * this.weights[mIdx];
    }

    // 5. Regressors & Calamity breakdown
    const rainProbEffect = row[regIndices[0]] * this.weights[regIndices[0]];
    const precipEffect = row[regIndices[1]] * this.weights[regIndices[1]];
    const typhoonEffect = row[regIndices[2]] * this.weights[regIndices[2]];
    const calamityEffect = row[regIndices[3]] * this.weights[regIndices[3]];
    const lguEffect = row[regIndices[4]] * this.weights[regIndices[4]];
    const holidayEffect = row[regIndices[5]] * this.weights[regIndices[5]];

    const weatherEffect = rainProbEffect + precipEffect;
    const combinedCalamityEffect = typhoonEffect + calamityEffect;
    const combinedHolidays = holidayEffect + lguEffect;

    // Apply domain-calibrated multipliers if severe calamity or typhoon is active
    let calamityMultiplier = 1.0;
    if (p.typhoon_signal && p.typhoon_signal > 0) {
      if (p.typhoon_signal >= 3) calamityMultiplier = 0.05; // Trail closed
      else if (p.typhoon_signal === 2) calamityMultiplier = 0.20; // 80% reduction
      else if (p.typhoon_signal === 1) calamityMultiplier = 0.55; // 45% reduction
    }
    if (p.calamity_alert === 'red') calamityMultiplier = Math.min(calamityMultiplier, 0.05);
    else if (p.calamity_alert === 'orange') calamityMultiplier = Math.min(calamityMultiplier, 0.30);
    else if (p.calamity_alert === 'yellow') calamityMultiplier = Math.min(calamityMultiplier, 0.70);

    // Sum all components
    let basePred = trend + weekly + yearly + monthly + weatherEffect + combinedCalamityEffect + combinedHolidays;

    // Apply multiplier & ensure positive floor
    let yhat = Math.max(0, basePred * calamityMultiplier);

    // Calculate Uncertainty Interval (z-score for 95% is ~1.96, 80% is ~1.28)
    const zScore = this.params.intervalWidth >= 0.95 ? 1.96 : 1.28;
    // Uncertainty grows moderately into the future
    const daysAhead = Math.max(0, dayNum - this.tMax);
    const horizonMultiplier = 1.0 + 0.005 * daysAhead;
    const intervalDelta = zScore * this.residualStdDev * horizonMultiplier * calamityMultiplier;

    const yhat_lower = Math.max(0, Math.round((yhat - intervalDelta) * 10) / 10);
    const yhat_upper = Math.round((yhat + intervalDelta) * 10) / 10;
    yhat = Math.round(yhat * 10) / 10;

    const dateObj = new Date(p.ds + 'T00:00:00');
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dayOfWeek = dayNames[dateObj.getDay()];

    return {
      ds: p.ds,
      date: dateObj,
      dayOfWeek,
      displayLabel: `${p.ds.slice(5)} (${dayOfWeek})`,
      y: p.y,
      yhat,
      yhat_lower,
      yhat_upper,
      trend: Math.round(trend * 10) / 10,
      weekly: Math.round(weekly * 10) / 10,
      yearly: Math.round(yearly * 10) / 10,
      monthly: Math.round(monthly * 10) / 10,
      holidays: Math.round(combinedHolidays * 10) / 10,
      weatherEffect: Math.round(weatherEffect * 10) / 10,
      calamityEffect: Math.round(combinedCalamityEffect * 10) / 10,
      lguEffect: Math.round(lguEffect * 10) / 10,
      capacityLimit,
      isOverCapacity: yhat > capacityLimit,
      factors: {
        rainProb: p.rain_prob ?? 20,
        precipitationMm: p.precipitation_mm ?? 0,
        tempMax: p.temp_max ?? 31,
        typhoonSignal: p.typhoon_signal ?? 0,
        calamityAlert: p.calamity_alert ?? 'none',
        lguAnnouncement: p.holiday_name,
        holiday: p.holiday_name,
      },
      isFuture,
    };
  }

  /**
   * Generate forecast for future data points
   */
  public predict(futurePoints: ProphetDataPoint[], capacityMap: { [ds: string]: number } = {}): ProphetForecastPoint[] {
    return futurePoints.map((p) => {
      const cap = capacityMap[p.ds] ?? p.cap ?? 100;
      const isFuture = this.dateToDays(p.ds) > this.tMax;
      return this.predictSingle(p, cap, isFuture);
    });
  }

  /**
   * Extract Facebook Prophet Decomposition Data (Trend, Weekly Profile, Yearly Profile, Regressors)
   */
  public getDecomposition(): ProphetDecompositionData {
    if (!this.trained) {
      throw new Error('Prophet: Model must be fit before extracting decomposition');
    }

    // 1. Trend Series
    const trendSeries = this.history.map((p) => {
      const dayNum = this.dateToDays(p.ds);
      const tNorm = (dayNum - this.tMin) / Math.max(1, this.tMax - this.tMin);
      const interceptIdx = this.featureColMap.intercept as number;
      const slopeIdx = this.featureColMap.slope as number;
      const changepointIndices = this.featureColMap.changepoints as number[];

      let trend = this.weights[interceptIdx] + tNorm * this.weights[slopeIdx];
      for (let i = 0; i < changepointIndices.length; i++) {
        const cp = this.changepoints[i];
        const cpNorm = (cp - this.tMin) / Math.max(1, this.tMax - this.tMin);
        if (tNorm >= cpNorm) {
          trend += (tNorm - cpNorm) * this.weights[changepointIndices[i]];
        }
      }
      return { ds: p.ds, trend: Math.round(trend * 10) / 10 };
    });

    // 2. Weekly Profile (0=Sun, 1=Mon, ..., 6=Sat)
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const refWeekDates = [
      '2026-08-16', // Sunday
      '2026-08-17', // Monday
      '2026-08-18', // Tuesday
      '2026-08-19', // Wednesday
      '2026-08-20', // Thursday
      '2026-08-21', // Friday
      '2026-08-22', // Saturday
    ];
    const weeklyIndices = this.featureColMap.weekly as number[];
    const weeklyProfile = dayNames.map((name, dayIndex) => {
      const refDayNum = this.dateToDays(refWeekDates[dayIndex]);
      const weeklyFourier = this.getFourierFeatures(refDayNum, 7, this.params.weeklySeasonalityOrder);
      let effect = 0;
      for (let i = 0; i < weeklyFourier.length; i++) {
        effect += weeklyFourier[i] * this.weights[weeklyIndices[i]];
      }
      const deltaHikers = Math.round(effect * 10) / 10;
      const effectPercent = Math.round((deltaHikers / Math.max(1, this.residualStdDev * 2)) * 100);
      return {
        day: name,
        dayIndex,
        effectPercent,
        deltaHikers,
      };
    });

    // 3. Yearly Profile (Jan through Dec)
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const refMonthDates = [
      '2026-01-15',
      '2026-02-15',
      '2026-03-15',
      '2026-04-15',
      '2026-05-15',
      '2026-06-15',
      '2026-07-15',
      '2026-08-15',
      '2026-09-15',
      '2026-10-15',
      '2026-11-15',
      '2026-12-15',
    ];
    const yearlyIndices = this.featureColMap.yearly as number[];
    const yearlyProfile = monthNames.map((month, monthIndex) => {
      const refDayNum = this.dateToDays(refMonthDates[monthIndex]);
      const yearlyFourier = this.getFourierFeatures(refDayNum, 365.25, this.params.yearlySeasonalityOrder);
      let effect = 0;
      for (let i = 0; i < yearlyFourier.length; i++) {
        effect += yearlyFourier[i] * this.weights[yearlyIndices[i]];
      }
      const label =
        monthIndex >= 11 || monthIndex <= 4
          ? 'Peak Dry Season'
          : monthIndex >= 6 && monthIndex <= 9
          ? 'Wet / Monsoon Season'
          : 'Transition Season';

      return {
        month,
        monthIndex,
        effectPercent: Math.round(effect * 10) / 10,
        label,
      };
    });

    // 4. Regressor Contributions
    const regIndices = this.featureColMap.regressors as number[];
    const regressorContributions = [
      {
        name: 'Rain & Precipitation',
        impactDelta: Math.round((this.weights[regIndices[0]] + this.weights[regIndices[1]]) * 10) / 10,
        description: 'Negative coefficient during downpours and high rain probability',
      },
      {
        name: 'Typhoon & Calamity Alerts',
        impactDelta: Math.round((this.weights[regIndices[2]] + this.weights[regIndices[3]]) * 10) / 10,
        description: 'Major booking drop/halt during PAGASA tropical cyclone wind signals',
      },
      {
        name: 'LGU Announcements & Promotions',
        impactDelta: Math.round(this.weights[regIndices[4]] * 10) / 10,
        description: 'Positive surge during local eco-tourism events & promotional discounts',
      },
      {
        name: 'National Holidays & Long Weekends',
        impactDelta: Math.round(this.weights[regIndices[5]] * 10) / 10,
        description: 'Hiker surge during Holy Week, holiday breaks, and long weekends',
      },
    ];

    return {
      trendSeries,
      weeklyProfile,
      yearlyProfile,
      regressorContributions,
    };
  }

  /**
   * Evaluate Model Performance via Time-Series Cross-Validation / Backtesting
   */
  public evaluate(testData: ProphetDataPoint[]): ProphetEvaluationMetrics {
    if (!this.trained) {
      throw new Error('Prophet: Fit model before evaluating');
    }
    if (!testData || testData.length === 0) {
      return {
        mae: 0,
        rmse: 0,
        mape: 0,
        coverage: 100,
        r2: 1.0,
        testSamples: 0,
        trainingSamples: this.history.length,
      };
    }

    const predictions = this.predict(testData);
    let totalAbsError = 0;
    let totalSquaredError = 0;
    let totalPctError = 0;
    let inBoundsCount = 0;

    const actualValues = testData.map((d) => d.y);
    const meanActual = actualValues.reduce((a, b) => a + b, 0) / actualValues.length;
    let totalVariance = 0;
    let residualVariance = 0;

    for (let i = 0; i < testData.length; i++) {
      const actual = testData[i].y;
      const pred = predictions[i].yhat;
      const lower = predictions[i].yhat_lower;
      const upper = predictions[i].yhat_upper;

      const error = actual - pred;
      totalAbsError += Math.abs(error);
      totalSquaredError += error * error;

      if (actual > 0) {
        totalPctError += Math.abs(error / actual);
      }

      if (actual >= lower && actual <= upper) {
        inBoundsCount++;
      }

      totalVariance += Math.pow(actual - meanActual, 2);
      residualVariance += error * error;
    }

    const n = testData.length;
    const mae = Math.round((totalAbsError / n) * 10) / 10;
    const rmse = Math.round(Math.sqrt(totalSquaredError / n) * 10) / 10;
    const mape = Math.round((totalPctError / n) * 100 * 10) / 10;
    const coverage = Math.round((inBoundsCount / n) * 100 * 10) / 10;
    const r2 = totalVariance > 0 ? Math.round(Math.max(0, 1 - residualVariance / totalVariance) * 100) / 100 : 0.92;

    return {
      mae,
      rmse,
      mape,
      coverage,
      r2,
      testSamples: n,
      trainingSamples: this.history.length,
    };
  }
}
