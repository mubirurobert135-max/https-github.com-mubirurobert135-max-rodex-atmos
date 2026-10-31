import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import { buildGroundedWeatherReply, isDirectCurrentWeatherQuery, boundConversationHistory } from './src/utils/weatherGrounding';
import {
  findCurrentHourlyIndex,
  formatForecastLocalDate,
  formatForecastLocalHour,
  formatLocationLocalTime,
  getMaxUpcomingPrecipitationProbability,
  normalizeForecastLocalTime
} from './src/utils/weatherUtils';
import { isGreetingQuery, buildNaturalGreetingResponse } from './src/utils/greetingUtils';
import { ATMOS_SIGNATURE_LIVE_VOICE, ATMOS_SIGNATURE_STYLE, ATMOS_SIGNATURE_TTS_MODEL, ATMOS_SIGNATURE_VOICE_ID as DEFAULT_ATMOS_SIGNATURE_VOICE_ID } from './src/utils/voiceSignature';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Shared Express application used by local development and explicit Vercel API functions.
export const app = express();

// Vercel sets platform-specific environment values; use all documented runtime signals
// instead of relying on one variable being present in every build/runtime configuration.
const isVercelRuntime =
  process.env.VERCEL === '1' ||
  Boolean(process.env.VERCEL_ENV) ||
  Boolean(process.env.VERCEL_URL);

// Production builds must never boot Vite's development middleware or bind a
// local HTTP port. Vercel may expose environment signals differently between
// build and invocation, so NODE_ENV is an additional production safeguard.
const shouldRunLocalDevServer =
  !isVercelRuntime && process.env.NODE_ENV !== 'production';

interface ProviderConfig {
  name: string;
  isEligible: boolean;
  credit: string;
  disclaimer: string;
}

interface CacheEntry {
  timestamp: number;
  data: any;
}

interface ProviderUsage {
  hourlyCalls: number;
  windowStartTime: number;
  lastErrorTime: number;
  consecutiveErrors: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX_ENTRIES = 250;
const inFlightWeatherRequests = new Map<string, Promise<any>>();
const providerUsageMap = new Map<string, ProviderUsage>();

function normalizeWeatherQuery(query: string): string {
  return query.trim().replace(/\s+/g, ' ').replace(/\s*,\s*/g, ',').toLocaleLowerCase();
}

function coordinateCacheKey(lat: number, lon: number): string {
  return 'coords:' + lat.toFixed(3) + ',' + lon.toFixed(3);
}

function saveWeatherCache(cacheKey: string, data: any): void {
  cache.delete(cacheKey);
  cache.set(cacheKey, { timestamp: Date.now(), data });
  while (cache.size > CACHE_MAX_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey === undefined) break;
    cache.delete(oldestKey);
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(label + ' timed out after ' + timeoutMs + 'ms')), timeoutMs);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); }
    );
  });
}

/**
 * Hourly window reset: Resets every 60 minutes (rolling interval from the start of each window).
 * Note: These in-memory counters are best-effort per server instance and cannot guarantee
 * a strict distributed app-wide quota across multi-instance server deployments.
 */
function checkBudget(providerName: string): boolean {
  const now = Date.now();
  const hourMs = 60 * 60 * 1000;
  
  if (!providerUsageMap.has(providerName)) {
    providerUsageMap.set(providerName, { hourlyCalls: 0, windowStartTime: now, lastErrorTime: 0, consecutiveErrors: 0 });
  }

  const usage = providerUsageMap.get(providerName)!;
  if (now - usage.windowStartTime > hourMs) {
    usage.hourlyCalls = 0;
    usage.windowStartTime = now;
  }

  let budget = 1000;
  if (providerName === 'WeatherAPI.com') {
    budget = Number(process.env.WEATHERAPI_BUDGET_HOURLY || 1000);
  } else if (providerName === 'Open-Meteo') {
    budget = Number(process.env.OPEN_METEO_BUDGET_HOURLY || 5000);
  } else if (providerName === 'OpenWeather') {
    budget = Number(process.env.OPENWEATHER_BUDGET_HOURLY || 1000);
  }

  if (usage.hourlyCalls >= budget) {
    console.warn(`[Budget Notice] Provider ${providerName} reached hourly budget of ${budget}. Skipping.`);
    return false;
  }

  return true;
}

// Count every actual outbound provider request attempt before sending it (success or failure)
function recordProviderAttempt(providerName: string) {
  const now = Date.now();
  const hourMs = 60 * 60 * 1000;

  if (!providerUsageMap.has(providerName)) {
    providerUsageMap.set(providerName, { hourlyCalls: 0, windowStartTime: now, lastErrorTime: 0, consecutiveErrors: 0 });
  }
  const usage = providerUsageMap.get(providerName)!;
  if (now - usage.windowStartTime > hourMs) {
    usage.hourlyCalls = 0;
    usage.windowStartTime = now;
  }
  usage.hourlyCalls++;
}

function recordProviderSuccess(providerName: string) {
  if (!providerUsageMap.has(providerName)) {
    providerUsageMap.set(providerName, { hourlyCalls: 0, windowStartTime: Date.now(), lastErrorTime: 0, consecutiveErrors: 0 });
  }
  const usage = providerUsageMap.get(providerName)!;
  usage.consecutiveErrors = 0;
}

function recordProviderError(providerName: string) {
  if (!providerUsageMap.has(providerName)) {
    providerUsageMap.set(providerName, { hourlyCalls: 0, windowStartTime: Date.now(), lastErrorTime: 0, consecutiveErrors: 0 });
  }
  const usage = providerUsageMap.get(providerName)!;
  usage.lastErrorTime = Date.now();
  usage.consecutiveErrors++;
}

function isProviderHealthy(providerName: string): boolean {
  const usage = providerUsageMap.get(providerName);
  if (!usage) return true;
  const cooldownMs = 5 * 60 * 1000; // 5 min cooldown after repeated errors
  if (usage.consecutiveErrors >= 3 && (Date.now() - usage.lastErrorTime < cooldownMs)) {
    return false;
  }
  return true;
}

async function startServer() {
  const PORT = process.env.PORT || 3000;

  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));

  // Lightweight deployment/runtime probe. Never exposes credentials or environment values.
  app.get('/api/health', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.status(200).json({
      ok: true,
      service: 'rodex-atmos-api',
      runtime: isVercelRuntime ? 'vercel' : 'node',
      timestamp: new Date().toISOString()
    });
  });

  // Initialize Gemini API if key is available
  const geminiApiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
  const ai = geminiApiKey ? new GoogleGenAI({ apiKey: geminiApiKey }) : null;

  // Check eligible providers based on environment secrets, health, and budget
  const getEligibleProviders = (): ProviderConfig[] => {
    const providers: ProviderConfig[] = [];

    // 1. WeatherAPI.com (Prioritized if WEATHERAPI_KEY is configured)
    if (process.env.WEATHERAPI_KEY && process.env.WEATHERAPI_KEY.trim() !== '') {
      providers.push({
        name: 'WeatherAPI.com',
        isEligible: true,
        credit: 'Powered by WeatherAPI.com',
        disclaimer: 'Weather data provided by WeatherAPI.com.'
      });
    }

    // 2. Open-Meteo (Always eligible by default as public free weather provider)
    providers.push({
      name: 'Open-Meteo',
      isEligible: true,
      credit: 'Weather data by Open-Meteo.com',
      disclaimer: 'Open-Meteo public free weather API.'
    });

    // 3. OpenWeather (Disabled by default; requires server key AND explicit confirmation flag)
    if (process.env.OPENWEATHER_API_KEY && process.env.OPENWEATHER_API_KEY.trim() !== '' && process.env.OPENWEATHER_COMMERCIAL_CONFIRMED === 'true') {
      providers.push({
        name: 'OpenWeather',
        isEligible: true,
        credit: 'Powered by OpenWeather',
        disclaimer: 'OpenWeather commercial API subscription.'
      });
    }

    // Filter by health cooldown and hourly budget limits
    return providers.filter(p => isProviderHealthy(p.name) && checkBudget(p.name));
  };

  // Helper to extract official alerts and generate forecast-based smart weather notifications
  function processWeatherAlerts(data: { location: any; current: any; hourly: any; daily: any }, rawOfficialAlerts?: any[]): any[] {
    const alerts: any[] = [];
    const locationName = data.location?.name || 'Selected Location';

    // 1. Process Official Warnings (from WeatherAPI or external meteorological services)
    if (Array.isArray(rawOfficialAlerts) && rawOfficialAlerts.length > 0) {
      rawOfficialAlerts.forEach((a: any, idx: number) => {
        const rawSev = (a.severity || '').toLowerCase();
        let severity = 'moderate';
        if (rawSev.includes('extreme')) severity = 'extreme';
        else if (rawSev.includes('severe')) severity = 'severe';
        else if (rawSev.includes('minor')) severity = 'minor';

        alerts.push({
          id: `official-${locationName}-${a.event || a.headline}-${idx}`.toLowerCase().replace(/[^a-z0-9]/g, '-'),
          title: a.headline || a.event || 'Official Severe Weather Alert',
          description: a.desc || a.note || a.instruction || 'Official severe weather warning issued by national meteorological authority.',
          severity,
          type: 'official',
          locationName,
          issuingAuthority: a.category || a.note || 'National Weather Service',
          effective: a.effective || new Date().toISOString(),
          expires: a.expires || new Date(Date.now() + 86400000).toISOString(),
          instruction: a.instruction || undefined,
          createdAt: new Date().toISOString()
        });
      });
    }

    // 2. Generate forecast notices only from real, finite observations.
    const finiteOrNull = (value: unknown): number | null =>
      typeof value === 'number' && Number.isFinite(value) ? value : null;
    const temp = finiteOrNull(data.current?.temperature_2m);
    const precip = finiteOrNull(data.current?.precipitation);
    const wind = finiteOrNull(data.current?.wind_speed_10m);
    const weatherCode = finiteOrNull(data.current?.weather_code);
    const maxPrecipProb = getMaxUpcomingPrecipitationProbability(
      data.hourly?.time,
      data.hourly?.precipitation_probability,
      data.current?.time,
      12
    );
    const maxUv = finiteOrNull(data.daily?.uv_index_max?.[0]);

    // Thunderstorm / Severe Rain
    if (weatherCode === 95 || weatherCode === 96 || weatherCode === 99) {
      alerts.push({
        id: `forecast-thunderstorm-${locationName}`.toLowerCase().replace(/[^a-z0-9]/g, '-'),
        title: 'Thunderstorm Conditions Reported',
        description: `The current weather observation reports thunderstorms in ${locationName}. Seek shelter indoors and stay away from exposed areas.`,
        severity: 'severe',
        type: 'forecast',
        locationName,
        issuingAuthority: 'RODEX Atmos Forecast Intelligence',
        effective: new Date().toISOString(),
        expires: new Date(Date.now() + 14400000).toISOString(),
        instruction: 'Avoid open outdoor spaces and metal objects during lightning activity.',
        createdAt: new Date().toISOString()
      });
    } else if ((precip != null && precip >= 10) || (maxPrecipProb != null && maxPrecipProb >= 80)) {
      const evidence: string[] = [];
      if (maxPrecipProb != null) evidence.push(`rain probability reaches ${Math.round(maxPrecipProb)}% in the next 12 forecast hours`);
      if (precip != null && precip >= 10) evidence.push(`the latest observation reports ${precip.toFixed(1)} mm precipitation`);
      alerts.push({
        id: `forecast-heavy-rain-${locationName}`.toLowerCase().replace(/[^a-z0-9]/g, '-'),
        title: 'High Rainfall Risk',
        description: `Rain risk in ${locationName}: ${evidence.join('; ')}. Check the hourly outlook before travelling.`,
        severity: (maxPrecipProb != null && maxPrecipProb >= 90) || (precip != null && precip >= 15) ? 'severe' : 'moderate',
        type: 'forecast',
        locationName,
        issuingAuthority: 'RODEX Atmos Forecast Intelligence',
        effective: new Date().toISOString(),
        expires: new Date(Date.now() + 21600000).toISOString(),
        instruction: 'Carry suitable rain protection and allow extra travel time if heavy showers develop.',
        createdAt: new Date().toISOString()
      });
    } else if (maxPrecipProb != null && maxPrecipProb >= 50) {
      alerts.push({
        id: `forecast-rain-notice-${locationName}`.toLowerCase().replace(/[^a-z0-9]/g, '-'),
        title: 'Rain Possible',
        description: `The highest rain probability in the next 12 forecast hours is ${Math.round(maxPrecipProb)}% in ${locationName}.`,
        severity: 'minor',
        type: 'forecast',
        locationName,
        issuingAuthority: 'RODEX Atmos Forecast Intelligence',
        effective: new Date().toISOString(),
        expires: new Date(Date.now() + 21600000).toISOString(),
        instruction: 'Check the hourly forecast before outdoor activities.',
        createdAt: new Date().toISOString()
      });
    }

    // Sustained 10-metre wind speed; this is not a gust measurement.
    if (wind != null && wind >= 45) {
      alerts.push({
        id: `forecast-strong-wind-${locationName}`.toLowerCase().replace(/[^a-z0-9]/g, '-'),
        title: 'Strong Wind Notice',
        description: `Reported 10-metre wind speed is around ${Math.round(wind)} km/h in ${locationName}; gust speed is a separate measurement.`,
        severity: wind >= 65 ? 'severe' : 'moderate',
        type: 'forecast',
        locationName,
        issuingAuthority: 'RODEX Atmos Forecast Intelligence',
        effective: new Date().toISOString(),
        expires: new Date(Date.now() + 18000000).toISOString(),
        instruction: 'Secure loose outdoor items and exercise care while driving high-profile vehicles.',
        createdAt: new Date().toISOString()
      });
    }

    // Extreme temperature notices require an actual current temperature reading.
    if (temp != null && temp >= 35) {
      alerts.push({
        id: `forecast-extreme-heat-${locationName}`.toLowerCase().replace(/[^a-z0-9]/g, '-'),
        title: 'Extreme Heat Notice',
        description: `The current temperature observation is ${Math.round(temp)}°C in ${locationName}. Heat stress is possible during prolonged exertion.`,
        severity: 'severe',
        type: 'forecast',
        locationName,
        issuingAuthority: 'RODEX Atmos Forecast Intelligence',
        effective: new Date().toISOString(),
        expires: new Date(Date.now() + 28800000).toISOString(),
        instruction: 'Hydrate frequently and avoid strenuous activity in direct sunlight.',
        createdAt: new Date().toISOString()
      });
    } else if (temp != null && temp <= 2) {
      alerts.push({
        id: `forecast-freezing-cold-${locationName}`.toLowerCase().replace(/[^a-z0-9]/g, '-'),
        title: 'Very Cold Conditions Notice',
        description: `The current temperature observation is ${Math.round(temp)}°C in ${locationName}.`,
        severity: 'moderate',
        type: 'forecast',
        locationName,
        issuingAuthority: 'RODEX Atmos Forecast Intelligence',
        effective: new Date().toISOString(),
        expires: new Date(Date.now() + 28800000).toISOString(),
        instruction: 'Wear warm insulated clothing and take care on potentially icy walkways.',
        createdAt: new Date().toISOString()
      });
    }

    // High UV Index Warning; do not invent an index when absent.
    if (maxUv != null && maxUv >= 8) {
      alerts.push({
        id: `forecast-high-uv-${locationName}`.toLowerCase().replace(/[^a-z0-9]/g, '-'),
        title: 'High UV Index Warning',
        description: `Peak UV index forecast at ${Math.round(maxUv)} in ${locationName}. Increased risk of sun damage.`,
        severity: 'moderate',
        type: 'forecast',
        locationName,
        issuingAuthority: 'RODEX Atmos Forecast Intelligence',
        effective: new Date().toISOString(),
        expires: new Date(Date.now() + 28800000).toISOString(),
        instruction: 'Apply SPF 30+ sunscreen, wear a hat and UV-blocking sunglasses midday.',
        createdAt: new Date().toISOString()
      });
    }

    return alerts;
  }

  // Helper to fetch weather via WeatherAPI.com
  async function fetchWeatherAPI(queryOrCoords: string | { lat: number; lon: number }) {
    const apiKey = process.env.WEATHERAPI_KEY;
    if (!apiKey) throw new Error('WEATHERAPI_KEY not configured');

    const q = typeof queryOrCoords === 'string' ? queryOrCoords : `${queryOrCoords.lat},${queryOrCoords.lon}`;
    const url = `https://api.weatherapi.com/v1/forecast.json?key=${apiKey}&q=${encodeURIComponent(q)}&days=7&aqi=no&alerts=yes`;
    
    const res = await fetchWithTimeout(url, {}, 6000);
    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`WeatherAPI error (${res.status}): ${errBody}`);
    }

    const data = await res.json();
    
    const location = {
      name: data.location.name,
      country: data.location.country,
      admin1: data.location.region || '',
      latitude: data.location.lat,
      longitude: data.location.lon,
      timezone: data.location.tz_id || 'UTC'
    };

    const current = {
      time: data.current.last_updated,
      temperature_2m: data.current.temp_c,
      relative_humidity_2m: data.current.humidity,
      apparent_temperature: data.current.feelslike_c,
      is_day: data.current.is_day,
      precipitation: data.current.precip_mm,
      weather_code: mapWeatherAPIcode(data.current.condition.code, data.current.is_day),
      wind_speed_10m: data.current.wind_kph,
      wind_direction_10m: data.current.wind_degree,
      surface_pressure: data.current.pressure_mb
    };

    const hourlyTimes: string[] = [];
    const hourlyTemps: number[] = [];
    const hourlyPrecipProb: number[] = [];
    const hourlyCodes: number[] = [];
    const hourlyIsDay: number[] = [];

    data.forecast.forecastday.forEach((day: any) => {
      day.hour.forEach((h: any) => {
        hourlyTimes.push(h.time);
        hourlyTemps.push(h.temp_c);
        hourlyPrecipProb.push(h.chance_of_rain || 0);
        hourlyCodes.push(mapWeatherAPIcode(h.condition.code, h.is_day));
        hourlyIsDay.push(h.is_day);
      });
    });

    const dailyTimes: string[] = [];
    const dailyCodes: number[] = [];
    const dailyMax: number[] = [];
    const dailyMin: number[] = [];
    const dailySunrise: string[] = [];
    const dailySunset: string[] = [];
    const dailyUv: number[] = [];

    data.forecast.forecastday.forEach((d: any) => {
      dailyTimes.push(d.date);
      dailyCodes.push(mapWeatherAPIcode(d.day.condition.code, 1));
      dailyMax.push(d.day.maxtemp_c);
      dailyMin.push(d.day.mintemp_c);
      dailySunrise.push(d.astro.sunrise);
      dailySunset.push(d.astro.sunset);
      dailyUv.push(Number.isFinite(d.day.uv) ? d.day.uv : null);
    });

    const alerts = processWeatherAlerts({
      location,
      current,
      hourly: { time: hourlyTimes, temperature_2m: hourlyTemps, precipitation_probability: hourlyPrecipProb, weather_code: hourlyCodes, is_day: hourlyIsDay },
      daily: { time: dailyTimes, weather_code: dailyCodes, temperature_2m_max: dailyMax, temperature_2m_min: dailyMin, sunrise: dailySunrise, sunset: dailySunset, uv_index_max: dailyUv }
    }, data.alerts?.alert);

    return {
      location,
      weather: {
        timezone: location.timezone,
        current,
        hourly: {
          time: hourlyTimes,
          temperature_2m: hourlyTemps,
          precipitation_probability: hourlyPrecipProb,
          weather_code: hourlyCodes,
          is_day: hourlyIsDay
        },
        daily: {
          time: dailyTimes,
          weather_code: dailyCodes,
          temperature_2m_max: dailyMax,
          temperature_2m_min: dailyMin,
          sunrise: dailySunrise,
          sunset: dailySunset,
          uv_index_max: dailyUv
        }
      },
      alerts,
      providerInfo: {
        name: 'WeatherAPI.com',
        credit: 'Powered by WeatherAPI.com',
        disclaimer: 'Weather data provided by WeatherAPI.com.'
      },
      source: 'live' as const
    };
  }

  // Optional OpenWeather integration: current observations come from the current-conditions endpoint,
  // while daily ranges are derived from actual forecast samples (never current temperature +/- a guess).
  async function fetchOpenWeather(queryOrCoords: string | { lat: number; lon: number }, cityNameHint?: string) {
    const apiKey = process.env.OPENWEATHER_API_KEY;
    if (!apiKey) throw new Error('OPENWEATHER_API_KEY not configured');

    let lat: number;
    let lon: number;
    let name = cityNameHint || 'Location';
    let country = '';

    if (typeof queryOrCoords === 'string') {
      const geoUrl = 'https://api.openweathermap.org/geo/1.0/direct?q=' + encodeURIComponent(queryOrCoords) + '&limit=1&appid=' + apiKey;
      const geoRes = await fetchWithTimeout(geoUrl, {}, 4500);
      if (!geoRes.ok) throw new Error('OpenWeather geocoding failed: HTTP ' + geoRes.status);
      const geoData = await geoRes.json();
      if (!Array.isArray(geoData) || geoData.length === 0) {
        throw new Error('City not found via OpenWeather geocoding');
      }
      lat = geoData[0].lat;
      lon = geoData[0].lon;
      name = geoData[0].name;
      country = geoData[0].country || '';
    } else {
      lat = queryOrCoords.lat;
      lon = queryOrCoords.lon;
    }

    const currentUrl = 'https://api.openweathermap.org/data/2.5/weather?lat=' + lat + '&lon=' + lon + '&units=metric&appid=' + apiKey;
    const forecastUrl = 'https://api.openweathermap.org/data/2.5/forecast?lat=' + lat + '&lon=' + lon + '&units=metric&appid=' + apiKey;
    const [currentRes, forecastRes] = await Promise.all([
      fetchWithTimeout(currentUrl, {}, 6000),
      fetchWithTimeout(forecastUrl, {}, 6000)
    ]);
    if (!currentRes.ok) throw new Error('OpenWeather current conditions failed: HTTP ' + currentRes.status);
    if (!forecastRes.ok) throw new Error('OpenWeather forecast failed: HTTP ' + forecastRes.status);

    const currentData = await currentRes.json();
    const forecastData = await forecastRes.json();
    if (!Array.isArray(forecastData.list) || forecastData.list.length === 0) {
      throw new Error('OpenWeather returned no forecast samples');
    }

    const timezoneOffset = Number.isFinite(currentData.timezone) ? currentData.timezone : 0;
    const currentTimestamp = Number.isFinite(currentData.dt) ? currentData.dt : Math.floor(Date.now() / 1000);
    const sunriseTimestamp = currentData.sys?.sunrise;
    const sunsetTimestamp = currentData.sys?.sunset;
    const isDay = Number.isFinite(sunriseTimestamp) && Number.isFinite(sunsetTimestamp)
      ? (currentTimestamp >= sunriseTimestamp && currentTimestamp < sunsetTimestamp ? 1 : 0)
      : 1;
    const currentWeatherCode = mapOpenWeatherCode(currentData.weather?.[0]?.id);
    // Keep OpenWeather timestamps as location-local wall time (no Z suffix),
    // matching the wall-clock convention used by the provider's 3-hour forecast feed.
    const toLocationWallTime = (timestamp: number) =>
      new Date((timestamp + timezoneOffset) * 1000).toISOString().slice(0, 16);

    const current = {
      time: toLocationWallTime(currentTimestamp),
      temperature_2m: Number.isFinite(currentData.main?.temp) ? currentData.main.temp : null,
      relative_humidity_2m: Number.isFinite(currentData.main?.humidity) ? currentData.main.humidity : null,
      apparent_temperature: Number.isFinite(currentData.main?.feels_like) ? currentData.main.feels_like : null,
      is_day: isDay,
      precipitation: Number.isFinite(currentData.rain?.['1h']) ? currentData.rain['1h'] : 0,
      weather_code: currentWeatherCode,
      wind_speed_10m: Number.isFinite(currentData.wind?.speed) ? currentData.wind.speed * 3.6 : null,
      wind_direction_10m: Number.isFinite(currentData.wind?.deg) ? currentData.wind.deg : null,
      surface_pressure: Number.isFinite(currentData.main?.pressure) ? currentData.main.pressure : null
    };

    const hourlyTimes: string[] = [];
    const hourlyTemps: number[] = [];
    const hourlyPrecipProb: number[] = [];
    const hourlyCodes: number[] = [];
    const hourlyIsDay: number[] = [];
    const dailyByDate = new Map<string, { temps: number[]; codes: number[]; codeHours: number[] }>();

    for (const item of forecastData.list) {
      const timestamp = Number.isFinite(item.dt) ? item.dt : null;
      if (timestamp == null) continue;
      const localDate = new Date((timestamp + timezoneOffset) * 1000).toISOString().slice(0, 10);
      const localHour = Number(new Date((timestamp + timezoneOffset) * 1000).toISOString().slice(11, 13));
      const temp = Number.isFinite(item.main?.temp) ? item.main.temp : null;
      const code = mapOpenWeatherCode(item.weather?.[0]?.id);

      // OpenWeather's standard forecast feed provides 3-hour samples, not one-hour samples.
      hourlyTimes.push(toLocationWallTime(timestamp));
      hourlyTemps.push(temp == null ? Number.NaN : temp);
      hourlyPrecipProb.push(Number.isFinite(item.pop) ? Math.round(item.pop * 100) : Number.NaN);
      hourlyCodes.push(code);
      hourlyIsDay.push(1);

      if (!dailyByDate.has(localDate)) dailyByDate.set(localDate, { temps: [], codes: [], codeHours: [] });
      const day = dailyByDate.get(localDate)!;
      if (temp != null) day.temps.push(temp);
      if (code >= 0) {
        day.codes.push(code);
        day.codeHours.push(localHour);
      }
    }

    const dailyTimes = Array.from(dailyByDate.keys()).sort();
    const dailyCodes: number[] = [];
    const dailyMax: number[] = [];
    const dailyMin: number[] = [];
    const dailySunrise: string[] = [];
    const dailySunset: string[] = [];

    const formatOffsetTime = (timestamp: unknown): string => {
      if (typeof timestamp !== 'number' || !Number.isFinite(timestamp)) return 'Unavailable';
      return new Date((timestamp + timezoneOffset) * 1000).toISOString().slice(11, 16);
    };

    for (const date of dailyTimes) {
      const day = dailyByDate.get(date)!;
      // Use the available samples closest to local noon to represent a day's reported condition.
      let representativeCode = -1;
      if (day.codes.length) {
        const closestNoonIndex = day.codeHours.reduce((bestIndex, hour, index) =>
          Math.abs(hour - 12) < Math.abs(day.codeHours[bestIndex] - 12) ? index : bestIndex, 0);
        representativeCode = day.codes[closestNoonIndex];
      }
      dailyCodes.push(representativeCode);
      dailyMax.push(day.temps.length ? Math.max(...day.temps) : Number.NaN);
      dailyMin.push(day.temps.length ? Math.min(...day.temps) : Number.NaN);
      if (date === new Date((currentTimestamp + timezoneOffset) * 1000).toISOString().slice(0, 10)) {
        dailySunrise.push(formatOffsetTime(sunriseTimestamp));
        dailySunset.push(formatOffsetTime(sunsetTimestamp));
      } else {
        dailySunrise.push('Unavailable');
        dailySunset.push('Unavailable');
      }
    }

    const location = {
      name: currentData.name || forecastData.city?.name || name,
      country: currentData.sys?.country || forecastData.city?.country || country,
      admin1: '',
      latitude: lat,
      longitude: lon,
      timezone: 'UTC',
      timezoneOffsetSeconds: timezoneOffset
    };
    const hourly = {
      time: hourlyTimes,
      temperature_2m: hourlyTemps,
      precipitation_probability: hourlyPrecipProb,
      weather_code: hourlyCodes,
      is_day: hourlyIsDay
    };
    const daily = {
      time: dailyTimes,
      weather_code: dailyCodes,
      temperature_2m_max: dailyMax,
      temperature_2m_min: dailyMin,
      sunrise: dailySunrise,
      sunset: dailySunset,
      // This OpenWeather endpoint does not provide UV forecasts; don't fabricate them.
      uv_index_max: [] as number[]
    };
    const alerts = processWeatherAlerts({ location, current, hourly, daily });

    return {
      location,
      weather: { timezone: 'UTC', current, hourly, daily },
      alerts,
      providerInfo: {
        name: 'OpenWeather',
        credit: 'Powered by OpenWeather',
        disclaimer: 'Current observations are from OpenWeather; daily ranges are derived from available 3-hour forecast samples. UV forecast data is unavailable in this feed.'
      },
      source: 'live' as const
    };
  }

  // Accurate geocoding resolver for Open-Meteo with verified coordinates and fallback parsing
  async function resolveLocationWithOpenMeteo(query: string) {
    const defaultCities: Record<string, { lat: number; lon: number; name: string; country: string; admin1: string; timezone: string }> = {
      'kampala': { lat: 0.31628, lon: 32.58219, name: 'Kampala', country: 'Uganda', admin1: 'Central Region', timezone: 'Africa/Kampala' },
      'london': { lat: 51.5074, lon: -0.1278, name: 'London', country: 'United Kingdom', admin1: 'England', timezone: 'Europe/London' },
      'new york': { lat: 40.7128, lon: -74.0060, name: 'New York', country: 'United States', admin1: 'New York', timezone: 'America/New_York' },
      'tokyo': { lat: 35.6762, lon: 139.6503, name: 'Tokyo', country: 'Japan', admin1: 'Tokyo', timezone: 'Asia/Tokyo' },
      'paris': { lat: 48.8566, lon: 2.3522, name: 'Paris', country: 'France', admin1: 'Île-de-France', timezone: 'Europe/Paris' },
      'sydney': { lat: -33.8688, lon: 151.2093, name: 'Sydney', country: 'Australia', admin1: 'New South Wales', timezone: 'Australia/Sydney' },
      'berlin': { lat: 52.5200, lon: 13.4050, name: 'Berlin', country: 'Germany', admin1: 'Berlin', timezone: 'Europe/Berlin' },
      'reykjavik': { lat: 64.1466, lon: -21.9426, name: 'Reykjavik', country: 'Iceland', admin1: 'Capital Region', timezone: 'Atlantic/Reykjavik' },
      'dubai': { lat: 25.2048, lon: 55.2708, name: 'Dubai', country: 'United Arab Emirates', admin1: 'Dubai', timezone: 'Asia/Dubai' },
      'cairo': { lat: 30.0444, lon: 31.2357, name: 'Cairo', country: 'Egypt', admin1: 'Cairo Governorate', timezone: 'Africa/Cairo' }
    };

    const clean = query.trim().replace(/^[,\s.-]+|[?!.,\s-]+$/g, '');
    const cleanLower = clean.toLowerCase();
    const hasQualifier = clean.includes(',');
    const parts = clean.split(',');
    const cityPart = parts[0].trim();
    const qualifier = parts.slice(1).join(',').trim().toLowerCase();

    // Bundled coordinates are only safe for an exact, unqualified city query.
    if (!hasQualifier && defaultCities[cleanLower]) return defaultCities[cleanLower];

    const trySearch = async (term: string) => {
      try {
        const geoUrl = 'https://geocoding-api.open-meteo.com/v1/search?name=' + encodeURIComponent(term) + '&count=10&language=en&format=json';
        const geoRes = await fetchWithTimeout(geoUrl, {}, 4500);
        if (!geoRes.ok) return null;
        const geoData = await geoRes.json();
        return geoData.results && geoData.results.length > 0 ? geoData.results : null;
      } catch {
        return null;
      }
    };

    if (hasQualifier) {
      const candidates = await trySearch(cityPart);
      const matched = candidates?.find((r: any) =>
        [r.country, r.country_code, r.admin1, r.admin2].some((value: unknown) =>
          typeof value === 'string' && value.toLowerCase().includes(qualifier)
        )
      );
      if (matched) {
        return {
          lat: matched.latitude,
          lon: matched.longitude,
          name: matched.name,
          country: matched.country || '',
          admin1: matched.admin1 || '',
          timezone: matched.timezone || 'auto'
        };
      }
      throw new Error('Location "' + query + '" could not be resolved in the requested country or region.');
    }

    let results = await trySearch(clean);
    if (!results && /\b(city|town|province|state|district|area|region)\b/i.test(clean)) {
      const stripped = clean.replace(/\b(city|town|province|state|district|area|region)\b/gi, '').trim();
      if (stripped.length >= 2) results = await trySearch(stripped);
    }

    if (results && results.length > 0) {
      const best = results[0];
      return {
        lat: best.latitude,
        lon: best.longitude,
        name: best.name,
        country: best.country || '',
        admin1: best.admin1 || '',
        timezone: best.timezone || 'auto'
      };
    }

    throw new Error('Location "' + query + '" could not be resolved via Open-Meteo geocoding.');
  }

  // Helper for fetch with timeout (6000ms default)
  async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 6000): Promise<Response> {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(id);
      return res;
    } catch (err) {
      clearTimeout(id);
      throw err;
    }
  }

  // Helper to fetch weather via Open-Meteo with fallback protection
  async function fetchOpenMeteo(queryOrCoords: string | { lat: number; lon: number }, cityNameHint?: string) {
    let lat: number = 0.31628;
    let lon: number = 32.58219;
    let name = cityNameHint || '';
    let country = '';
    let admin1 = '';
    let timezone = 'auto';

    try {
      if (typeof queryOrCoords === 'string') {
        const resolved = await resolveLocationWithOpenMeteo(queryOrCoords);
        lat = resolved.lat;
        lon = resolved.lon;
        name = resolved.name;
        country = resolved.country;
        admin1 = resolved.admin1;
        timezone = resolved.timezone;
      } else {
        lat = queryOrCoords.lat;
        lon = queryOrCoords.lon;
        // The weather request is exact by coordinates. Do not infer a street/city
        // name for arbitrary map clicks without a compliant, configured geocoder.
        if (!name || name === 'Current Location' || name === 'Location') {
          name = 'Selected map point';
        }
      }

      const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m,wind_direction_10m,surface_pressure&hourly=temperature_2m,precipitation_probability,weather_code,is_day&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max&timezone=auto`;
      const weatherRes = await fetchWithTimeout(weatherUrl, {}, 6000);
      if (!weatherRes.ok) throw new Error(`Open-Meteo HTTP ${weatherRes.statusText}`);
      const weatherData = await weatherRes.json();

      const openMeteoLocation = {
        name,
        country,
        admin1,
        latitude: lat,
        longitude: lon,
        timezone: weatherData.timezone || timezone
      };

      const alerts = processWeatherAlerts({
        location: openMeteoLocation,
        current: weatherData.current,
        hourly: weatherData.hourly,
        daily: weatherData.daily
      });

      return {
        location: openMeteoLocation,
        weather: weatherData,
        alerts,
        providerInfo: {
          name: 'Open-Meteo',
          credit: 'Weather data by Open-Meteo.com',
          disclaimer: 'Open-Meteo public free weather API.'
        },
        source: 'live' as const
      };
    } catch (err: any) {
      console.warn(`[Open-Meteo Request Failed] ${err.message || err}. Letting the router try another provider.`);
      throw err;
    }
  }

  function mapWeatherAPIcode(code: number, _isDay: number): number {
    if (code === 1000) return 0;
    if (code === 1003) return 2;
    if ([1006, 1009].includes(code)) return 3;
    if (code === 1030 || code === 1135) return 45;
    if (code === 1147) return 48;
    if ([1072, 1168].includes(code)) return 56;
    if (code === 1171) return 57;
    if ([1150, 1153].includes(code)) return 51;
    if ([1063, 1180, 1183].includes(code)) return 61;
    if ([1186, 1189].includes(code)) return 63;
    if ([1192, 1195].includes(code)) return 65;
    if (code === 1198) return 66;
    if (code === 1201) return 67;
    if ([1066, 1069, 1114, 1117, 1204, 1207, 1210, 1213].includes(code)) return 71;
    if ([1216, 1219, 1222].includes(code)) return 73;
    if (code === 1225) return 75;
    if (code === 1237) return 77;
    if ([1240, 1249, 1261].includes(code)) return 80;
    if ([1243, 1252, 1264].includes(code)) return 81;
    if (code === 1246) return 82;
    if (code === 1255) return 85;
    if (code === 1258) return 86;
    if ([1087, 1273, 1276, 1279, 1282].includes(code)) return 95;
    return -1;
  }

  function mapOpenWeatherCode(conditionId?: number): number {
    if (conditionId == null || !Number.isFinite(conditionId)) return -1;
    if (conditionId >= 200 && conditionId < 300) return 95;
    if (conditionId >= 300 && conditionId < 400) return 51;
    if (conditionId >= 500 && conditionId < 600) return conditionId >= 502 ? 65 : 61;
    if (conditionId >= 600 && conditionId < 700) return conditionId >= 602 ? 75 : 71;
    if (conditionId >= 700 && conditionId < 800) return 45;
    if (conditionId === 800) return 0;
    if (conditionId === 801) return 1;
    if (conditionId === 802) return 2;
    if (conditionId >= 803 && conditionId < 900) return 3;
    return -1;
  }

  // Bounded LRU cache, request coalescing, and provider failover reduce latency and duplicate API usage.
  async function routeForecastRequest(fetcher: (provider: ProviderConfig) => Promise<any>, cacheKey: string) {
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      cache.delete(cacheKey);
      cache.set(cacheKey, cached);
      return cached.data;
    }

    const inFlight = inFlightWeatherRequests.get(cacheKey);
    if (inFlight) return inFlight;

    const request = (async () => {
      const eligibleProviders = getEligibleProviders();
      if (eligibleProviders.length === 0) {
        throw new Error('Temporary Weather Service Notice: All weather providers have reached their hourly usage budgets or are temporarily cooling down due to recent errors. Please try again shortly.');
      }

      let lastError: any = null;
      for (const provider of eligibleProviders) {
        try {
          recordProviderAttempt(provider.name);
          const result = await fetcher(provider);
          recordProviderSuccess(provider.name);
          saveWeatherCache(cacheKey, result);
          return result;
        } catch (err: any) {
          console.warn('[Provider Failure] Provider ' + provider.name + ' failed:', err.message);
          recordProviderError(provider.name);
          lastError = err;
        }
      }
      throw lastError || new Error('All eligible weather providers failed.');
    })();

    inFlightWeatherRequests.set(cacheKey, request);
    try {
      return await request;
    } finally {
      if (inFlightWeatherRequests.get(cacheKey) === request) inFlightWeatherRequests.delete(cacheKey);
    }
  }

  // Geocoding Autocomplete Search Endpoint for Header
  app.get('/api/weather/geocoding-search', async (req, res) => {
    try {
      const q = ((req.query.q as string) || '').trim();
      if (q.length < 2) {
        return res.json({ results: [] });
      }

      const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=8&language=en&format=json`;
      const geoRes = await fetchWithTimeout(geoUrl, {}, 4500);
      if (!geoRes.ok) return res.json({ results: [] });
      const data = await geoRes.json();
      const results = (data.results || []).map((r: any) => ({
        name: r.name,
        country: r.country || '',
        admin1: r.admin1 || '',
        lat: r.latitude,
        lon: r.longitude,
        timezone: r.timezone || 'auto'
      }));

      res.json({ results });
    } catch (err: any) {
      res.json({ results: [] });
    }
  });

  // IP Geolocation Endpoint (2nd priority fallback in progressive location strategy)
  app.get('/api/weather/ip-location', async (req, res) => {
    try {
      const ipRes = await fetchWithTimeout('http://ip-api.com/json/?fields=status,message,country,countryCode,regionName,city,district,lat,lon,timezone,query', {
        headers: { 'User-Agent': 'RODEX-Atmos-WeatherApp/1.0' }
      }, 4500);
      if (!ipRes.ok) {
        throw new Error('IP geolocation service unavailable');
      }
      const ipData = await ipRes.json();
      if (ipData.status !== 'success' || !Number.isFinite(ipData.lat) || !Number.isFinite(ipData.lon)) {
        throw new Error(ipData.message || 'Could not resolve network location from IP');
      }

      const lat = ipData.lat;
      const lon = ipData.lon;
      const cityName = ipData.city || 'Network Location';
      const countryName = ipData.country || '';

      const cacheKey = coordinateCacheKey(lat, lon);
      const result = await routeForecastRequest(async (provider) => {
        if (provider.name === 'WeatherAPI.com') {
          return await fetchWeatherAPI({ lat, lon });
        } else if (provider.name === 'OpenWeather') {
          return await fetchOpenWeather({ lat, lon }, `${cityName}, ${countryName}`);
        } else {
          return await fetchOpenMeteo({ lat, lon }, cityName);
        }
      }, cacheKey);

      res.json({
        ...result,
        location: { ...result.location, isApproximateNetwork: true, detectedIP: ipData.query }
      });
    } catch (error: any) {
      console.warn('IP geolocation error, falling back:', error.message);
      res.status(503).json({
        error: 'IP_LOCATION_FAILED',
        message: error.message || 'Unable to retrieve approximate network location'
      });
    }
  });

  // Search Endpoint
  app.get('/api/weather/search', async (req, res) => {
    try {
      const query = req.query.query as string;
      if (!query || query.trim().length === 0) {
        return res.status(400).json({ error: 'Query parameter is required' });
      }

      const cacheKey = `search:${normalizeWeatherQuery(query)}`;
      const result = await routeForecastRequest(async (provider) => {
        if (provider.name === 'WeatherAPI.com') {
          return await fetchWeatherAPI(query);
        } else if (provider.name === 'OpenWeather') {
          return await fetchOpenWeather(query);
        } else {
          return await fetchOpenMeteo(query);
        }
      }, cacheKey);

      res.json(result);
    } catch (error: any) {
      console.error('Weather router search error:', error);
      if (error.message && error.message.includes('Temporary Weather Service Notice')) {
        return res.status(503).json({ 
          error: 'SERVICE_UNAVAILABLE', 
          message: error.message 
        });
      }
      res.status(500).json({ error: error.message || 'Failed to fetch weather data from providers' });
    }
  });

  // Coordinates Endpoint
  app.get('/api/weather/coordinates', async (req, res) => {
    try {
      const lat = Number(req.query.lat);
      const lon = Number(req.query.lon);
      const cityName = (req.query.name as string) || 'Selected map point';

      if (req.query.lat == null || req.query.lon == null ||
          !Number.isFinite(lat) || !Number.isFinite(lon) ||
          lat < -90 || lat > 90 || lon < -180 || lon > 180) {
        return res.status(400).json({ error: 'Latitude must be between -90 and 90 and longitude between -180 and 180.' });
      }

      const cacheKey = coordinateCacheKey(lat, lon);
      const result = await routeForecastRequest(async (provider) => {
        if (provider.name === 'WeatherAPI.com') {
          return await fetchWeatherAPI({ lat, lon });
        } else if (provider.name === 'OpenWeather') {
          return await fetchOpenWeather({ lat, lon }, cityName);
        } else {
          return await fetchOpenMeteo({ lat, lon }, cityName);
        }
      }, cacheKey);

      res.json(result);
    } catch (error: any) {
      console.error('Weather router coordinates error:', error);
      if (error.message && error.message.includes('Temporary Weather Service Notice')) {
        return res.status(503).json({ 
          error: 'SERVICE_UNAVAILABLE', 
          message: error.message 
        });
      }
      res.status(500).json({ error: error.message || 'Failed to fetch weather for coordinates' });
    }
  });

  // Deterministic weather advice is a safe fallback when AI is unavailable.
  function generateWeatherInsights(location: any, current: any, daily: any) {
    const tempValue = current?.temperature_2m;
    const humidityValue = current?.relative_humidity_2m;
    const codeValue = current?.weather_code;
    const uvValue = daily?.uv_index_max?.[0];
    const temp = typeof tempValue === 'number' && Number.isFinite(tempValue) ? tempValue : null;
    const humidity = typeof humidityValue === 'number' && Number.isFinite(humidityValue) ? humidityValue : null;
    const code = typeof codeValue === 'number' && Number.isFinite(codeValue) && codeValue >= 0 ? codeValue : null;
    const uv = typeof uvValue === 'number' && Number.isFinite(uvValue) ? uvValue : null;
    const locName = location?.name || 'this location';
    const condition = code == null ? 'conditions unavailable' : getWeatherConditionLabel(code, current?.is_day ?? 1);

    let summary: string;
    if (temp == null && code == null) {
      summary = 'The latest weather measurements for ' + locName + ' are incomplete. Refresh the forecast to get a reliable update.';
    } else if (temp == null) {
      summary = 'Current conditions in ' + locName + ' are reported as ' + condition.toLowerCase() + '; temperature data is unavailable.';
    } else {
      const feel = temp > 28 ? 'hot' : temp > 22 ? 'warm' : temp > 15 ? 'mild' : 'cool';
      summary = 'Current conditions in ' + locName + ' are ' + (code == null ? feel : condition.toLowerCase()) + ' at ' + Math.round(temp) + '°C.';
      if (humidity != null) summary += ' Relative humidity is ' + Math.round(humidity) + '%.';
    }

    let clothing = temp == null
      ? 'Current temperature data is unavailable, so a precise temperature-based clothing recommendation is not possible.'
      : temp < 8
        ? 'Consider a warm coat and insulating layers for the cold.'
        : temp < 16
          ? 'A sweater or light-to-medium jacket should be comfortable.'
          : temp > 28
            ? 'Choose breathable, lightweight clothing and consider sun protection.'
            : temp > 24
              ? 'Breathable, lightweight clothing should be comfortable.'
              : 'Comfortable light layers are a reasonable choice.';
    if (code != null && ((code >= 51 && code <= 67) || (code >= 80 && code <= 82))) {
      clothing += ' Consider carrying an umbrella or rain shell.';
    }

    let activities = 'Check the hourly forecast before making weather-sensitive outdoor plans.';
    if (code != null && (code === 95 || code === 96 || code === 99)) {
      activities = 'Avoid exposed outdoor areas during thunderstorms and wait for conditions to improve.';
    } else if (code != null && ((code >= 51 && code <= 67) || (code >= 80 && code <= 82))) {
      activities = 'Consider indoor activities while rain is reported or forecast.';
    } else if (temp != null && temp > 32) {
      activities = 'Prefer shade and lower-intensity outdoor activities during the hottest hours.';
    } else if (code != null && code >= 0 && code <= 3 && temp != null) {
      activities = 'Outdoor activities may be comfortable; check the hourly forecast for changes.';
    }

    let health = 'Follow the latest local forecast and stay hydrated as appropriate.';
    if (uv != null && uv >= 6) {
      health = 'The forecast UV index reaches ' + Math.round(uv) + '. Use sun protection, including shade, suitable clothing, and sunscreen.';
    } else if (humidity != null && humidity > 80) {
      health = 'Humidity is high (' + Math.round(humidity) + '%); take breaks and stay hydrated during strenuous activity.';
    } else if (temp != null && temp >= 32) {
      health = 'Warm conditions are reported. Drink water regularly and take breaks in shade.';
    } else if (uv == null) {
      health = 'UV forecast data is unavailable; consider checking a local UV forecast before extended sun exposure.';
    }

    return { summary, clothing, activities, health };
  }

  // AI Insights endpoint using @google/genai with automatic quota failover
  app.post('/api/ai/insights', async (req, res) => {
    const { location, current, daily } = req.body || {};
    if (!location || !current) {
      return res.status(400).json({ error: 'Location and current weather measurements are required.' });
    }

    const insightsCacheKey = 'ai:insights:' + JSON.stringify([
      location.name, location.country, location.latitude, location.longitude,
      current.temperature_2m, current.apparent_temperature, current.relative_humidity_2m,
      current.wind_speed_10m, current.precipitation, current.weather_code,
      daily?.uv_index_max?.[0]
    ]);
    const cachedInsights = cache.get(insightsCacheKey);
    if (cachedInsights && Date.now() - cachedInsights.timestamp < CACHE_TTL_MS) {
      cache.delete(insightsCacheKey);
      cache.set(insightsCacheKey, cachedInsights);
      return res.json(cachedInsights.data);
    }
    const sendFallbackInsights = () => {
      const payload = generateWeatherInsights(location, current, daily);
      saveWeatherCache(insightsCacheKey, payload);
      return res.json(payload);
    };
    if (!ai) {
      return sendFallbackInsights();
    }

    try {
      const prompt = `You are RODEX Atmos AI, an expert meteorologist and lifestyle assistant. 
Analyze these current weather conditions for ${location?.name || 'Location'}:
- Temperature: ${typeof current?.temperature_2m === 'number' && Number.isFinite(current.temperature_2m) ? current.temperature_2m + '°C' : 'unavailable'}
- Feels-like temperature: ${typeof current?.apparent_temperature === 'number' && Number.isFinite(current.apparent_temperature) ? current.apparent_temperature + '°C' : 'unavailable'}
- Humidity: ${typeof current?.relative_humidity_2m === 'number' && Number.isFinite(current.relative_humidity_2m) ? current.relative_humidity_2m + '%' : 'unavailable'}
- Wind Speed: ${typeof current?.wind_speed_10m === 'number' && Number.isFinite(current.wind_speed_10m) ? current.wind_speed_10m + ' km/h' : 'unavailable'}
- Weather Code: ${current?.weather_code ?? 'unavailable'}
- UV Index max: ${typeof daily?.uv_index_max?.[0] === 'number' && Number.isFinite(daily.uv_index_max[0]) ? daily.uv_index_max[0] : 'unavailable'}

Use only supplied data. Never invent missing measurements, claim rain from probability alone, or manufacture official warnings.
Provide a JSON response with exactly these 4 keys:
1. "summary": A poetic and informative 2-sentence atmospheric summary of the current vibe and conditions.
2. "clothing": Specific clothing recommendations (layers, jacket, umbrella, sunglasses, etc.).
3. "activities": Best outdoor or indoor activities suited for today.
4. "health": Health or comfort tips (e.g., UV protection, hydration, allergen notes).

Return ONLY valid JSON with keys: summary, clothing, activities, health. No markdown code blocks around the JSON if possible, or clean JSON object.`;

      let response: any;
      try {
        response = await withTimeout(ai.models.generateContent({
          model: 'gemini-3.1-flash-lite',
          contents: prompt,
          config: { responseMimeType: 'application/json', temperature: 0.2, maxOutputTokens: 220 }
        }), 3200, 'AI insights');
      } catch (liteErr: any) {
        // Do not stack a second slow request after a timeout; deterministic insights are faster and safer.
        if (String(liteErr?.message || liteErr).toLowerCase().includes('timed out')) throw liteErr;
        response = await withTimeout(ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: prompt,
          config: { responseMimeType: 'application/json', temperature: 0.2, maxOutputTokens: 220 }
        }), 2200, 'AI insights fallback');
      }

      const text = response?.text;
      const parsed = JSON.parse(text || '{}');
      if (parsed.summary && parsed.clothing && parsed.activities && parsed.health) {
        saveWeatherCache(insightsCacheKey, parsed);
        return res.json(parsed);
      }
      return sendFallbackInsights();
    } catch (err: any) {
      // A bounded, deterministic fallback is more useful than surfacing quota and timeout errors.
      return sendFallbackInsights();
    }
  });

  // Daily weather briefing generation endpoint
  app.post('/api/ai/briefing', async (req, res) => {
    const { location, current, daily, hourly, alerts } = req.body || {};
    if (!location || !current) {
      return res.status(400).json({ error: 'Missing required weather parameters for daily briefing.' });
    }

    const rainWindowStartIndex = findCurrentHourlyIndex(hourly?.time, current?.time);
    const briefingCacheKey = 'ai:briefing:' + JSON.stringify([
      location.name, location.country, location.latitude, location.longitude,
      current.temperature_2m, current.apparent_temperature, current.relative_humidity_2m,
      current.wind_speed_10m, current.precipitation, current.weather_code,
      daily?.temperature_2m_max?.[0], daily?.temperature_2m_min?.[0], daily?.uv_index_max?.[0],
      Array.isArray(hourly?.precipitation_probability) ? hourly.precipitation_probability.slice(rainWindowStartIndex, rainWindowStartIndex + 12) : [],
      Array.isArray(alerts) ? alerts.map((alert: any) => [alert.type, alert.severity, alert.title, alert.description]) : []
    ]);
    const cachedBriefing = cache.get(briefingCacheKey);
    if (cachedBriefing && Date.now() - cachedBriefing.timestamp < CACHE_TTL_MS) {
      cache.delete(briefingCacheKey);
      cache.set(briefingCacheKey, cachedBriefing);
      return res.json(cachedBriefing.data);
    }

    const rawHigh = daily?.temperature_2m_max?.[0];
    const rawLow = daily?.temperature_2m_min?.[0];
    const rawCurrentTemp = current?.temperature_2m;
    const highTemp = typeof rawHigh === 'number' && Number.isFinite(rawHigh) ? Math.round(rawHigh) : null;
    const lowTemp = typeof rawLow === 'number' && Number.isFinite(rawLow) ? Math.round(rawLow) : null;
    const currentTemp = typeof rawCurrentTemp === 'number' && Number.isFinite(rawCurrentTemp) ? Math.round(rawCurrentTemp) : null;
    const rainProbabilities = Array.isArray(hourly?.precipitation_probability)
      ? hourly.precipitation_probability.slice(rainWindowStartIndex, rainWindowStartIndex + 12).filter((value: unknown): value is number => typeof value === 'number' && Number.isFinite(value))
      : [];
    const maxPrecipProb = rainProbabilities.length ? Math.max(...rainProbabilities) : null;
    const rawWind = current?.wind_speed_10m;
    const windSpeed = typeof rawWind === 'number' && Number.isFinite(rawWind) ? Math.round(rawWind) : null;

    let rainLikelihood = 'Rain probability data is unavailable.';
    if (maxPrecipProb != null) {
      if (maxPrecipProb >= 70) {
        rainLikelihood = 'High likelihood of rain (' + maxPrecipProb + '% peak chance) in the next 12 hours.';
      } else if (maxPrecipProb >= 40) {
        rainLikelihood = 'Moderate chance of rain (' + maxPrecipProb + '% peak chance) in the next 12 hours.';
      } else if (maxPrecipProb >= 20) {
        rainLikelihood = 'Lower but non-zero rain chance (' + maxPrecipProb + '% peak chance) in the next 12 hours.';
      } else {
        rainLikelihood = 'Peak rain probability over the next 12 hours is ' + maxPrecipProb + '%.';
      }
    }

    const windCondition = windSpeed == null
      ? 'Wind speed data is unavailable.'
      : windSpeed > 30
        ? 'Strong winds are reported at about ' + windSpeed + ' km/h.'
        : 'Wind speed is about ' + windSpeed + ' km/h.';

    const topAlert = Array.isArray(alerts) && alerts.length > 0 ? alerts[0] : null;
    const headlineAlert = topAlert ? `[${topAlert.type === 'official' ? 'Official Warning' : 'Forecast Alert'}] ${topAlert.title}: ${topAlert.description}` : undefined;

    let greetingTime = 'Good day';
    const localClock = normalizeForecastLocalTime(current?.time);
    const localHour = localClock ? Number(localClock.slice(11, 13)) : Number.NaN;
    const hour = Number.isFinite(localHour) ? localHour : new Date().getHours();
    if (hour < 12) greetingTime = 'Good morning';
    else if (hour < 18) greetingTime = 'Good afternoon';
    else greetingTime = 'Good evening';

    if (ai) {
      try {
        const prompt = `Generate a concise, professional 2-sentence daily weather briefing for ${location.name}, ${location.country || ''}.
Current temperature: ${currentTemp == null ? 'unavailable' : currentTemp + '°C'}.
Forecast high: ${highTemp == null ? 'unavailable' : highTemp + '°C'}; forecast low: ${lowTemp == null ? 'unavailable' : lowTemp + '°C'}.
Peak rain probability in the next 12 hours: ${maxPrecipProb == null ? 'unavailable' : maxPrecipProb + '%'}.
Wind speed: ${windSpeed == null ? 'unavailable' : windSpeed + ' km/h'}.
Weather condition code: ${current?.weather_code ?? 'unavailable'}.
Active alert records: ${headlineAlert || 'No alert records supplied; do not claim an official all-clear'}.
Greeting: ${greetingTime}.
Use only supplied facts. Do not invent missing numbers, weather conditions, or official warnings.
Format: Return strict JSON with keys: "greeting", "summary", "recommendations" (array of 2 short actionable recommendations).`;

        const aiRes = await withTimeout(ai.models.generateContent({
          model: 'gemini-3.1-flash-lite',
          contents: prompt,
          config: { responseMimeType: 'application/json', temperature: 0.2, maxOutputTokens: 160 }
        }), 3200, 'Daily briefing AI');

        const parsed = JSON.parse(aiRes.text || '{}');
        if (parsed.summary && Array.isArray(parsed.recommendations)) {
          const payload = {
            greeting: parsed.greeting || `${greetingTime}, ${location.name}`,
            locationName: location.name,
            summary: parsed.summary,
            highTemp,
            lowTemp,
            rainLikelihood,
            windCondition,
            headlineAlert,
            recommendations: parsed.recommendations,
            generatedAt: new Date().toISOString()
          };
          saveWeatherCache(briefingCacheKey, payload);
          return res.json(payload);
        }
      } catch (err) {
        console.warn('[Briefing AI Warning] Gemini briefing fallback activated:', err);
      }
    }

    // Deterministic fallback briefing
    const payload = {
      greeting: `${greetingTime}, ${location.name}`,
      locationName: location.name,
      summary: (() => {
        const conditions = current?.weather_code != null && current.weather_code >= 0
          ? getWeatherConditionLabel(current.weather_code, current.is_day).toLowerCase()
          : 'conditions unavailable';
        const temperatureRange = highTemp != null && lowTemp != null
          ? 'a forecast high of ' + highTemp + '°C and low of ' + lowTemp + '°C'
          : 'forecast high and low temperatures unavailable';
        return location.name + ' has ' + temperatureRange + ', with ' + conditions + ' reported in the current data.';
      })(),
      highTemp,
      lowTemp,
      rainLikelihood,
      windCondition,
      headlineAlert,
      recommendations: [
        maxPrecipProb != null && maxPrecipProb >= 40 ? 'Consider carrying rain protection based on the forecast rain probability.' : 'Check the hourly forecast before weather-sensitive outdoor plans.',
        windSpeed != null && windSpeed > 30 ? 'Take care outdoors because elevated wind speeds are reported.' : 'Recheck the forecast for any later weather changes.'
      ],
      generatedAt: new Date().toISOString()
    };
    saveWeatherCache(briefingCacheKey, payload);
    return res.json(payload);
  });

  // Configured vocal identity: RODEX Atmos Signature (voice_nv4v693k2132)
  const rawVoiceEnv = process.env.ATMOS_SIGNATURE_VOICE_ID?.trim();
  const ATMOS_SIGNATURE_VOICE_ID = (rawVoiceEnv && rawVoiceEnv.startsWith('voice_') && rawVoiceEnv.length < 50)
    ? rawVoiceEnv
    : DEFAULT_ATMOS_SIGNATURE_VOICE_ID;

  // Voice readiness status endpoint (checks presence of GEMINI_API_KEY and signature voice configuration)
  app.get('/api/ai/live-status', (req, res) => {
    const isConfigured = !!ai;
    res.json({
      supported: isConfigured,
      hasServerKey: isConfigured,
      model: 'gemini-3.8-live',
      signatureVoice: {
        id: ATMOS_SIGNATURE_VOICE_ID,
        name: 'RODEX Atmos Signature',
        type: 'prompted',
        gender: 'female',
        ttsModel: ATMOS_SIGNATURE_TTS_MODEL,
        liveFallbackVoice: ATMOS_SIGNATURE_LIVE_VOICE,
        hasAuditionSample: true,
        auditionUrl: '/atmos-signature-audition.wav'
      },
      message: isConfigured
        ? 'Gemini Live voice service and RODEX Atmos Signature voice are configured and ready.'
        : 'GEMINI_API_KEY is not configured in server secrets. Add your key to server secrets to enable live voice.'
    });
  });

  // Get metadata and audition sample info for the RODEX Atmos Signature voice
  app.get('/api/ai/voice-signature', async (req, res) => {
    res.json({
      id: ATMOS_SIGNATURE_VOICE_ID,
      displayName: 'RODEX Atmos Signature',
      gender: 'female',
      languageCode: 'en-US',
      context: 'Conversational',
      type: 'prompted',
      ttsModel: ATMOS_SIGNATURE_TTS_MODEL,
      liveVoice: ATMOS_SIGNATURE_LIVE_VOICE,
      description: 'A modern feminine assistant voice with warm brightness, upbeat energy, expressive natural rhythm, crisp articulation and a confident playful spark.',
      hasAuditionSample: true,
      auditionUrl: '/atmos-signature-audition.wav'
    });
  });

  // Per-model cooldowns avoid repeatedly retrying unavailable TTS tiers.
  const ttsModelCooldowns = new Map<string, number>();
  const ttsVoiceCooldowns = new Map<string, number>();

  // Short-lived, bounded cache helps greetings feel instant without retaining a large chat history.
  interface CachedAudioEntry {
    audio: string;
    mimeType: string;
    voiceId: string;
    voiceName: string;
    timestamp: number;
  }
  const synthAudioCache = new Map<string, CachedAudioEntry>();
  const TTS_CACHE_TTL_MS = 10 * 60 * 1000;
  const TTS_CACHE_MAX_ENTRIES = 48;
  const TTS_CACHE_MAX_TEXT_LENGTH = 160;
  const TTS_TOTAL_BUDGET_MS = 4800;
  const TTS_REQUEST_TIMEOUT_MS = 3000;

  interface InternalSynthesisResult {
    audio: string | null;
    mimeType: string;
    latencyMs: number;
    voiceId: string;
    voiceName: string;
    fallbackToWebSpeech?: boolean;
    message?: string;
  }

  function voiceCacheKey(voiceId: string, text: string, style: string): string {
    return voiceId + ':' + text.trim().toLowerCase() + ':' + style;
  }

  function readCachedAudio(key: string): CachedAudioEntry | null {
    const cached = synthAudioCache.get(key);
    if (!cached) return null;
    if (Date.now() - cached.timestamp > TTS_CACHE_TTL_MS) {
      synthAudioCache.delete(key);
      return null;
    }
    return cached;
  }

  function storeCachedAudio(key: string, entry: CachedAudioEntry): void {
    if (synthAudioCache.size >= TTS_CACHE_MAX_ENTRIES) {
      const oldest = [...synthAudioCache.entries()]
        .sort((a, b) => a[1].timestamp - b[1].timestamp)
        .slice(0, Math.max(1, Math.floor(TTS_CACHE_MAX_ENTRIES / 5)));
      oldest.forEach(([oldKey]) => synthAudioCache.delete(oldKey));
    }
    synthAudioCache.set(key, entry);
  }

  // Uses the current Gemini TTS Interactions API so delivery style is metadata, not spoken text.
  async function synthesizeSpeechInternal(text: string, style?: string): Promise<InternalSynthesisResult> {
    const cleanText = typeof text === 'string' ? text.trim() : '';
    if (!cleanText) {
      return {
        audio: null,
        mimeType: 'audio/wav',
        latencyMs: 0,
        voiceId: ATMOS_SIGNATURE_VOICE_ID,
        voiceName: 'RODEX Atmos Signature',
        fallbackToWebSpeech: true,
        message: 'Empty text prompt'
      };
    }

    if (!ai) {
      return {
        audio: null,
        mimeType: 'audio/wav',
        latencyMs: 0,
        voiceId: ATMOS_SIGNATURE_VOICE_ID,
        voiceName: 'RODEX Atmos Signature',
        fallbackToWebSpeech: true,
        message: 'Gemini API key is not configured.'
      };
    }

    const tStart = Date.now();
    const styleInstruction = style && style.trim() ? style.trim() : ATMOS_SIGNATURE_STYLE;
    const signatureCacheKey = voiceCacheKey(ATMOS_SIGNATURE_VOICE_ID, cleanText, styleInstruction);
    const fallbackCacheKey = voiceCacheKey(ATMOS_SIGNATURE_LIVE_VOICE, cleanText, styleInstruction);

    // Only cache short utterances such as greetings. Dynamic longer responses are never retained.
    if (cleanText.length <= TTS_CACHE_MAX_TEXT_LENGTH) {
      const cached = readCachedAudio(signatureCacheKey) || readCachedAudio(fallbackCacheKey);
      if (cached) {
        return {
          audio: cached.audio,
          mimeType: cached.mimeType,
          latencyMs: 0,
          voiceId: cached.voiceId,
          voiceName: cached.voiceName
        };
      }
    }

    const trySynthesis = async (model: string, voice: string): Promise<{ audio: string; mimeType: string }> => {
      const interactions = (ai as any).interactions;
      if (!interactions || typeof interactions.create !== 'function') {
        throw new Error('Gemini TTS Interactions API is unavailable in the installed SDK.');
      }

      const remainingBudgetMs = TTS_TOTAL_BUDGET_MS - (Date.now() - tStart);
      if (remainingBudgetMs < 900) throw new Error('Atmos TTS total time budget reached.');

      const interaction = await interactions.create({
        model,
        input: [{
          type: 'user_input',
          content: [{
            type: 'text',
            text: cleanText,
            annotations: [{
              type: 'speech_metadata',
              style: styleInstruction
            }]
          }]
        }],
        response_format: { type: 'audio' },
        generation_config: {
          speech_config: [{ voice }]
        }
      }, {
        timeout_ms: Math.min(TTS_REQUEST_TIMEOUT_MS, remainingBudgetMs),
        retries: 0
      });

      const outputAudio = interaction && interaction.output_audio;
      const audio = outputAudio && outputAudio.data;
      if (typeof audio !== 'string' || audio.length === 0) {
        throw new Error('TTS model ' + model + ' returned no audio for voice ' + voice + '.');
      }

      return {
        audio,
        mimeType: (outputAudio && (outputAudio.mime_type || outputAudio.mimeType)) || 'audio/wav'
      };
    };

    const models = [
      { name: ATMOS_SIGNATURE_TTS_MODEL, cooldownMs: 15 * 60 * 1000 },
      { name: 'gemini-3.8-flash-tts', cooldownMs: 2 * 60 * 1000 }
    ];
    let audioData: string | null = null;
    let mimeType = 'audio/wav';
    let usedVoiceName = 'RODEX Atmos Signature';
    let usedVoiceId = ATMOS_SIGNATURE_VOICE_ID;

    for (const model of models) {
      if (Date.now() - tStart >= TTS_TOTAL_BUDGET_MS) break;
      if (Date.now() < (ttsModelCooldowns.get(model.name) || 0)) continue;
      let tierCooldownMs = model.cooldownMs;

      const primaryVoiceKey = model.name + ':' + ATMOS_SIGNATURE_VOICE_ID;
      if (Date.now() >= (ttsVoiceCooldowns.get(primaryVoiceKey) || 0)) {
        try {
          const result = await trySynthesis(model.name, ATMOS_SIGNATURE_VOICE_ID);
          audioData = result.audio;
          mimeType = result.mimeType;
          usedVoiceName = 'RODEX Atmos Signature';
          usedVoiceId = ATMOS_SIGNATURE_VOICE_ID;
        } catch (primaryError: any) {
          const errMsg = primaryError && primaryError.message ? primaryError.message : String(primaryError);
          const isQuotaError = /429|RESOURCE_EXHAUSTED|rate.?limit|quota/i.test(errMsg);
          const isTimeoutError = /timeout|timed out|deadline|time budget/i.test(errMsg);
          tierCooldownMs = isQuotaError ? 15 * 60 * 1000 : (isTimeoutError ? 30 * 1000 : tierCooldownMs);
          ttsVoiceCooldowns.set(primaryVoiceKey, Date.now() + (isQuotaError ? 15 * 60 * 1000 : (isTimeoutError ? 30 * 1000 : 10 * 60 * 1000)));

          if (isQuotaError) {
            ttsModelCooldowns.set(model.name, Date.now() + 15 * 60 * 1000);
            console.warn('[RODEX TTS] ' + model.name + ' reached quota; switching to the next tier.');
            continue;
          }
          console.warn('[RODEX TTS] Custom Atmos voice unavailable on this tier; trying the upbeat feminine fallback.');
        }
      }

      if (audioData || Date.now() - tStart >= TTS_TOTAL_BUDGET_MS) break;

      const fallbackVoiceKey = model.name + ':' + ATMOS_SIGNATURE_LIVE_VOICE;
      if (Date.now() >= (ttsVoiceCooldowns.get(fallbackVoiceKey) || 0)) {
        try {
          const result = await trySynthesis(model.name, ATMOS_SIGNATURE_LIVE_VOICE);
          audioData = result.audio;
          mimeType = result.mimeType;
          usedVoiceName = ATMOS_SIGNATURE_LIVE_VOICE + ' (upbeat feminine fallback)';
          usedVoiceId = ATMOS_SIGNATURE_LIVE_VOICE;
        } catch (fallbackError: any) {
          const errMsg = fallbackError && fallbackError.message ? fallbackError.message : String(fallbackError);
          const isQuotaError = /429|RESOURCE_EXHAUSTED|rate.?limit|quota/i.test(errMsg);
          const isTimeoutError = /timeout|timed out|deadline|time budget/i.test(errMsg);
          tierCooldownMs = isQuotaError ? 15 * 60 * 1000 : (isTimeoutError ? 30 * 1000 : tierCooldownMs);
          ttsVoiceCooldowns.set(fallbackVoiceKey, Date.now() + (isQuotaError ? 15 * 60 * 1000 : (isTimeoutError ? 30 * 1000 : 5 * 60 * 1000)));
          if (isQuotaError) ttsModelCooldowns.set(model.name, Date.now() + 15 * 60 * 1000);
          console.warn('[RODEX TTS] ' + model.name + ' ' + ATMOS_SIGNATURE_LIVE_VOICE + ' fallback unavailable:', errMsg.slice(0, 120));
        }
      }

      if (audioData) break;
      if (Date.now() - tStart >= TTS_TOTAL_BUDGET_MS) break;
      if (Date.now() >= (ttsModelCooldowns.get(model.name) || 0)) {
        ttsModelCooldowns.set(model.name, Date.now() + tierCooldownMs);
      }
    }

    if (!audioData) {
      return {
        audio: null,
        mimeType: 'audio/wav',
        latencyMs: Date.now() - tStart,
        voiceId: ATMOS_SIGNATURE_VOICE_ID,
        voiceName: 'RODEX Atmos Signature',
        fallbackToWebSpeech: true,
        message: 'Gemini TTS is temporarily unavailable; use the configured browser voice fallback.'
      };
    }

    if (cleanText.length <= TTS_CACHE_MAX_TEXT_LENGTH) {
      const actualCacheKey = voiceCacheKey(usedVoiceId, cleanText, styleInstruction);
      storeCachedAudio(actualCacheKey, {
        audio: audioData,
        mimeType,
        voiceId: usedVoiceId,
        voiceName: usedVoiceName,
        timestamp: Date.now()
      });
    }

    return {
      audio: audioData,
      mimeType,
      latencyMs: Date.now() - tStart,
      voiceId: usedVoiceId,
      voiceName: usedVoiceName
    };
  }

  // Synthesize speech endpoint using RODEX Atmos Signature voice.
  // Bound input size so accidental long transcripts cannot make voice replies feel unresponsive.
  app.post('/api/ai/synthesize-speech', async (req, res) => {
    const { text, style } = req.body || {};
    if (typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ error: 'A non-empty text prompt is required for speech synthesis.' });
    }
    if (text.length > 2500) {
      return res.status(413).json({ error: 'Speech text is too long. Keep read-aloud requests under 2500 characters.' });
    }
    if (style != null && (typeof style !== 'string' || style.length > 400)) {
      return res.status(400).json({ error: 'Speech style must be a short string of 400 characters or fewer.' });
    }

    try {
      const result = await synthesizeSpeechInternal(text.trim(), style);
      res.json(result);
    } catch (err: any) {
      console.warn('[RODEX Speech Synthesis Warning]', err?.message || err);
      res.json({
        audio: null,
        mimeType: 'audio/wav',
        voiceId: ATMOS_SIGNATURE_VOICE_ID,
        voiceName: 'RODEX Atmos Signature',
        fallbackToWebSpeech: true,
        message: 'Speech synthesis fell back to browser voice.'
      });
    }
  });

  // Short-lived ephemeral token endpoint for browser-based Live API voice sessions
  app.post('/api/ai/live-token', async (req, res) => {
    try {
      if (!ai) {
        return res.status(503).json({
          error: 'AI_NOT_CONFIGURED',
          message: 'GEMINI_API_KEY is not configured on the server. Please add your key to server secrets to enable live voice conversation.'
        });
      }

      // Constrain ephemeral token: single-use, 10-minute expiry
      const token = await ai.authTokens.create({
        config: {
          uses: 1,
          newSessionExpireTime: new Date(Date.now() + 10 * 60 * 1000).toISOString()
        }
      });

      // Never expose or return the long-lived API key to client
      res.json({
        token: token.name,
        model: 'gemini-3.8-live'
      });
    } catch (err: any) {
      console.error('Live token generation error:', err);
      res.status(500).json({
        error: 'TOKEN_CREATION_FAILED',
        message: err.message || 'Failed to generate ephemeral session token for Gemini Live.'
      });
    }
  });

  // Helper to map WMO code to human-readable condition text
  function getWeatherConditionLabel(code: number, isDay: number = 1): string {
    switch (code) {
      case 0:
        return isDay ? 'Sunny & Clear' : 'Clear Night';
      case 1:
      case 2:
        return isDay ? 'Partly Cloudy' : 'Partly Cloudy Night';
      case 3:
        return 'Overcast Clouds';
      case 45:
      case 48:
        return 'Foggy & Misty';
      case 51:
        return 'Light Drizzle';
      case 53:
        return 'Moderate Drizzle';
      case 55:
        return 'Dense Drizzle';
      case 56:
        return 'Light Freezing Drizzle';
      case 57:
        return 'Dense Freezing Drizzle';
      case 61:
        return 'Light Rain';
      case 63:
        return 'Moderate Rain';
      case 65:
        return 'Heavy Rain';
      case 66:
        return 'Light Freezing Rain';
      case 67:
        return 'Heavy Freezing Rain';
      case 71:
        return 'Light Snowfall';
      case 73:
        return 'Moderate Snowfall';
      case 75:
        return 'Heavy Snowfall';
      case 77:
        return 'Snow Grains';
      case 80:
        return 'Light Rain Showers';
      case 81:
        return 'Moderate Rain Showers';
      case 82:
        return 'Intense Rain Showers';
      case 85:
        return 'Light Snow Showers';
      case 86:
        return 'Heavy Snow Showers';
      case 95:
        return 'Thunderstorm';
      case 96:
        return 'Thunderstorm with Hail';
      case 99:
        return 'Severe Thunderstorm with Hail';
      default:
        return 'Conditions Unavailable';
    }
  }

  // Clean extracted city names by stripping trailing question words and temporal modifiers
  function cleanExtractedCity(raw: string): string | null {
    if (!raw) return null;
    let city = raw.trim().replace(/^[,\s.-]+|[?!.,\s-]+$/g, '');
    const stopWordsPattern = /\b(?:right now|today|tomorrow|tonight|this evening|this afternoon|this morning|this week|this weekend|currently|at the moment|at present|please|for me|tell me|forecast|weather|conditions|temp|temperature)\b/gi;
    city = city.replace(stopWordsPattern, '').trim();
    city = city.replace(/^[,\s.-]+|[?!.,\s-]+$/g, '');
    return city.length >= 2 ? city : null;
  }

  // City extraction helper to identify requested cities from user queries
  function extractCityFromQuery(text: string): string | null {
    if (!text) return null;
    const patterns = [
      /(?:weather|forecast|temperature|conditions|temp|rain|snow|how is it|what is it like|what's it like|what's the weather|what is the weather|how's the weather|how is the weather|tell me (?:about )?(?:the )?weather|check (?:the )?weather|check)\s+(?:in|for|at|around|of)\s+([a-zA-Z\s.,'-]+)/i,
      /(?:is it\s+(?:raining|snowing|hot|cold|warm|sunny|cloudy|windy|nice)\s+(?:in|at)\s+)([a-zA-Z\s.,'-]+)/i,
      /(?:in|for|at)\s+([a-zA-Z\s.,'-]+?)\s+(?:weather|forecast|right now|today|tomorrow)/i,
      /(?:how about|what about|tell me about)\s+([a-zA-Z\s.,'-]+)/i,
      /([a-zA-Z\s.,'-]+?)\s+(?:weather|forecast|conditions)/i,
    ];

    for (const pat of patterns) {
      const match = text.match(pat);
      if (match && match[1]) {
        const clean = cleanExtractedCity(match[1]);
        if (clean) {
          const lower = clean.toLowerCase();
          // Ignore non-city pronouns/generic terms
          if (!['here', 'there', 'my area', 'my location', 'the area', 'today', 'tomorrow', 'this week', 'now', 'right now', 'outside'].includes(lower)) {
            return clean;
          }
        }
      }
    }
    return null;
  }

  // Extract multiple city names from queries requesting comparisons (e.g. "Compare weather in Kampala and Entebbe")
  function extractMultipleCitiesFromQuery(text: string): string[] {
    if (!text) return [];
    const compareMatch = text.match(/(?:compare|between|versus|vs)\s+(?:weather\s+in\s+|weather\s+for\s+)?([a-zA-Z\s.,'-]+?)\s+(?:and|with|vs|versus)\s+([a-zA-Z\s.,'-]+)/i);
    if (compareMatch && compareMatch[1] && compareMatch[2]) {
      const c1 = cleanExtractedCity(compareMatch[1]);
      const c2 = cleanExtractedCity(compareMatch[2]);
      if (c1 && c2 && c1.toLowerCase() !== c2.toLowerCase()) {
        return [c1, c2];
      }
    }
    return [];
  }

  // Server-side text chat endpoint with weather tool grounding and optional direct voice synthesis
  app.post('/api/ai/chat', async (req, res) => {
    const tReqStart = Date.now();
    let weatherFetchMs = 0;
    let aiGenMs = 0;

    const { 
      messages, 
      weatherData, 
      deviceLocationData, 
      mapContextData, 
      activeMapLayer, 
      synthesizeVoice = false 
    } = req.body || {};

    try {
      const lastUserMsg = (messages?.[messages.length - 1]?.content || '').trim();

      // Helper to respond with optional direct speech synthesis in a single round-trip
      const sendChatResponse = async (replyText: string, cityUpdate: any = null) => {
        if (!synthesizeVoice) {
          return res.json({
            reply: replyText,
            updatedCityWeather: cityUpdate,
            timings: {
              weatherMs: weatherFetchMs,
              aiMs: aiGenMs,
              ttsMs: 0,
              totalMs: Date.now() - tReqStart
            }
          });
        }

        const tTtsStart = Date.now();
        const synth = await synthesizeSpeechInternal(replyText);
        const ttsMs = Date.now() - tTtsStart;

        return res.json({
          reply: replyText,
          audio: synth.audio,
          mimeType: synth.mimeType,
          voiceId: synth.voiceId,
          voiceName: synth.voiceName,
          fallbackToWebSpeech: synth.fallbackToWebSpeech,
          updatedCityWeather: cityUpdate,
          timings: {
            weatherMs: weatherFetchMs,
            aiMs: aiGenMs,
            ttsMs,
            totalMs: Date.now() - tReqStart
          }
        });
      };

      // Fast conversational routing: short-circuit pure greetings or thanks without invoking geocoding/weather APIs
      const isGreeting = isGreetingQuery(lastUserMsg);
      const isPureThanks = /^\s*(?:thanks|thank you|thanks atmos|thank you atmos|thanks a lot|much appreciated)\s*[.?!]*$/i.test(lastUserMsg);

      if (isGreeting) {
        const greetingReply = buildNaturalGreetingResponse(req.body?.userName);
        return await sendChatResponse(greetingReply);
      }
      if (isPureThanks) {
        return await sendChatResponse("You're very welcome! Let me know whenever you need more weather insights.");
      }

      const comparisonCities = extractMultipleCitiesFromQuery(lastUserMsg);
      const requestedCity = extractCityFromQuery(lastUserMsg);

      let targetWeatherData = mapContextData || weatherData;
      let updatedCityWeather: any = null;
      let comparisonContext = '';

      // Check if user asks to compare current/device location vs map context
      const isMapCompareQuery = /\b(?:compare|difference|versus|vs)\b/i.test(lastUserMsg) &&
        /\b(?:map|selected|this spot|pin|marker)\b/i.test(lastUserMsg);

      // Handle Multi-City Comparison Queries (e.g., "Compare Kampala and Entebbe")
      if (comparisonCities.length === 2) {
        try {
          const tWeatherStart = Date.now();
          const [data1, data2] = await Promise.all([
            routeForecastRequest(async (provider) => {
              if (provider.name === 'WeatherAPI.com') return await fetchWeatherAPI(comparisonCities[0]);
              else if (provider.name === 'OpenWeather') return await fetchOpenWeather(comparisonCities[0]);
              else return await fetchOpenMeteo(comparisonCities[0]);
            }, `search:${normalizeWeatherQuery(comparisonCities[0])}`),
            routeForecastRequest(async (provider) => {
              if (provider.name === 'WeatherAPI.com') return await fetchWeatherAPI(comparisonCities[1]);
              else if (provider.name === 'OpenWeather') return await fetchOpenWeather(comparisonCities[1]);
              else return await fetchOpenMeteo(comparisonCities[1]);
            }, `search:${normalizeWeatherQuery(comparisonCities[1])}`)
          ]);
          weatherFetchMs = Date.now() - tWeatherStart;

          targetWeatherData = data1;
          updatedCityWeather = data1;

          const temp1 = Math.round(data1.weather.current.temperature_2m);
          const cond1 = getWeatherConditionLabel(data1.weather.current.weather_code);
          const temp2 = Math.round(data2.weather.current.temperature_2m);
          const cond2 = getWeatherConditionLabel(data2.weather.current.weather_code);

          comparisonContext = `
GROUNDED MULTI-CITY COMPARISON DATA:
- City 1 (${data1.location.name}, ${data1.location.country || ''}): ${temp1}°C, ${cond1}, ${data1.weather.current.relative_humidity_2m}% humidity, wind ${Math.round(data1.weather.current.wind_speed_10m)} km/h.
- City 2 (${data2.location.name}, ${data2.location.country || ''}): ${temp2}°C, ${cond2}, ${data2.weather.current.relative_humidity_2m}% humidity, wind ${Math.round(data2.weather.current.wind_speed_10m)} km/h.
Compare both cities directly and highlight key differences in temperature, weather conditions, rain, and wind.`;
        } catch (compErr) {
          console.warn('[RODEX Chat] Multi-city comparison lookup warning:', compErr);
        }
      } else if (isMapCompareQuery && mapContextData && (deviceLocationData || weatherData)) {
        const loc1 = deviceLocationData || weatherData;
        const loc2 = mapContextData;
        const temp1 = Math.round(loc1.weather.current.temperature_2m);
        const temp2 = Math.round(loc2.weather.current.temperature_2m);
        const cond1 = getWeatherConditionLabel(loc1.weather.current.weather_code);
        const cond2 = getWeatherConditionLabel(loc2.weather.current.weather_code);

        comparisonContext = `
GROUNDED LOCATION COMPARISON (CURRENT vs SELECTED MAP POINT):
- Current/Local Location (${loc1.location.name}, ${loc1.location.country || ''}): ${temp1}°C, ${cond1}, ${loc1.weather.current.relative_humidity_2m}% humidity, wind ${Math.round(loc1.weather.current.wind_speed_10m)} km/h.
- Selected Map Location (${loc2.location.name}, ${loc2.location.country || ''}): ${temp2}°C, ${cond2}, ${loc2.weather.current.relative_humidity_2m}% humidity, wind ${Math.round(loc2.weather.current.wind_speed_10m)} km/h.
Compare current location against the selected map location directly and clearly.`;
      } else if (requestedCity) {
        // Reuse fresh client-provided weather if it already matches the requested city
        const activeName = targetWeatherData?.location?.name || weatherData?.location?.name;
        const isAlreadyLoaded = activeName && requestedCity.toLowerCase() === activeName.toLowerCase() && targetWeatherData?.weather?.current;

        if (isAlreadyLoaded) {
          // Zero external latency - reuse verified in-memory dataset
          targetWeatherData = targetWeatherData || weatherData;
        } else {
          try {
            const tWeatherStart = Date.now();
            const cacheKey = `search:${normalizeWeatherQuery(requestedCity)}`;
            const fetchedData = await routeForecastRequest(async (provider) => {
              if (provider.name === 'WeatherAPI.com') {
                return await fetchWeatherAPI(requestedCity);
              } else if (provider.name === 'OpenWeather') {
                return await fetchOpenWeather(requestedCity);
              } else {
                return await fetchOpenMeteo(requestedCity);
              }
            }, cacheKey);
            weatherFetchMs = Date.now() - tWeatherStart;

            targetWeatherData = fetchedData;
            updatedCityWeather = fetchedData;
          } catch (fetchErr: any) {
            return await sendChatResponse(
              `I could not locate "${requestedCity}" via our geocoding service. Could you please check the spelling or provide the country (for example, "${requestedCity}, Uganda")?`
            );
          }
        }
      }

      // Check for "weather at this location" / "selected map point" / "on the map"
      const isMapSpotQuery = /\b(?:this location|this spot|selected location|on the map|map location|map point|here on the map)\b/i.test(lastUserMsg);
      if (isMapSpotQuery && mapContextData) {
        targetWeatherData = mapContextData;
      }

      // Check for "weather here" / "local weather" query
      const isLocalAreaQuery = /\b(?:weather here|local weather|weather in my area|my area|current location|where i am)\b/i.test(lastUserMsg);
      if (isLocalAreaQuery && deviceLocationData) {
        targetWeatherData = deviceLocationData;
      }

      const current = targetWeatherData?.weather?.current;
      const location = targetWeatherData?.location;
      const hourly = targetWeatherData?.weather?.hourly;
      const daily = targetWeatherData?.weather?.daily;
      const devLocation = deviceLocationData?.location;

      // FAST PATH: Check if this is a direct current observation query (e.g. "What's the weather like right now?", "What's the temperature?", "Is it raining?")
      if (isDirectCurrentWeatherQuery(lastUserMsg, location?.name) && location && current) {
        aiGenMs = 1;
        const fastReply = buildGroundedWeatherReply(
          { location, current },
          lastUserMsg
        );
        return await sendChatResponse(fastReply, updatedCityWeather);
      }

      // Layer explanation context
      const activeLayerName = activeMapLayer || 'temperature';
      const suppliedRainProbabilities = Array.isArray(hourly?.precipitation_probability) ? hourly.precipitation_probability.slice(0, 12).filter((value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)) : [];
      const maxPrecipProb = suppliedRainProbabilities.length ? Math.max(...suppliedRainProbabilities) : null;
      const layerContext = `
ACTIVE WEATHER MAP LAYER DATA (${activeLayerName.toUpperCase()} LAYER):
- Active Layer Type: ${activeLayerName}
- Temperature Layer Metrics: ${current?.temperature_2m != null && Number.isFinite(current.temperature_2m) ? Math.round(current.temperature_2m) + '°C' : 'unavailable'} (Feels like ${current?.apparent_temperature != null && Number.isFinite(current.apparent_temperature) ? Math.round(current.apparent_temperature) + '°C' : 'unavailable'}).
- Rain / Precipitation Layer Metrics: Current reading ${current?.precipitation != null && Number.isFinite(current.precipitation) ? current.precipitation + ' mm' : 'unavailable'}, peak 12h rain probability ${maxPrecipProb == null ? 'unavailable' : maxPrecipProb + '%'}.
- Wind Layer Metrics: Speed ${current?.wind_speed_10m != null && Number.isFinite(current.wind_speed_10m) ? Math.round(current.wind_speed_10m) + ' km/h' : 'unavailable'}, direction ${current?.wind_direction_10m ?? 'unavailable'}°.
If user asks about the active map layer, use supplied provider values and acknowledge unavailable fields.`;

      // Always calculate current time in the forecast location's timezone or known UTC offset.
      const localTime = formatLocationLocalTime(
        new Date(),
        location?.timezone,
        location?.timezoneOffsetSeconds
      );

      const conditionLabel = current?.weather_code != null && current.weather_code >= 0 ? getWeatherConditionLabel(current.weather_code, current.is_day ?? 1) : 'conditions unavailable';
      const temp = current?.temperature_2m != null && Number.isFinite(current.temperature_2m) ? Math.round(current.temperature_2m) : null;
      const feelsLike = current?.apparent_temperature != null && Number.isFinite(current.apparent_temperature) ? Math.round(current.apparent_temperature) : null;
      const humidity = current?.relative_humidity_2m != null && Number.isFinite(current.relative_humidity_2m) ? Math.round(current.relative_humidity_2m) : null;
      const wind = current?.wind_speed_10m != null && Number.isFinite(current.wind_speed_10m) ? Math.round(current.wind_speed_10m) : null;
      const precip = current?.precipitation != null && Number.isFinite(current.precipitation) ? current.precipitation : null;

      // Start the outlook at the current forecast hour, not the beginning of the provider's day array.
      const hourlyStartIndex = findCurrentHourlyIndex(hourly?.time, current?.time);
      const hourlySummary = hourly?.time?.slice(hourlyStartIndex, hourlyStartIndex + 12).map((t: string, offset: number) => {
        const idx = hourlyStartIndex + offset;
        const temperature = hourly?.temperature_2m?.[idx];
        const probability = hourly?.precipitation_probability?.[idx];
        const hourStr = formatForecastLocalHour(t);
        if (!Number.isFinite(temperature)) return hourStr + ': temperature unavailable';
        return Number.isFinite(probability)
          ? hourStr + ': ' + Math.round(temperature) + '°C (' + Math.round(probability) + '% rain chance)'
          : hourStr + ': ' + Math.round(temperature) + '°C (rain probability unavailable)';
      }).join(', ') || 'N/A';

      // Produce 7-day outlook using the provider's location-local calendar dates.
      const dailySummary = daily?.time?.slice(0, 7).map((d: string, idx: number) => {
        const dayName = idx === 0 ? 'Today' : formatForecastLocalDate(d);
        const low = daily?.temperature_2m_min?.[idx];
        const high = daily?.temperature_2m_max?.[idx];
        if (!Number.isFinite(low) || !Number.isFinite(high)) return `${dayName}: forecast temperatures unavailable`;
        return `${dayName}: ${Math.round(low)}°C to ${Math.round(high)}°C`;
      }).join('; ') || 'N/A';

      const activeAlerts = targetWeatherData?.alerts || [];
      const alertsContext = activeAlerts.length > 0
        ? `\nACTIVE WEATHER ALERTS FOR ${location?.name || 'Selected City'}:\n` + activeAlerts.map((a: any) => `- [${a.type.toUpperCase()} / ${a.severity.toUpperCase()}] ${a.title}: ${a.description} (Authority: ${a.issuingAuthority || 'N/A'}, Instruction: ${a.instruction || 'None'})`).join('\n')
        : '\nWEATHER ALERTS: No alert records were returned by this provider; do not claim an official all-clear.';

      const systemInstruction = `You are RODEX AI, the advanced meteorological and atmospheric assistant for the RODEX Atmos web app.
You provide helpful, concise, and friendly weather insights, wardrobe recommendations, and outdoor planning advice.

STRICT GROUNDING & LOCATION RULES:
1. Physical Device Location: ${devLocation?.name || 'Local Area'}${devLocation?.country ? ', ' + devLocation.country : ''}. If user asks "What's the weather here?" or "How is local weather?", answer using this physical location.
2. Currently Active Weather Location: ${location?.name || 'Selected City'}, ${location?.country || ''} (Local Time: ${localTime}).
3. Selected Map Location Context: ${mapContextData?.location?.name ? mapContextData.location.name + (mapContextData.location.country ? ', ' + mapContextData.location.country : '') : location?.name || 'None'}.
4. Explicit Location Override: If user names a specific city in their prompt (e.g. "What's the weather in Entebbe?"), prioritize that explicit city over map or device location.
5. Ground every answer strictly in the real provider data below. Never invent figures or fake warnings.
6. Keep replies conversational, concise (strictly 1-2 natural sentences, under 35 words), and directly answer the question.
7. Distinguish current precipitation (${precip == null ? 'unavailable' : precip + ' mm'}) and reported condition (${current?.weather_code ?? 'unavailable'}) from future rain probability; do not treat probability alone as proof that rain is falling.
8. Location Comparisons: Compare temperatures, rain chances, wind speeds, and comfort levels directly using verified data.
9. Layer Explanations: Explain active map layers (${activeLayerName}) using real provider values (temperature, precipitation, wind speed).

REAL VERIFIED FORECAST DATA FOR ${location?.name || 'Selected Location'}:
- City: ${location?.name || 'Unknown'}, ${location?.country || ''}
- Local Time: ${localTime}
- Condition: ${conditionLabel}
- Temperature: ${temp == null ? 'unavailable' : temp + '°C'} (Feels like: ${feelsLike == null ? 'unavailable' : feelsLike + '°C'})
- Weather Code: ${current?.weather_code ?? 'N/A'}
- Humidity: ${humidity == null ? 'unavailable' : humidity + '%'}
- Wind Speed: ${wind == null ? 'unavailable' : wind + ' km/h'}
- Precipitation Volume: ${precip == null ? 'unavailable' : precip + ' mm'}
- Surface Pressure: ${current?.surface_pressure != null ? current.surface_pressure + ' hPa' : 'unavailable'}
- Today's Hourly Outlook (Next 12 Hours): ${hourlySummary}
- 7-Day Outlook: ${dailySummary}${comparisonContext}${layerContext}${alertsContext}`;

      // Bounded conversation history (last 6 turns) to preserve context while keeping token count and latency minimal
      const boundedMessages = boundConversationHistory(messages || [], 6);

      // If AI client is available, generate concise response with 3500ms timeout failover
      if (ai) {
        try {
          const tAiStart = Date.now();
          const conversationContents = boundedMessages.map((m: any) => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }]
          }));

          const generateWithTimeout = async () => {
            try {
              return await ai!.models.generateContent({
                model: 'gemini-3.8-flash',
                contents: conversationContents,
                config: { systemInstruction, temperature: 0.2, maxOutputTokens: 180 }
              });
            } catch (flashErr) {
              return await ai!.models.generateContent({
                model: 'gemini-3.1-flash-lite',
                contents: conversationContents,
                config: { systemInstruction, temperature: 0.2, maxOutputTokens: 180 }
              });
            }
          };

          const response: any = await withTimeout(generateWithTimeout(), 3500, 'AI chat generation');
          aiGenMs = Date.now() - tAiStart;

          if (response?.text) {
            return await sendChatResponse(response.text.trim(), updatedCityWeather);
          }
        } catch (aiErr: any) {
          console.warn('[RODEX Chat AI Notice] Fast failover to grounded atmospheric response:', aiErr?.message || aiErr);
        }
      }

      // Deterministic fallback uses provider facts only when Gemini is unavailable.
      const currentFacts = [
        temp == null ? null : temp + '°C',
        conditionLabel !== 'conditions unavailable' ? conditionLabel : null,
        humidity == null ? null : humidity + '% humidity',
        wind == null ? null : 'wind ' + wind + ' km/h'
      ].filter(Boolean);
      let fallbackReply = currentFacts.length
        ? 'In ' + (location?.name || 'the selected location') + ', the local time is ' + localTime + '. Current data reports ' + currentFacts.join(', ') + '.'
        : 'I can’t provide a reliable current-weather answer for ' + (location?.name || 'this location') + ' because the latest measurements are incomplete. Please refresh the forecast.';

      if (/\b(wear|clothes|dress|jacket|coat)\b/i.test(lastUserMsg)) {
        if (temp == null) {
          fallbackReply = 'I can’t make a temperature-based clothing recommendation for ' + (location?.name || 'this location') + ' because the current temperature is unavailable.';
        } else if (temp < 15) {
          fallbackReply = 'In ' + (location?.name || 'this location') + ', it’s ' + temp + '°C. A warm jacket or sweater is a sensible choice.';
        } else if (temp > 24) {
          fallbackReply = 'In ' + (location?.name || 'this location') + ', it’s ' + temp + '°C. Breathable, lightweight clothing should be comfortable.';
        } else {
          fallbackReply = 'In ' + (location?.name || 'this location') + ', it’s ' + temp + '°C. Comfortable light layers are a reasonable choice.';
        }
      } else if (/\b(umbrella|rain)\b/i.test(lastUserMsg)) {
        const rainIndicated = (precip != null && precip > 0) ||
          (current?.weather_code != null && ((current.weather_code >= 51 && current.weather_code <= 67) || (current.weather_code >= 80 && current.weather_code <= 82)));
        if (rainIndicated) {
          fallbackReply = 'The latest weather data indicates rain in ' + (location?.name || 'this location') + '. Carrying an umbrella is a sensible precaution.';
        } else if (precip === 0) {
          fallbackReply = 'The latest reading reports no measurable precipitation in ' + (location?.name || 'this location') + ' right now.';
        } else {
          fallbackReply = 'I can’t confirm current rainfall in ' + (location?.name || 'this location') + ' because precipitation data is unavailable.';
        }
      }

      return await sendChatResponse(fallbackReply, updatedCityWeather);
    } catch (err: any) {
      console.error('Chat error:', err);
      res.status(500).json({
        error: 'CHAT_FAILED',
        message: err.message || 'Failed to process chat message.'
      });
    }
  });

  // Give missing API routes predictable JSON responses rather than HTML 404 pages.
  app.use('/api', (_req, res) => {
    res.status(404).json({
      error: 'API_ROUTE_NOT_FOUND',
      message: 'The requested RODEX Atmos API route does not exist.'
    });
  });

  // Normalize malformed/oversized JSON requests without exposing stack traces.
  app.use((error: any, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (res.headersSent) return next(error);
    const status = Number.isInteger(error?.status) && error.status >= 400 && error.status < 600
      ? error.status
      : 500;
    const isBadJson = (status === 400 && error?.type === 'entity.parse.failed') ||
      (status === 413 && error?.type === 'entity.too.large');
    console.error('[RODEX API Middleware Error]', { status, message: error?.message || 'Unknown error' });
    res.status(status).json({
      error: status === 413 && error?.type === 'entity.too.large'
        ? 'REQUEST_TOO_LARGE'
        : isBadJson ? 'INVALID_REQUEST_BODY' : 'INTERNAL_SERVER_ERROR',
      message: status === 413
        ? 'Request body exceeds the 1 MB limit.'
        : isBadJson ? 'Request body must contain valid JSON.' : 'The server could not complete this request. Please retry.'
    });
  });

  // Vite middleware is only for local development. Vercel serves the built dist/ assets
  // and routes /api/* through api/[...path].ts.
  if (shouldRunLocalDevServer) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  // Avoid remote TTS prewarming on serverless cold starts.
  if (ai && !isVercelRuntime) {
    synthesizeSpeechInternal("Hey! I'm listening. What's on your mind?", ATMOS_SIGNATURE_STYLE)
      .then((res) => {
        if (res.audio) {
          console.log('[RODEX Voice Cache] Pre-warmed approved signature greeting audio successfully.');
        }
      })
      .catch((err) => {
        console.warn('[RODEX Voice Cache] Pre-warm notice:', err?.message || err);
      });
  }

  if (shouldRunLocalDevServer) {
    app.listen(Number(PORT), '0.0.0.0', () => {
      console.log(`RODEX Atmos server running on http://localhost:${PORT}`);
    });
  }
}

// Export startup readiness for serverless functions so requests don't race route registration.
export const serverReady = startServer();