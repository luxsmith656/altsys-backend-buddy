import { describe, it, expect } from 'vitest';
import { FacebookProphetEngine } from '../lib/ml/prophetEngine';
import { generateSyntheticBaseline } from '../lib/ml/prophetDataService';
import { ProphetDataPoint } from '../lib/ml/prophetTypes';

describe('Facebook Prophet Mathematical Forecasting Engine', () => {
  it('should initialize and fit training dataset without errors', () => {
    const data = generateSyntheticBaseline('2025-01-01', '2025-12-31', 40);
    expect(data.length).toBeGreaterThanOrEqual(365);

    const engine = new FacebookProphetEngine({
      growth: 'linear',
      nChangepoints: 15,
      intervalWidth: 0.95,
    });

    expect(() => engine.fit(data)).not.toThrow();
  });

  it('should generate future forecast points with valid confidence intervals', () => {
    const data = generateSyntheticBaseline('2025-01-01', '2025-06-30', 50);
    const engine = new FacebookProphetEngine();
    engine.fit(data);

    const futurePoints: ProphetDataPoint[] = [
      { ds: '2025-07-01', y: 0, rain_prob: 20, typhoon_signal: 0 },
      { ds: '2025-07-02', y: 0, rain_prob: 40, typhoon_signal: 0 },
      { ds: '2025-07-05', y: 0, rain_prob: 10, typhoon_signal: 0 }, // Saturday
      { ds: '2025-07-06', y: 0, rain_prob: 10, typhoon_signal: 0 }, // Sunday
    ];

    const forecast = engine.predict(futurePoints);
    expect(forecast.length).toBe(4);

    forecast.forEach((pt) => {
      expect(pt.yhat).toBeGreaterThanOrEqual(0);
      expect(pt.yhat_lower).toBeLessThanOrEqual(pt.yhat);
      expect(pt.yhat_upper).toBeGreaterThanOrEqual(pt.yhat);
      expect(typeof pt.trend).toBe('number');
      expect(typeof pt.weekly).toBe('number');
      expect(typeof pt.yearly).toBe('number');
    });

    // Saturday and Sunday should show weekend surge higher than Wednesday
    const sat = forecast.find((p) => p.ds === '2025-07-05')!;
    const wed = forecast.find((p) => p.ds === '2025-07-02')!;
    expect(sat.yhat).toBeGreaterThan(wed.yhat);
  });

  it('should dampen predictions when a severe Typhoon Signal or Calamity is active', () => {
    const data = generateSyntheticBaseline('2025-01-01', '2025-06-30', 50);
    const engine = new FacebookProphetEngine();
    engine.fit(data);

    const clearDay: ProphetDataPoint = {
      ds: '2025-07-05', // Saturday
      y: 0,
      rain_prob: 10,
      typhoon_signal: 0,
      calamity_alert: 'none',
    };

    const typhoonDay: ProphetDataPoint = {
      ds: '2025-07-05', // Same Saturday
      y: 0,
      rain_prob: 95,
      precipitation_mm: 80,
      typhoon_signal: 3, // Severe Typhoon Signal #3
      calamity_alert: 'red',
    };

    const [clearForecast] = engine.predict([clearDay]);
    const [typhoonForecast] = engine.predict([typhoonDay]);

    expect(typhoonForecast.yhat).toBeLessThan(clearForecast.yhat * 0.3);
  });

  it('should extract decomposition profiles (trend, weekly, yearly, regressors)', () => {
    const data = generateSyntheticBaseline('2025-01-01', '2025-12-31', 40);
    const engine = new FacebookProphetEngine();
    engine.fit(data);

    const decomp = engine.getDecomposition();
    expect(decomp.trendSeries.length).toBe(data.length);
    expect(decomp.weeklyProfile.length).toBe(7);
    expect(decomp.yearlyProfile.length).toBe(12);
    expect(decomp.regressorContributions.length).toBeGreaterThanOrEqual(4);

    // Saturday and Sunday in weeklyProfile should have positive delta
    const satProfile = decomp.weeklyProfile.find((w) => w.day === 'Saturday')!;
    const sunProfile = decomp.weeklyProfile.find((w) => w.day === 'Sunday')!;
    expect(satProfile.deltaHikers).toBeGreaterThan(0);
    expect(sunProfile.deltaHikers).toBeGreaterThan(0);
  });

  it('should compute backtesting evaluation metrics accurately', () => {
    const data = generateSyntheticBaseline('2025-01-01', '2025-12-31', 40);
    const trainData = data.slice(0, 300);
    const testData = data.slice(300);

    const engine = new FacebookProphetEngine();
    engine.fit(trainData);

    const metrics = engine.evaluate(testData);
    expect(metrics.mae).toBeGreaterThan(0);
    expect(metrics.rmse).toBeGreaterThan(0);
    expect(metrics.mape).toBeGreaterThan(0);
    expect(metrics.coverage).toBeGreaterThanOrEqual(50); // High percentage inside 95% CI
    expect(metrics.testSamples).toBe(testData.length);
  });
});
