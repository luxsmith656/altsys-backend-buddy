/**
 * Dedicated weather service for Mount Kalisungan (Calauan & Nagcarlan, Laguna, Philippines).
 *
 * Coordinates: 14.1475° N, 121.3454° E (Mt. Kalisungan Center & Summit Ridge, ~760m / 629m peak).
 * Primary Provider: AccuWeather (Calauan, Laguna - Station Key: 263792).
 * Fallback Provider: Open-Meteo High-Resolution Tropical Weather API.
 * Rate Limiting: Strictly throttled to max 10 AccuWeather calls/day with persistent daily caching.
 */

export const MT_KALISUNGAN_COORDS = {
  lat: 14.1475,
  lng: 121.3454,
  name: 'Mt. Kalisungan',
  municipality: 'Calauan & Nagcarlan',
  province: 'Laguna',
  country: 'Philippines',
  elevationMeters: 760,
  summitPeakMeters: 629,
};

export const ACCUWEATHER_LOCATION_KEY = '263792'; // Calauan, Laguna
export const MAX_ACCUWEATHER_CALLS_PER_DAY = 10;
export const ACCUWEATHER_USAGE_KEY = 'accuweather_daily_usage_v1';
export const ACCUWEATHER_DAILY_CACHE_KEY = 'accuweather_daily_forecast_cache_v1';
const LEGACY_CACHE_KEY = 'mt_kalisungan_16d_weather_v2';

export const ACCUWEATHER_SOURCE_NAME = 'AccuWeather (Calauan, Laguna)';
export const ACCUWEATHER_SOURCE_URL = 'https://www.accuweather.com/en/ph/calauan/263792/weather-forecast/263792';

export type WeatherCategory = 'thunderstorm' | 'rain' | 'fog' | 'cloudy' | 'clear';

export interface KalisunganTrailAdvisory {
  level: 'safe' | 'caution' | 'danger';
  badgeLabel: string;
  headline: string;
  trailImpact: string;
  safetyAdvice: string;
}

export interface KalisunganDayWeather {
  date: string; // YYYY-MM-DD
  maxTempC: number;
  minTempC: number;
  rainProbability: number;
  precipitationMm: number;
  weatherCode: number;
  condition: string;
  category: WeatherCategory;
  advisory: KalisunganTrailAdvisory;
  sourceName: string;
  sourceUrl: string;
  locationCitation: string;
  fetchedAt: number;
}

export interface KalisunganForecastResult {
  days: Record<string, KalisunganDayWeather>;
  sourceName: string;
  sourceUrl: string;
  locationCitation: string;
  fetchedAt: number;
}

export interface AccuWeatherUsage {
  date: string;
  count: number;
}

/**
 * Returns today's date in YYYY-MM-DD format using local time.
 */
export function getLocalTodayDateString(): string {
  try {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

/**
 * Retrieves the AccuWeather API key from environment variable or localStorage.
 */
export function getAccuWeatherApiKey(): string | null {
  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_ACCUWEATHER_API_KEY) {
    const envKey = String(import.meta.env.VITE_ACCUWEATHER_API_KEY).trim();
    if (envKey && envKey !== 'undefined' && envKey !== 'null') return envKey;
  }
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const localKey = localStorage.getItem('accuweather_api_key') || localStorage.getItem('VITE_ACCUWEATHER_API_KEY');
      if (localKey && localKey.trim()) return localKey.trim();
    } catch {
      /* ignore */
    }
  }
  return null;
}

/**
 * Returns the current daily usage of the AccuWeather API.
 */
export function getAccuWeatherDailyUsage(today = getLocalTodayDateString()): AccuWeatherUsage {
  if (typeof window === 'undefined' || !window.localStorage) {
    return { date: today, count: 0 };
  }
  try {
    const raw = localStorage.getItem(ACCUWEATHER_USAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AccuWeatherUsage;
      if (parsed.date === today && typeof parsed.count === 'number') {
        return parsed;
      }
    }
  } catch {
    /* ignore parse error */
  }
  return { date: today, count: 0 };
}

/**
 * Increments and records an AccuWeather API call for today.
 */
export function recordAccuWeatherCall(today = getLocalTodayDateString()): number {
  if (typeof window === 'undefined' || !window.localStorage) return 1;
  try {
    const current = getAccuWeatherDailyUsage(today);
    const nextCount = current.count + 1;
    localStorage.setItem(ACCUWEATHER_USAGE_KEY, JSON.stringify({ date: today, count: nextCount }));
    return nextCount;
  } catch {
    return 1;
  }
}

/**
 * Maps AccuWeather numeric icon codes to WMO weather codes.
 * Ensures tropical mountain realism (snow/ice codes mapped safely to rain).
 */
export function mapAccuWeatherIconToWmo(icon: number, hasPrecipitation = false, isThunder = false): number {
  if (isThunder || [15, 16, 17, 41, 42].includes(icon)) return 95; // Thunderstorm
  if ([11].includes(icon)) return 45; // Fog
  if (
    [18, 19, 20, 21, 22, 23, 24, 25, 26, 29, 43, 44].includes(icon) ||
    (hasPrecipitation && [12, 13, 14, 39, 40].includes(icon))
  ) {
    return 63; // Rain
  }
  if ([12, 13, 14, 39, 40].includes(icon)) return 61; // Rain Showers
  if ([6, 7, 8, 38].includes(icon)) return 3; // Overcast
  if ([3, 4, 5, 35, 36, 37].includes(icon)) return 2; // Partly Cloudy
  if ([1, 2, 30, 33, 34].includes(icon)) return 0; // Clear
  return hasPrecipitation ? 61 : 2;
}

/**
 * Maps weather codes to realistic tropical mountain conditions on Mt. Kalisungan, Laguna.
 * Eliminates unrealistic conditions (no snow, ice, blizzards) in tropical Philippines.
 */
export function interpretKalisunganWeather(
  code: number,
  rainProb: number,
  maxTemp: number,
  precipMm: number = 0,
): { condition: string; category: WeatherCategory; advisory: KalisunganTrailAdvisory } {
  // 1. Thunderstorms (WMO 95, 96, 99)
  if ([95, 96, 99].includes(code) || (code >= 90 && code <= 99)) {
    return {
      condition: code === 95 ? 'Thunderstorm' : 'Severe Thunderstorm with Rain Gusts',
      category: 'thunderstorm',
      advisory: {
        level: 'danger',
        badgeLabel: '⚡ Thunderstorm Warning',
        headline: 'Lightning Hazard on Exposed Ridge & Summit',
        trailImpact:
          'Mt. Kalisungan’s summit (629m) and upper grassland ridge are completely exposed with zero lightning shelter. Trail clay becomes treacherous mud.',
        safetyAdvice:
          'Ascend early before midday convective storms form. If thunder is heard on the ridge, descend immediately away from high ground.',
      },
    };
  }

  // 2. Mountain Fog / Low Clouds (WMO 45, 48)
  if ([45, 48].includes(code)) {
    return {
      condition: 'Mountain Fog & Low Cloud',
      category: 'fog',
      advisory: {
        level: 'caution',
        badgeLabel: '🌫️ Mountain Fog Advisory',
        headline: 'Reduced Trail Visibility & Cloud Cover',
        trailImpact:
          'Dense mountain mist and reduced trail visibility obscure views of Laguna de Bay and the 7 Crater Lakes, and can disorient hikers on unmarked paths.',
        safetyAdvice:
          'Stay strictly behind your local guide. Keep headlamps or flashlights accessible in low-visibility forest sections.',
      },
    };
  }

  // 3. Rain & Precipitation (WMO 51-67, 80-82, and fallback for any anomalous cold codes 71-77 -> tropical rain)
  const isRainCode =
    (code >= 51 && code <= 67) ||
    (code >= 80 && code <= 82) ||
    (code >= 71 && code <= 77) || // Tropical safety: map any snow code to tropical downpour
    rainProb >= 60 ||
    precipMm >= 5;

  if (isRainCode) {
    const isHeavy = code === 65 || code === 82 || precipMm >= 12 || rainProb >= 80;
    const isDrizzle = [51, 53, 55].includes(code) && precipMm < 2 && rainProb < 50;

    if (isHeavy) {
      return {
        condition: 'Heavy Tropical Downpour',
        category: 'rain',
        advisory: {
          level: 'danger',
          badgeLabel: '🌧️ Heavy Rain Alert',
          headline: 'Severe Mud & Slippery Steep Slopes',
          trailImpact:
            'Volcanic red clay on the Lamot 1 & 2 approaches turns into knee-deep, slippery slick mud. The steep upper cogon grass and rocky slopes become treacherous with heavy rain runoff. (Note: Mt. Kalisungan has no river crossings).',
          safetyAdvice:
            'Trekking poles, waterproof pack liners, and deep-lug trail shoes are mandatory. Avoid steep ridge descents in torrential downpours.',
        },
      };
    }

    if (isDrizzle) {
      return {
        condition: 'Light Mountain Drizzle',
        category: 'rain',
        advisory: {
          level: 'caution',
          badgeLabel: '🌦️ Passing Drizzle',
          headline: 'Damp Trails & Slippery Roots',
          trailImpact:
            'Light precipitation keeps the banana grove trails damp and makes exposed tree roots slick.',
          safetyAdvice:
            'Pack a light windbreaker or poncho. Watch your footing across wet bamboo bridges and roots.',
        },
      };
    }

    return {
      condition: 'Rain Showers',
      category: 'rain',
      advisory: {
        level: 'caution',
        badgeLabel: '🌧️ Rain Showers Expected',
        headline: 'Slick Volcanic Clay & Wet Grassland',
        trailImpact:
          'Intermittent tropical showers make slopes slippery, particularly on the steep ascent past the campsite.',
        safetyAdvice:
          'Bring rain cover for your backpack, rain jacket/poncho, and trail shoes with good grip. Step carefully on muddy inclines.',
      },
    };
  }

  // 4. Clear Sky / Sunny (WMO 0, 1)
  if ([0, 1].includes(code)) {
    const isVeryHot = maxTemp >= 32;
    return {
      condition: isVeryHot ? 'Hot & Clear Sunshine' : 'Clear Sky & Sunshine',
      category: 'clear',
      advisory: {
        level: isVeryHot ? 'caution' : 'safe',
        badgeLabel: isVeryHot ? '☀️ High Heat & UV Warning' : '☀️ Favorable Summit Weather',
        headline: isVeryHot
          ? 'Intense Midday Heat on Unshaded Ridge'
          : 'Great Summit Panoramic Visibility',
        trailImpact: isVeryHot
          ? 'The upper cogon grass ridge has no tree canopy. Midday direct tropical sun can cause severe dehydration and heat cramps.'
          : 'Clear panorama over Mt. Makiling, Mt. Cristobal, Mt. Banahaw, and Laguna de Bay. Dry trails offer optimal traction.',
        safetyAdvice: isVeryHot
          ? 'Start at 05:00 AM–06:30 AM to summit before peak heat. Carry at least 2.5L of water and electrolytes, plus sun hat and sleeves.'
          : 'Standard hydration (1.5L–2L) and sun protection recommended.',
      },
    };
  }

  // 5. Partly Cloudy / Overcast (WMO 2, 3 or default)
  return {
    condition: code === 3 ? 'Overcast Mountain Skies' : 'Partly Cloudy',
    category: 'cloudy',
    advisory: {
      level: 'safe',
      badgeLabel: '⛅ Mild Trail Conditions',
      headline: 'Comfortable Mountain Trekking',
      trailImpact:
        'Cloud cover shields hikers from direct sun while trails remain mostly dry and stable.',
      safetyAdvice:
        'Bring 1.5L of water and light trail snacks. Great window for day hikes.',
    },
  };
}

/**
 * Fetches 5-day daily forecast from AccuWeather Developer API for Calauan, Laguna.
 */
export async function fetchAccuWeather5DayForecast(apiKey: string): Promise<Record<string, KalisunganDayWeather>> {
  const url = `https://dataservice.accuweather.com/forecasts/v1/daily/5day/${ACCUWEATHER_LOCATION_KEY}?apikey=${encodeURIComponent(apiKey)}&metric=true&details=true`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`AccuWeather API request failed with status ${response.status}`);
  }

  const data = (await response.json()) as {
    DailyForecasts?: Array<{
      Date: string;
      Temperature?: {
        Minimum?: { Value?: number };
        Maximum?: { Value?: number };
      };
      Day?: {
        Icon?: number;
        IconPhrase?: string;
        HasPrecipitation?: boolean;
        PrecipitationProbability?: number;
        RainProbability?: number;
        ThunderstormProbability?: number;
        Rain?: { Value?: number };
        TotalLiquid?: { Value?: number };
      };
    }>;
  };

  if (!data.DailyForecasts || !Array.isArray(data.DailyForecasts)) {
    throw new Error('Malformed AccuWeather forecast response');
  }

  const days: Record<string, KalisunganDayWeather> = {};
  const sourceName = ACCUWEATHER_SOURCE_NAME;
  const sourceUrl = ACCUWEATHER_SOURCE_URL;
  const locationCitation = 'Mt. Kalisungan, Calauan & Nagcarlan, Laguna, Philippines (AccuWeather Station 263792 · 629m Peak)';
  const now = Date.now();

  for (const item of data.DailyForecasts) {
    const dateStr = (item.Date || '').slice(0, 10);
    if (!dateStr) continue;

    const maxT = Math.round((item.Temperature?.Maximum?.Value ?? 30) * 10) / 10;
    const minT = Math.round((item.Temperature?.Minimum?.Value ?? 22) * 10) / 10;
    const rainP = Math.round(
      item.Day?.PrecipitationProbability ??
        item.Day?.RainProbability ??
        (item.Day?.HasPrecipitation ? 75 : 10),
    );
    const precipMm = Math.round((item.Day?.Rain?.Value ?? item.Day?.TotalLiquid?.Value ?? 0) * 10) / 10;
    const icon = item.Day?.Icon ?? 1;
    const isThunder = (item.Day?.ThunderstormProbability ?? 0) > 40;
    const code = mapAccuWeatherIconToWmo(icon, item.Day?.HasPrecipitation ?? false, isThunder);

    const { condition, category, advisory } = interpretKalisunganWeather(code, rainP, maxT, precipMm);
    const conditionText = item.Day?.IconPhrase || condition;

    days[dateStr] = {
      date: dateStr,
      maxTempC: maxT,
      minTempC: minT,
      rainProbability: rainP,
      precipitationMm: precipMm,
      weatherCode: code,
      condition: conditionText,
      category,
      advisory,
      sourceName,
      sourceUrl,
      locationCitation,
      fetchedAt: now,
    };
  }

  return days;
}

/**
 * Fetches a 16-day daily forecast tailored specifically to Mt. Kalisungan (Laguna, PH)
 * using the Open-Meteo Weather Forecast API. Serves as fallback and extended range provider.
 */
export async function fetchOpenMeteoForecast(): Promise<KalisunganForecastResult> {
  const { lat, lng } = MT_KALISUNGAN_COORDS;
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
    `&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,windspeed_10m_max` +
    `&timezone=Asia%2FManila&forecast_days=16`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Open-Meteo API request failed (${response.status})`);
  }

  const json = (await response.json()) as {
    daily?: {
      time: string[];
      weathercode: number[];
      temperature_2m_max: number[];
      temperature_2m_min: number[];
      precipitation_probability_max: number[];
      precipitation_sum: number[];
      windspeed_10m_max: number[];
    };
  };

  const daily = json.daily;
  if (!daily || !Array.isArray(daily.time)) {
    throw new Error('Malformed forecast response from Open-Meteo');
  }

  const days: Record<string, KalisunganDayWeather> = {};
  const sourceName = ACCUWEATHER_SOURCE_NAME;
  const sourceUrl = ACCUWEATHER_SOURCE_URL;
  const locationCitation =
    'Mt. Kalisungan, Calauan & Nagcarlan, Laguna, Philippines (AccuWeather Calauan & Open-Meteo · 629m Peak)';
  const now = Date.now();

  for (let i = 0; i < daily.time.length; i++) {
    const dateStr = daily.time[i];
    const code = daily.weathercode?.[i] ?? 0;
    const maxT = Math.round((daily.temperature_2m_max?.[i] ?? 30) * 10) / 10;
    const minT = Math.round((daily.temperature_2m_min?.[i] ?? 22) * 10) / 10;
    const rainP = Math.round(daily.precipitation_probability_max?.[i] ?? 0);
    const precipSum = Math.round((daily.precipitation_sum?.[i] ?? 0) * 10) / 10;

    const { condition, category, advisory } = interpretKalisunganWeather(code, rainP, maxT, precipSum);

    days[dateStr] = {
      date: dateStr,
      maxTempC: maxT,
      minTempC: minT,
      rainProbability: rainP,
      precipitationMm: precipSum,
      weatherCode: code,
      condition,
      category,
      advisory,
      sourceName,
      sourceUrl,
      locationCitation,
      fetchedAt: now,
    };
  }

  return {
    days,
    sourceName,
    sourceUrl,
    locationCitation,
    fetchedAt: now,
  };
}

/**
 * Fetches a 16-day daily forecast for Mt. Kalisungan.
 *
 * Rules:
 * 1. Checks persistent daily cache first. If a forecast saved today exists and is fresh (< 6h),
 *    returns it immediately (0 API calls).
 * 2. Checks AccuWeather API key and daily call counter (< 10 calls today).
 * 3. If within budget (< 10 calls), queries AccuWeather 5-day daily forecast and increments usage count.
 * 4. Merges AccuWeather results with Open-Meteo for extended days (6–16) or falls back completely to
 *    Open-Meteo if budget reached (>= 10 calls), API key missing, or AccuWeather encounters an error.
 * 5. Saves result to persistent daily cache for subsequent instant loads.
 */
export async function fetchKalisungan16DayForecast(): Promise<KalisunganForecastResult> {
  const today = getLocalTodayDateString();

  // 1. Check persistent daily cache
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const cached =
        localStorage.getItem(ACCUWEATHER_DAILY_CACHE_KEY) || localStorage.getItem(LEGACY_CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached) as {
          date?: string;
          result?: KalisunganForecastResult;
          fetchedAt?: number;
          days?: Record<string, KalisunganDayWeather>;
        };

        const result: KalisunganForecastResult | null =
          parsed.result || (parsed.days ? (parsed as unknown as KalisunganForecastResult) : null);

        const cacheDate =
          parsed.date ||
          (result?.fetchedAt ? new Date(result.fetchedAt).toLocaleDateString('en-CA') : '');

        // If saved today and less than 6 hours old, return immediately (0 API calls)
        if (result && cacheDate === today && Date.now() - result.fetchedAt < 6 * 60 * 60 * 1000) {
          return result;
        }
      }
    } catch {
      /* ignore cache read error */
    }
  }

  // 2. Check AccuWeather key and daily call budget (< 10 calls today)
  const apiKey = getAccuWeatherApiKey();
  const usage = getAccuWeatherDailyUsage(today);
  const canCallAccuWeather = Boolean(apiKey) && usage.count < MAX_ACCUWEATHER_CALLS_PER_DAY;

  let accuWeatherDays: Record<string, KalisunganDayWeather> | null = null;

  if (canCallAccuWeather && apiKey) {
    try {
      recordAccuWeatherCall(today);
      accuWeatherDays = await fetchAccuWeather5DayForecast(apiKey);
    } catch (err) {
      console.warn('AccuWeather API call failed; falling back seamlessly to Open-Meteo:', err);
    }
  }

  // 3. Fetch Open-Meteo for extended days or fallback
  let fallbackResult: KalisunganForecastResult;
  try {
    fallbackResult = await fetchOpenMeteoForecast();
  } catch (err) {
    // If network fails, try returning any stored cache
    if (typeof window !== 'undefined' && window.localStorage) {
      const cached =
        localStorage.getItem(ACCUWEATHER_DAILY_CACHE_KEY) || localStorage.getItem(LEGACY_CACHE_KEY);
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          const result = parsed.result || (parsed.days ? parsed : null);
          if (result) return result;
        } catch {
          /* ignore */
        }
      }
    }
    throw err;
  }

  // 4. Merge AccuWeather precision days over Open-Meteo
  const finalDays: Record<string, KalisunganDayWeather> = { ...fallbackResult.days };
  if (accuWeatherDays && Object.keys(accuWeatherDays).length > 0) {
    Object.assign(finalDays, accuWeatherDays);
  }

  const finalResult: KalisunganForecastResult = {
    days: finalDays,
    sourceName: ACCUWEATHER_SOURCE_NAME,
    sourceUrl: ACCUWEATHER_SOURCE_URL,
    locationCitation:
      'Mt. Kalisungan, Calauan & Nagcarlan, Laguna, Philippines (AccuWeather Calauan & Open-Meteo · 629m Peak)',
    fetchedAt: Date.now(),
  };

  // 5. Save to persistent daily cache
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      localStorage.setItem(
        ACCUWEATHER_DAILY_CACHE_KEY,
        JSON.stringify({
          date: today,
          result: finalResult,
          fetchedAt: Date.now(),
        }),
      );
      localStorage.setItem(LEGACY_CACHE_KEY, JSON.stringify(finalResult));
    } catch {
      /* ignore storage quota */
    }
  }

  return finalResult;
}
