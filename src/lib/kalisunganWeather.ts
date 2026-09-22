/**
 * Dedicated weather service for Mount Kalisungan (Calauan & Nagcarlan, Laguna, Philippines).
 *
 * Coordinates: 14.1475° N, 121.3454° E (Mt. Kalisungan Center & Summit Ridge, ~760m / 629m peak).
 * Data Provider: Open-Meteo Weather Forecast API (WMO Weather Interpretation, Tropical High-Resolution).
 * API Citation: https://open-meteo.com/ (No key required, official open weather data).
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

/**
 * Maps WMO weather codes to realistic tropical mountain conditions on Mt. Kalisungan, Laguna.
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
          headline: 'Severe Mud & Swollen Stream Crossings',
          trailImpact:
            'Volcanic red clay on the Lamot 1 & 2 approaches turns into knee-deep, slippery slick mud. Lower stream crossings swell quickly.',
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

const CACHE_KEY = 'mt_kalisungan_16d_weather_v2';
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes cache

/**
 * Fetches a 16-day daily forecast tailored specifically to Mt. Kalisungan (Laguna, PH)
 * using the Open-Meteo Weather Forecast API.
 */
export async function fetchKalisungan16DayForecast(): Promise<KalisunganForecastResult> {
  // Check localStorage cache first
  if (typeof window !== 'undefined') {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached) as KalisunganForecastResult;
        if (Date.now() - parsed.fetchedAt < CACHE_TTL_MS) {
          return parsed;
        }
      }
    } catch {
      /* ignore cache read error */
    }
  }

  const { lat, lng } = MT_KALISUNGAN_COORDS;
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
    `&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,windspeed_10m_max` +
    `&timezone=Asia%2FManila&forecast_days=16`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Open-Meteo API request failed (${response.status})`);
  }

  const json = await response.json() as {
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
  const sourceName = 'Open-Meteo Weather Forecast API';
  const sourceUrl = 'https://open-meteo.com/';
  const locationCitation = 'Mt. Kalisungan, Calauan & Nagcarlan, Laguna, Philippines (14.1475° N, 121.3454° E, ~760m)';
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

  const result: KalisunganForecastResult = {
    days,
    sourceName,
    sourceUrl,
    locationCitation,
    fetchedAt: now,
  };

  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(result));
    } catch {
      /* ignore storage quota */
    }
  }

  return result;
}
