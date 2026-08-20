/**
 * Prophet Data Service: Aggregates historical bookings, weather, Philippine holidays,
 * LGU announcements, and generates forward forecasting matrices.
 */

import { supabase } from '@/integrations/supabase/client';
import { loadAnnouncements } from '@/lib/announcements';
import {
  ProphetDataPoint,
  ProphetForecastPoint,
  AggregatedForecastPoint,
  ScenarioSimulationParams,
  DEFAULT_SCENARIO_PARAMS,
} from './prophetTypes';
import { FacebookProphetEngine } from './prophetEngine';
import { format, addDays, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, parseISO } from 'date-fns';

// Mount Kalisungan Coordinates
const KALISUNGAN_LAT = 14.4833;
const KALISUNGAN_LNG = 121.4167;

/**
 * Known Philippine National & Regional Holidays (recurring pattern helper)
 */
function getPhilippineHoliday(ds: string): string | undefined {
  const [yearStr, monthStr, dayStr] = ds.split('-');
  const month = parseInt(monthStr, 10);
  const day = parseInt(dayStr, 10);
  const year = parseInt(yearStr, 10);

  // Fixed date holidays
  if (month === 1 && day === 1) return "New Year's Day";
  if (month === 2 && day === 25) return 'EDSA Revolution Anniversary';
  if (month === 4 && day === 9) return 'Araw ng Kagitingan';
  if (month === 5 && day === 1) return 'Labor Day';
  if (month === 6 && day === 12) return 'Independence Day';
  if (month === 8 && day === 21) return 'Ninoy Aquino Day';
  if (month === 8 && day >= 25 && day <= 31 && new Date(ds).getDay() === 1) return 'National Heroes Day';
  if (month === 11 && day === 1) return "All Saints' Day (Undas)";
  if (month === 11 && day === 2) return "All Souls' Day";
  if (month === 11 && day === 30) return 'Bonifacio Day';
  if (month === 12 && day === 8) return 'Feast of the Immaculate Conception';
  if (month === 12 && day === 24) return 'Christmas Eve';
  if (month === 12 && day === 25) return 'Christmas Day';
  if (month === 12 && day === 30) return 'Rizal Day';
  if (month === 12 && day === 31) return "New Year's Eve";

  // Approximate Holy Week based on year (March/April)
  // 2026: April 2 (Maundy Thursday), April 3 (Good Friday), April 4 (Black Saturday), April 5 (Easter)
  if (year === 2026) {
    if (month === 4 && day === 2) return 'Maundy Thursday';
    if (month === 4 && day === 3) return 'Good Friday';
    if (month === 4 && day === 4) return 'Black Saturday';
    if (month === 4 && day === 5) return 'Easter Sunday';
  } else if (year === 2025) {
    if (month === 4 && day === 17) return 'Maundy Thursday';
    if (month === 4 && day === 18) return 'Good Friday';
    if (month === 4 && day === 19) return 'Black Saturday';
  }

  // Local Calauan / Laguna Eco-Fest
  if (month === 5 && day === 15) return 'Pinya Eco-Tourism Festival';

  return undefined;
}

/**
 * Fetch 14-day weather forecast from Open-Meteo
 */
async function fetchOpenMeteoForecast(): Promise<{ [ds: string]: { rainProb: number; precipMm: number; tempMax: number } }> {
  const result: { [ds: string]: { rainProb: number; precipMm: number; tempMax: number } } = {};
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500);
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${KALISUNGAN_LAT}&longitude=${KALISUNGAN_LNG}&daily=precipitation_probability_max,precipitation_sum,temperature_2m_max&timezone=Asia%2FManila&forecast_days=14`;
    const resp = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!resp.ok) return result;
    const json = await resp.json();
    const times: string[] = json.daily?.time || [];
    const rainProbs: number[] = json.daily?.precipitation_probability_max || [];
    const precips: number[] = json.daily?.precipitation_sum || [];
    const temps: number[] = json.daily?.temperature_2m_max || [];

    for (let i = 0; i < times.length; i++) {
      result[times[i]] = {
        rainProb: rainProbs[i] ?? 20,
        precipMm: precips[i] ?? 0,
        tempMax: temps[i] ?? 31,
      };
    }
  } catch (err) {
    console.warn('Open-Meteo weather fetch failed, using seasonal fallback:', err);
  }
  return result;
}

/**
 * Synthesize realistic historical baseline for Mount Kalisungan (up to 365 days)
 * Reflects genuine Philippine mountain trail dynamics:
 * - Weekend surge (Sat/Sun 3x to 5x higher than Wed/Thu)
 * - Dry Season peak (Dec - May) vs Monsoon wet dip (July - Oct)
 * - Holy Week & Holiday spikes
 * - Periodic Habagat / Monsoon / Typhoon dips
 */
export function generateSyntheticBaseline(
  startDateStr: string,
  endDateStr: string,
  targetAverageDaily: number = 38
): ProphetDataPoint[] {
  const points: ProphetDataPoint[] = [];
  const start = parseISO(startDateStr);
  const end = parseISO(endDateStr);

  let cur = start;
  let dayCounter = 0;

  while (cur <= end) {
    const ds = format(cur, 'yyyy-MM-dd');
    const dayOfWeek = cur.getDay(); // 0=Sun, 6=Sat
    const month = cur.getMonth() + 1; // 1-12
    const holiday = getPhilippineHoliday(ds);

    // 1. Day of Week multiplier
    let dowMultiplier = 0.35; // Mon-Thu lull
    if (dayOfWeek === 5) dowMultiplier = 0.75; // Friday pre-weekend
    else if (dayOfWeek === 6) dowMultiplier = 2.4; // Saturday peak
    else if (dayOfWeek === 0) dowMultiplier = 2.1; // Sunday peak

    // 2. Philippine Seasonal multiplier
    let seasonMultiplier = 1.0;
    if (month >= 12 || month <= 2) seasonMultiplier = 1.45; // Cool dry peak
    else if (month >= 3 && month <= 5) seasonMultiplier = 1.35; // Summer hiking season
    else if (month >= 7 && month <= 9) seasonMultiplier = 0.55; // Habagat / rainy monsoon season
    else if (month === 6 || month === 10) seasonMultiplier = 0.85; // Transition wet months
    else seasonMultiplier = 1.15; // November post-typhoon

    // 3. Holiday bonus
    let holidayMultiplier = 1.0;
    if (holiday) {
      if (holiday.includes('Holy Week') || holiday.includes('Good Friday') || holiday.includes('Black Saturday')) {
        holidayMultiplier = 2.6;
      } else if (holiday.includes('New Year') || holiday.includes('Christmas') || holiday.includes('Labor Day')) {
        holidayMultiplier = 1.8;
      } else {
        holidayMultiplier = 1.4;
      }
    }

    // 4. Simulated Weather Regressors for this historical date
    let rainProb = 15;
    let precipMm = 0;
    let typhoonSignal = 0;
    let calamityAlert: 'none' | 'yellow' | 'orange' | 'red' = 'none';

    if (month >= 7 && month <= 9) {
      rainProb = 50 + Math.sin(dayCounter * 0.4) * 35;
      precipMm = rainProb > 65 ? Math.random() * 25 : 0;
      // Occasional simulated tropical storm in wet season
      if (dayCounter % 42 === 15) {
        typhoonSignal = 1;
        calamityAlert = 'yellow';
      } else if (dayCounter % 42 === 16) {
        typhoonSignal = 2;
        calamityAlert = 'orange';
      }
    } else {
      rainProb = 10 + Math.sin(dayCounter * 0.2) * 15;
      precipMm = rainProb > 30 ? Math.random() * 5 : 0;
    }

    // 5. Calculate base expected hikers
    let expectedY = targetAverageDaily * dowMultiplier * seasonMultiplier * holidayMultiplier;

    // Apply weather dampening
    if (typhoonSignal >= 2) expectedY *= 0.15;
    else if (typhoonSignal === 1) expectedY *= 0.55;
    else if (rainProb > 70) expectedY *= 0.65;

    // Add mild Gaussian-like random noise
    const noise = (Math.random() - 0.5) * 8;
    const finalY = Math.max(2, Math.round(expectedY + noise));

    points.push({
      ds,
      y: finalY,
      cap: 100,
      floor: 0,
      rain_prob: Math.round(rainProb),
      precipitation_mm: Math.round(precipMm * 10) / 10,
      temp_max: month >= 3 && month <= 5 ? 33 : 30,
      typhoon_signal: typhoonSignal,
      calamity_alert: calamityAlert,
      lgu_impact: holiday ? 0.3 : 0,
      holiday_name: holiday,
      source: 'synthetic_baseline',
    });

    cur = addDays(cur, 1);
    dayCounter++;
  }

  return points;
}

/**
 * Main Service: Loads live bookings + baseline, fits Facebook Prophet, and returns multi-granularity forecasts
 */
export async function runProphetForecastPipeline({
  locationId = null,
  forecastDays = 60,
  useBaselineAugmentation = true,
  scenarioParams = DEFAULT_SCENARIO_PARAMS,
}: {
  locationId?: string | null;
  forecastDays?: number;
  useBaselineAugmentation?: boolean;
  scenarioParams?: ScenarioSimulationParams;
}): Promise<{
  engine: FacebookProphetEngine;
  dailyForecast: ProphetForecastPoint[];
  weeklyForecast: AggregatedForecastPoint[];
  monthlyForecast: AggregatedForecastPoint[];
  evaluation: any;
  decomposition: any;
  trainingCount: number;
  liveBookingsCount: number;
}> {
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const pastYearStr = format(subDays(new Date(), 365), 'yyyy-MM-dd');

  // 1. Fetch Real Database Bookings
  let bookingsQuery = supabase
    .from('bookings')
    .select('booking_date, status, group_size, location_id')
    .gte('booking_date', pastYearStr);

  if (locationId) {
    bookingsQuery = bookingsQuery.eq('location_id', locationId);
  }

  const { data: dbBookings, error: bookingsErr } = await bookingsQuery;
  if (bookingsErr) {
    console.warn('Error querying bookings:', bookingsErr);
  }

  // Aggregate live bookings by date
  const actualDailyMap: { [ds: string]: { totalHikers: number; bookingCount: number } } = {};
  let totalLiveRecords = 0;

  if (dbBookings && dbBookings.length > 0) {
    dbBookings.forEach((b) => {
      if (b.status === 'confirmed' || b.status === 'active' || b.status === 'completed') {
        const ds = b.booking_date;
        if (!actualDailyMap[ds]) {
          actualDailyMap[ds] = { totalHikers: 0, bookingCount: 0 };
        }
        actualDailyMap[ds].totalHikers += b.group_size || 1;
        actualDailyMap[ds].bookingCount += 1;
        totalLiveRecords++;
      }
    });
  }

  // 2. Fetch Custom Capacity Limits from daily_capacity table
  const futureEndStr = format(addDays(new Date(), forecastDays + 30), 'yyyy-MM-dd');
  let capQuery = supabase
    .from('daily_capacity')
    .select('date, max_capacity, location_id')
    .gte('date', pastYearStr)
    .lte('date', futureEndStr);

  if (locationId) {
    capQuery = capQuery.eq('location_id', locationId);
  }
  const { data: dbCapacities } = await capQuery;
  const capacityMap: { [ds: string]: number } = {};
  dbCapacities?.forEach((c) => {
    capacityMap[c.date] = c.max_capacity || 100;
  });

  // 3. Load Active Announcements
  const announcements = loadAnnouncements();
  const announcementImpactMap: { [ds: string]: { impact: number; title: string } } = {};
  announcements.forEach((a) => {
    let impact = 0;
    if (a.type === 'closure') impact = -0.95;
    else if (a.type === 'warning') impact = -0.40;
    else if (a.type === 'info') impact = 0.15;

    const start = a.starts_at ? a.starts_at.slice(0, 10) : todayStr;
    const end = a.expires_at ? a.expires_at.slice(0, 10) : format(addDays(parseISO(start), 7), 'yyyy-MM-dd');

    let cur = parseISO(start);
    const endD = parseISO(end);
    while (cur <= endD) {
      const dStr = format(cur, 'yyyy-MM-dd');
      announcementImpactMap[dStr] = { impact, title: a.title };
      cur = addDays(cur, 1);
    }
  });

  // 4. Fetch Open-Meteo Weather for the next 14 days
  const weatherMap = await fetchOpenMeteoForecast();

  // 5. Construct Training Dataset
  const trainingData: ProphetDataPoint[] = [];

  // Generate synthetic baseline for dates that don't have enough live data
  const baselinePoints = generateSyntheticBaseline(pastYearStr, todayStr, 40);

  if (useBaselineAugmentation || Object.keys(actualDailyMap).length < 20) {
    // Merge baseline with real actuals overriding baseline where real bookings exist
    baselinePoints.forEach((basePoint) => {
      const real = actualDailyMap[basePoint.ds];
      if (real && real.totalHikers > 0) {
        trainingData.push({
          ...basePoint,
          y: real.totalHikers,
          cap: capacityMap[basePoint.ds] ?? 100,
          source: 'actual',
        });
      } else {
        trainingData.push({
          ...basePoint,
          cap: capacityMap[basePoint.ds] ?? 100,
          source: 'synthetic_baseline',
        });
      }
    });
  } else {
    // Use strictly live database bookings
    Object.keys(actualDailyMap).forEach((ds) => {
      const real = actualDailyMap[ds];
      const holiday = getPhilippineHoliday(ds);
      const ann = announcementImpactMap[ds];
      trainingData.push({
        ds,
        y: real.totalHikers,
        cap: capacityMap[ds] ?? 100,
        rain_prob: 20,
        typhoon_signal: 0,
        lgu_impact: ann?.impact ?? (holiday ? 0.3 : 0),
        holiday_name: holiday ?? ann?.title,
        source: 'actual',
      });
    });
  }

  // 6. Fit Facebook Prophet Model
  const engine = new FacebookProphetEngine({
    growth: 'linear',
    nChangepoints: 25,
    intervalWidth: 0.95,
  });

  engine.fit(trainingData);

  // 7. Generate Future Forecasting Horizon
  const futurePoints: ProphetDataPoint[] = [];
  const today = parseISO(todayStr);

  for (let i = 0; i <= forecastDays; i++) {
    const d = addDays(today, i);
    const ds = format(d, 'yyyy-MM-dd');
    const month = d.getMonth() + 1;
    const holiday = getPhilippineHoliday(ds);
    const ann = announcementImpactMap[ds];
    const liveWeather = weatherMap[ds];

    // Base weather regressors
    let rainProb = liveWeather?.rainProb ?? (month >= 7 && month <= 9 ? 55 : 20);
    let precipMm = liveWeather?.precipMm ?? 0;
    let tempMax = liveWeather?.tempMax ?? (month >= 3 && month <= 5 ? 33 : 30);
    let typhoonSignal = 0;
    let calamityAlert: 'none' | 'yellow' | 'orange' | 'red' = 'none';
    let lguImpact = ann?.impact ?? (holiday ? 0.3 : 0);

    // Apply What-If Scenario Overrides if specified
    if (scenarioParams.extremeRainBoost > 0) {
      rainProb = Math.min(100, rainProb + scenarioParams.extremeRainBoost);
    }
    if (scenarioParams.typhoonSignal > 0) {
      const matchesDate =
        (!scenarioParams.typhoonStartDate || ds >= scenarioParams.typhoonStartDate) &&
        (!scenarioParams.typhoonEndDate || ds <= scenarioParams.typhoonEndDate);

      if (matchesDate) {
        typhoonSignal = scenarioParams.typhoonSignal;
        if (typhoonSignal >= 3) calamityAlert = 'red';
        else if (typhoonSignal === 2) calamityAlert = 'orange';
        else calamityAlert = 'yellow';
      }
    }
    if (scenarioParams.lguPromoActive) {
      lguImpact += scenarioParams.lguPromoDelta;
    }
    if (scenarioParams.lguMaintenanceActive) {
      lguImpact += scenarioParams.lguMaintenanceDelta;
    }

    const actual = actualDailyMap[ds]?.totalHikers;

    futurePoints.push({
      ds,
      y: actual ?? 0,
      cap: capacityMap[ds] ?? 100,
      floor: 0,
      rain_prob: rainProb,
      precipitation_mm: precipMm,
      temp_max: tempMax,
      typhoon_signal: typhoonSignal,
      calamity_alert: calamityAlert,
      lgu_impact: lguImpact,
      holiday_name: holiday ?? ann?.title,
    });
  }

  // 8. Run Predictions
  const dailyForecast = engine.predict(futurePoints, capacityMap);

  // Apply growth multiplier from scenario if any
  if (scenarioParams.growthMultiplier !== 1.0) {
    dailyForecast.forEach((pt) => {
      pt.yhat = Math.round(pt.yhat * scenarioParams.growthMultiplier * 10) / 10;
      pt.yhat_lower = Math.round(pt.yhat_lower * scenarioParams.growthMultiplier * 10) / 10;
      pt.yhat_upper = Math.round(pt.yhat_upper * scenarioParams.growthMultiplier * 10) / 10;
      pt.isOverCapacity = pt.yhat > pt.capacityLimit;
    });
  }

  // 9. Aggregate Weekly Forecast
  const weeklyForecast = aggregateWeekly(dailyForecast);

  // 10. Aggregate Monthly Forecast
  const monthlyForecast = aggregateMonthly(dailyForecast);

  // 11. Run Model Backtest Evaluation on last 30 days of training data
  const testSplit = trainingData.slice(-30);
  const evaluation = engine.evaluate(testSplit);

  // 12. Extract Decomposition
  const decomposition = engine.getDecomposition();

  return {
    engine,
    dailyForecast,
    weeklyForecast,
    monthlyForecast,
    evaluation,
    decomposition,
    trainingCount: trainingData.length,
    liveBookingsCount: totalLiveRecords,
  };
}

/**
 * Aggregate daily forecast into ISO weekly summaries
 */
function aggregateWeekly(daily: ProphetForecastPoint[]): AggregatedForecastPoint[] {
  const weeksMap: { [weekKey: string]: ProphetForecastPoint[] } = {};

  daily.forEach((p) => {
    const d = parseISO(p.ds);
    const startW = format(startOfWeek(d, { weekStartsOn: 1 }), 'yyyy-MM-dd');
    if (!weeksMap[startW]) {
      weeksMap[startW] = [];
    }
    weeksMap[startW].push(p);
  });

  return Object.keys(weeksMap)
    .sort()
    .map((startKey) => {
      const points = weeksMap[startKey];
      const startD = parseISO(startKey);
      const endD = endOfWeek(startD, { weekStartsOn: 1 });
      const endKey = format(endD, 'yyyy-MM-dd');

      let yhatTotal = 0;
      let yhatLowerTotal = 0;
      let yhatUpperTotal = 0;
      let actualTotal = 0;
      let trendSum = 0;
      let weeklySum = 0;
      let yearlySum = 0;
      let regSum = 0;
      let maxCapTotal = 0;
      let peakDayDate = points[0].ds;
      let peakDayYhat = points[0].yhat;

      points.forEach((pt) => {
        yhatTotal += pt.yhat;
        yhatLowerTotal += pt.yhat_lower;
        yhatUpperTotal += pt.yhat_upper;
        if (pt.y) actualTotal += pt.y;
        trendSum += pt.trend;
        weeklySum += pt.weekly;
        yearlySum += pt.yearly;
        regSum += pt.weatherEffect + pt.calamityEffect + pt.lguEffect;
        maxCapTotal += pt.capacityLimit;

        if (pt.yhat > peakDayYhat) {
          peakDayYhat = pt.yhat;
          peakDayDate = pt.ds;
        }
      });

      const n = points.length;
      return {
        periodLabel: `Week of ${format(startD, 'MMM d')}`,
        startDate: startKey,
        endDate: endKey,
        yhatTotal: Math.round(yhatTotal),
        yhatLowerTotal: Math.round(yhatLowerTotal),
        yhatUpperTotal: Math.round(yhatUpperTotal),
        actualTotal: actualTotal > 0 ? Math.round(actualTotal) : undefined,
        trendAvg: Math.round((trendSum / n) * 10) / 10,
        weeklyAvg: Math.round((weeklySum / n) * 10) / 10,
        yearlyAvg: Math.round((yearlySum / n) * 10) / 10,
        regressorsTotal: Math.round(regSum),
        maxCapacityTotal: Math.round(maxCapTotal),
        isOverCapacity: yhatTotal > maxCapTotal,
        peakDayDate,
        peakDayYhat,
        daysCount: n,
      };
    });
}

/**
 * Aggregate daily forecast into calendar month summaries
 */
function aggregateMonthly(daily: ProphetForecastPoint[]): AggregatedForecastPoint[] {
  const monthMap: { [mKey: string]: ProphetForecastPoint[] } = {};

  daily.forEach((p) => {
    const d = parseISO(p.ds);
    const mKey = format(d, 'yyyy-MM');
    if (!monthMap[mKey]) {
      monthMap[mKey] = [];
    }
    monthMap[mKey].push(p);
  });

  return Object.keys(monthMap)
    .sort()
    .map((mKey) => {
      const points = monthMap[mKey];
      const startD = startOfMonth(parseISO(points[0].ds));
      const endD = endOfMonth(startD);

      let yhatTotal = 0;
      let yhatLowerTotal = 0;
      let yhatUpperTotal = 0;
      let actualTotal = 0;
      let trendSum = 0;
      let weeklySum = 0;
      let yearlySum = 0;
      let regSum = 0;
      let maxCapTotal = 0;
      let peakDayDate = points[0].ds;
      let peakDayYhat = points[0].yhat;

      points.forEach((pt) => {
        yhatTotal += pt.yhat;
        yhatLowerTotal += pt.yhat_lower;
        yhatUpperTotal += pt.yhat_upper;
        if (pt.y) actualTotal += pt.y;
        trendSum += pt.trend;
        weeklySum += pt.weekly;
        yearlySum += pt.yearly;
        regSum += pt.weatherEffect + pt.calamityEffect + pt.lguEffect;
        maxCapTotal += pt.capacityLimit;

        if (pt.yhat > peakDayYhat) {
          peakDayYhat = pt.yhat;
          peakDayDate = pt.ds;
        }
      });

      const n = points.length;
      return {
        periodLabel: format(startD, 'MMMM yyyy'),
        startDate: format(startD, 'yyyy-MM-dd'),
        endDate: format(endD, 'yyyy-MM-dd'),
        yhatTotal: Math.round(yhatTotal),
        yhatLowerTotal: Math.round(yhatLowerTotal),
        yhatUpperTotal: Math.round(yhatUpperTotal),
        actualTotal: actualTotal > 0 ? Math.round(actualTotal) : undefined,
        trendAvg: Math.round((trendSum / n) * 10) / 10,
        weeklyAvg: Math.round((weeklySum / n) * 10) / 10,
        yearlyAvg: Math.round((yearlySum / n) * 10) / 10,
        regressorsTotal: Math.round(regSum),
        maxCapacityTotal: Math.round(maxCapTotal),
        isOverCapacity: yhatTotal > maxCapTotal,
        peakDayDate,
        peakDayYhat,
        daysCount: n,
      };
    });
}
