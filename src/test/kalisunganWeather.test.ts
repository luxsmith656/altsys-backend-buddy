import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  interpretKalisunganWeather,
  mapAccuWeatherIconToWmo,
  getAccuWeatherDailyUsage,
  recordAccuWeatherCall,
  fetchKalisungan16DayForecast,
  MT_KALISUNGAN_COORDS,
  ACCUWEATHER_LOCATION_KEY,
  MAX_ACCUWEATHER_CALLS_PER_DAY,
  ACCUWEATHER_USAGE_KEY,
  ACCUWEATHER_DAILY_CACHE_KEY,
  getLocalTodayDateString,
} from '@/lib/kalisunganWeather';

describe('Mt. Kalisungan Weather Service', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('correctly targets Mt. Kalisungan in Laguna, Philippines', () => {
    expect(MT_KALISUNGAN_COORDS.lat).toBeCloseTo(14.1475, 4);
    expect(MT_KALISUNGAN_COORDS.lng).toBeCloseTo(121.3454, 4);
    expect(MT_KALISUNGAN_COORDS.province).toBe('Laguna');
    expect(MT_KALISUNGAN_COORDS.country).toBe('Philippines');
    expect(MT_KALISUNGAN_COORDS.elevationMeters).toBe(760);
    expect(MT_KALISUNGAN_COORDS.summitPeakMeters).toBe(629);
    expect(ACCUWEATHER_LOCATION_KEY).toBe('263792');
    expect(MAX_ACCUWEATHER_CALLS_PER_DAY).toBe(10);
  });

  it('identifies thunderstorms and warns of lightning on the exposed summit and ridge', () => {
    const result = interpretKalisunganWeather(95, 80, 29, 15);
    expect(result.category).toBe('thunderstorm');
    expect(result.advisory.level).toBe('danger');
    expect(result.advisory.badgeLabel).toContain('Thunderstorm');
    expect(result.advisory.trailImpact).toContain('629m');
    expect(result.advisory.trailImpact.toLowerCase()).toContain('lightning');
    expect(result.advisory.safetyAdvice.toLowerCase()).toContain('descend');
  });

  it('identifies mountain fog and warns of obscured visibility', () => {
    const result = interpretKalisunganWeather(45, 10, 24, 0);
    expect(result.category).toBe('fog');
    expect(result.advisory.level).toBe('caution');
    expect(result.advisory.badgeLabel).toContain('Fog');
    expect(result.advisory.trailImpact.toLowerCase()).toContain('visibility');
    expect(result.advisory.safetyAdvice.toLowerCase()).toContain('guide');
  });

  it('identifies heavy rain and warns of slick volcanic clay on Lamot trails', () => {
    const result = interpretKalisunganWeather(65, 90, 26, 18);
    expect(result.category).toBe('rain');
    expect(result.condition).toContain('Heavy');
    expect(result.advisory.level).toBe('danger');
    expect(result.advisory.trailImpact.toLowerCase()).toContain('clay');
  });

  it('safely maps any anomalous snow codes to realistic tropical downpours in Laguna', () => {
    const result = interpretKalisunganWeather(71, 75, 27, 8);
    expect(result.category).toBe('rain');
    expect(result.condition.toLowerCase()).not.toContain('snow');
    expect(result.condition.toLowerCase()).toContain('rain');
  });

  it('flags high heat warning for clear days >= 32°C on unshaded cogon grass ridge', () => {
    const result = interpretKalisunganWeather(0, 5, 34, 0);
    expect(result.category).toBe('clear');
    expect(result.advisory.level).toBe('caution');
    expect(result.advisory.badgeLabel).toContain('High Heat');
    expect(result.advisory.safetyAdvice).toContain('05:00 AM');
    expect(result.advisory.safetyAdvice).toContain('2.5L');
  });

  it('marks mild cloudy mountain days as safe with standard hydration', () => {
    const result = interpretKalisunganWeather(2, 10, 27, 0);
    expect(result.category).toBe('cloudy');
    expect(result.advisory.level).toBe('safe');
    expect(result.advisory.badgeLabel).toContain('Mild');
  });

  it('maps AccuWeather icons to realistic tropical WMO codes', () => {
    // 15 = Thunderstorms
    expect(mapAccuWeatherIconToWmo(15)).toBe(95);
    // 11 = Fog
    expect(mapAccuWeatherIconToWmo(11)).toBe(45);
    // 18 = Rain
    expect(mapAccuWeatherIconToWmo(18)).toBe(63);
    // 22 = Snow (tropical safeguard maps to rain 63)
    expect(mapAccuWeatherIconToWmo(22)).toBe(63);
    // 1 = Sunny/Clear
    expect(mapAccuWeatherIconToWmo(1)).toBe(0);
    // 3 = Partly sunny
    expect(mapAccuWeatherIconToWmo(3)).toBe(2);
  });

  it('tracks AccuWeather daily usage per date and increments accurately', () => {
    const today = getLocalTodayDateString();
    expect(getAccuWeatherDailyUsage(today).count).toBe(0);

    const count1 = recordAccuWeatherCall(today);
    expect(count1).toBe(1);
    expect(getAccuWeatherDailyUsage(today).count).toBe(1);

    const count2 = recordAccuWeatherCall(today);
    expect(count2).toBe(2);
    expect(getAccuWeatherDailyUsage(today).count).toBe(2);

    // Old date should not bleed into a different date
    expect(getAccuWeatherDailyUsage('2025-01-01').count).toBe(0);
  });

  it('serves from persistent daily cache without calling fetch if already saved today', async () => {
    const today = getLocalTodayDateString();
    const mockCached = {
      days: {
        [today]: {
          date: today,
          maxTempC: 30,
          minTempC: 23,
          rainProbability: 20,
          precipitationMm: 0,
          weatherCode: 1,
          condition: 'Clear Sky & Sunshine',
          category: 'clear' as const,
          advisory: {
            level: 'safe' as const,
            badgeLabel: '☀️ Favorable Summit Weather',
            headline: 'Great Summit Panoramic Visibility',
            trailImpact: 'Optimal traction.',
            safetyAdvice: 'Standard hydration.',
          },
          sourceName: 'AccuWeather (Calauan, Laguna)',
          sourceUrl: 'https://www.accuweather.com/en/ph/calauan/263792/weather-forecast/263792',
          locationCitation: 'Mt. Kalisungan, Calauan, Laguna',
          fetchedAt: Date.now(),
        },
      },
      sourceName: 'AccuWeather (Calauan, Laguna)',
      sourceUrl: 'https://www.accuweather.com/en/ph/calauan/263792/weather-forecast/263792',
      locationCitation: 'Mt. Kalisungan, Calauan, Laguna',
      fetchedAt: Date.now(),
    };

    localStorage.setItem(
      ACCUWEATHER_DAILY_CACHE_KEY,
      JSON.stringify({
        date: today,
        result: mockCached,
        fetchedAt: Date.now(),
      }),
    );

    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const result = await fetchKalisungan16DayForecast();

    // Zero network calls made because today's cache is present!
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.sourceName).toContain('AccuWeather');
    expect(result.days[today].condition).toBe('Clear Sky & Sunshine');
  });

  it('falls back to Open-Meteo when daily limit (10 calls) is reached', async () => {
    const today = getLocalTodayDateString();
    localStorage.setItem('accuweather_api_key', 'test-key-123');
    // Set daily count to 10
    localStorage.setItem(ACCUWEATHER_USAGE_KEY, JSON.stringify({ date: today, count: 10 }));

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      // AccuWeather URL should NOT be called
      if (url.includes('dataservice.accuweather.com')) {
        throw new Error('Should not call AccuWeather when daily limit is reached');
      }
      // Open-Meteo mock response
      return {
        ok: true,
        json: async () => ({
          daily: {
            time: [today],
            weathercode: [0],
            temperature_2m_max: [29],
            temperature_2m_min: [22],
            precipitation_probability_max: [10],
            precipitation_sum: [0],
            windspeed_10m_max: [5],
          },
        }),
      } as Response;
    });

    const result = await fetchKalisungan16DayForecast();
    expect(fetchSpy).toHaveBeenCalled();
    // Daily count remains 10 and was not incremented
    expect(getAccuWeatherDailyUsage(today).count).toBe(10);
    expect(result.days[today]).toBeDefined();
    expect(result.sourceName).toBe('AccuWeather (Calauan, Laguna)');
  });

  it('seamlessly falls back to Open-Meteo when AccuWeather returns an API error', async () => {
    const today = getLocalTodayDateString();
    localStorage.setItem('accuweather_api_key', 'test-key-123');
    localStorage.setItem(ACCUWEATHER_USAGE_KEY, JSON.stringify({ date: today, count: 0 }));

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('dataservice.accuweather.com')) {
        // Simulate AccuWeather rate limit or error (429)
        return {
          ok: false,
          status: 429,
          statusText: 'Too Many Requests',
        } as Response;
      }
      // Open-Meteo fallback
      return {
        ok: true,
        json: async () => ({
          daily: {
            time: [today],
            weathercode: [2],
            temperature_2m_max: [28],
            temperature_2m_min: [22],
            precipitation_probability_max: [15],
            precipitation_sum: [0],
            windspeed_10m_max: [8],
          },
        }),
      } as Response;
    });

    const result = await fetchKalisungan16DayForecast();
    expect(result.days[today]).toBeDefined();
    expect(result.sourceName).toBe('AccuWeather (Calauan, Laguna)');
  });
});
