// Lightweight Open-Meteo weather + routing advice (no API key).
// Used by the Map page to gate trail recommendations and warn hikers.

export interface WeatherSnapshot {
  tempC: number;
  windKmh: number;
  precipMm: number;        // last hour precipitation
  precipNext6hMm: number;  // sum next 6h
  weatherCode: number;
  isDay: boolean;
  fetchedAt: number;
}

export interface RouteAdvice {
  level: 'go' | 'caution' | 'avoid';
  headline: string;
  reasons: string[];
}

const codeLabel = (c: number): string => {
  if (c === 0) return 'Clear sky';
  if ([1, 2, 3].includes(c)) return 'Partly cloudy';
  if ([45, 48].includes(c)) return 'Fog';
  if ([51, 53, 55].includes(c)) return 'Drizzle';
  if ([61, 63, 65].includes(c)) return 'Rain';
  if ([66, 67].includes(c)) return 'Freezing rain';
  if ([71, 73, 75, 77].includes(c)) return 'Snow';
  if ([80, 81, 82].includes(c)) return 'Rain showers';
  if ([95, 96, 99].includes(c)) return 'Thunderstorm';
  return 'Unknown';
};

export async function fetchWeather(lat: number, lng: number): Promise<WeatherSnapshot> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
    `&current=temperature_2m,is_day,precipitation,weather_code,wind_speed_10m` +
    `&hourly=precipitation&forecast_hours=6&wind_speed_unit=kmh`;
  const r = await fetch(url);
  if (!r.ok) throw new Error('weather fetch failed');
  const j = await r.json();
  const next6 = Array.isArray(j?.hourly?.precipitation)
    ? (j.hourly.precipitation as number[]).slice(0, 6).reduce((a, b) => a + (b ?? 0), 0)
    : 0;
  return {
    tempC: j.current?.temperature_2m ?? 0,
    windKmh: j.current?.wind_speed_10m ?? 0,
    precipMm: j.current?.precipitation ?? 0,
    precipNext6hMm: Math.round(next6 * 10) / 10,
    weatherCode: j.current?.weather_code ?? 0,
    isDay: !!j.current?.is_day,
    fetchedAt: Date.now(),
  };
}

export function adviseRoute(w: WeatherSnapshot): RouteAdvice {
  const reasons: string[] = [];
  let level: RouteAdvice['level'] = 'go';

  const thunder = [95, 96, 99].includes(w.weatherCode);
  if (thunder) { level = 'avoid'; reasons.push('Thunderstorm activity — exposed ridges are dangerous.'); }

  if (w.precipNext6hMm >= 10) { level = 'avoid'; reasons.push(`Heavy rain expected (${w.precipNext6hMm} mm in 6 h) — trail will be slippery, river crossings risky.`); }
  else if (w.precipNext6hMm >= 3) { level = level === 'avoid' ? 'avoid' : 'caution'; reasons.push(`Rain expected (${w.precipNext6hMm} mm in 6 h) — pack rain gear.`); }

  if (w.windKmh >= 50) { level = 'avoid'; reasons.push(`Strong winds (${Math.round(w.windKmh)} km/h) — avoid summit & ridge trails.`); }
  else if (w.windKmh >= 30) { level = level === 'avoid' ? 'avoid' : 'caution'; reasons.push(`Gusty winds (${Math.round(w.windKmh)} km/h).`); }

  if (w.tempC <= 5) { level = level === 'avoid' ? 'avoid' : 'caution'; reasons.push(`Cold conditions (${Math.round(w.tempC)}°C).`); }
  if (w.tempC >= 34) { level = level === 'avoid' ? 'avoid' : 'caution'; reasons.push(`Heat warning (${Math.round(w.tempC)}°C) — hydrate often.`); }

  if (!w.isDay) { level = level === 'avoid' ? 'avoid' : 'caution'; reasons.push('Low light — bring a headlamp & turn back early.'); }

  if (reasons.length === 0) reasons.push(`${codeLabel(w.weatherCode)}, ${Math.round(w.tempC)}°C, wind ${Math.round(w.windKmh)} km/h — good window.`);

  const headline =
    level === 'avoid' ? `Avoid hiking — ${codeLabel(w.weatherCode)}` :
    level === 'caution' ? `Hike with caution — ${codeLabel(w.weatherCode)}` :
    `Conditions look good — ${codeLabel(w.weatherCode)}`;

  return { level, headline, reasons };
}

export function weatherLabel(code: number) { return codeLabel(code); }
