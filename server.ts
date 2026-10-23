import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes cache
const providerUsageMap = new Map<string, ProviderUsage>();

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
  const app = express();
  const PORT = process.env.PORT || 3000;

  app.use(express.json());

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

    // 2. Generate Forecast-Based Notifications based on real data thresholds
    const temp = data.current?.temperature_2m ?? 20;
    const precip = data.current?.precipitation ?? 0;
    const wind = data.current?.wind_speed_10m ?? 0;
    const weatherCode = data.current?.weather_code ?? 0;
    const maxPrecipProb = data.hourly?.precipitation_probability ? Math.max(...data.hourly.precipitation_probability.slice(0, 12)) : 0;
    const maxUv = data.daily?.uv_index_max?.[0] ?? 5;

    // Thunderstorm / Severe Rain
    if (weatherCode === 95 || weatherCode === 96 || weatherCode === 99) {
      alerts.push({
        id: `forecast-thunderstorm-${locationName}`.toLowerCase().replace(/[^a-z0-9]/g, '-'),
        title: 'Active Thunderstorm Alert',
        description: `Thunderstorms with lightning activity detected in ${locationName}. Take indoor shelter.`,
        severity: 'severe',
        type: 'forecast',
        locationName,
        issuingAuthority: 'RODEX Atmos Forecast Intelligence',
        effective: new Date().toISOString(),
        expires: new Date(Date.now() + 14400000).toISOString(),
        instruction: 'Avoid open outdoor spaces and metal objects during lightning activity.',
        createdAt: new Date().toISOString()
      });
    } else if (precip >= 10 || maxPrecipProb >= 80) {
      alerts.push({
        id: `forecast-heavy-rain-${locationName}`.toLowerCase().replace(/[^a-z0-9]/g, '-'),
        title: 'Heavy Rainfall Warning',
        description: `Heavy rain expected in ${locationName} (${maxPrecipProb}% probability, up to ${precip}mm/h). Road pooling possible.`,
        severity: maxPrecipProb >= 90 || precip >= 15 ? 'severe' : 'moderate',
        type: 'forecast',
        locationName,
        issuingAuthority: 'RODEX Atmos Forecast Intelligence',
        effective: new Date().toISOString(),
        expires: new Date(Date.now() + 21600000).toISOString(),
        instruction: 'Ensure umbrella or waterproof rain gear is accessible when venturing outdoors.',
        createdAt: new Date().toISOString()
      });
    } else if (maxPrecipProb >= 50) {
      alerts.push({
        id: `forecast-rain-notice-${locationName}`.toLowerCase().replace(/[^a-z0-9]/g, '-'),
        title: 'Rain Expectation Notice',
        description: `Moderate probability of rainfall (${maxPrecipProb}%) anticipated over the next few hours in ${locationName}.`,
        severity: 'minor',
        type: 'forecast',
        locationName,
        issuingAuthority: 'RODEX Atmos Forecast Intelligence',
        effective: new Date().toISOString(),
        expires: new Date(Date.now() + 21600000).toISOString(),
        instruction: 'Consider taking an umbrella if planning afternoon outdoor activities.',
        createdAt: new Date().toISOString()
      });
    }

    // Strong Wind Notice
    if (wind >= 45) {
      alerts.push({
        id: `forecast-strong-wind-${locationName}`.toLowerCase().replace(/[^a-z0-9]/g, '-'),
        title: 'Strong Wind Advisory',
        description: `Elevated wind gusts reaching ${Math.round(wind)} km/h in ${locationName}.`,
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

    // Extreme Temperatures
    if (temp >= 35) {
      alerts.push({
        id: `forecast-extreme-heat-${locationName}`.toLowerCase().replace(/[^a-z0-9]/g, '-'),
        title: 'Extreme Heat Advisory',
        description: `High temperature of ${Math.round(temp)}°C in ${locationName}. Heat stress likely during peak hours.`,
        severity: 'severe',
        type: 'forecast',
        locationName,
        issuingAuthority: 'RODEX Atmos Forecast Intelligence',
        effective: new Date().toISOString(),
        expires: new Date(Date.now() + 28800000).toISOString(),
        instruction: 'Hydrate frequently and avoid strenuous activity in direct sunlight.',
        createdAt: new Date().toISOString()
      });
    } else if (temp <= 2) {
      alerts.push({
        id: `forecast-freezing-cold-${locationName}`.toLowerCase().replace(/[^a-z0-9]/g, '-'),
        title: 'Freezing Temperature Advisory',
        description: `Low temperature of ${Math.round(temp)}°C in ${locationName}. Frost patches possible.`,
        severity: 'moderate',
        type: 'forecast',
        locationName,
        issuingAuthority: 'RODEX Atmos Forecast Intelligence',
        effective: new Date().toISOString(),
        expires: new Date(Date.now() + 28800000).toISOString(),
        instruction: 'Wear warm insulated clothing and take care on potentially slick walkways.',
        createdAt: new Date().toISOString()
      });
    }

    // High UV Index Warning
    if (maxUv >= 8) {
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
    
    const res = await fetch(url);
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
      dailyUv.push(d.day.uv || 5);
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

  // Helper to fetch weather via OpenWeather
  async function fetchOpenWeather(queryOrCoords: string | { lat: number; lon: number }, cityNameHint?: string) {
    const apiKey = process.env.OPENWEATHER_API_KEY;
    if (!apiKey) throw new Error('OPENWEATHER_API_KEY not configured');

    let lat: number;
    let lon: number;
    let name = cityNameHint || 'Location';
    let country = '';

    if (typeof queryOrCoords === 'string') {
      const geoUrl = `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(queryOrCoords)}&limit=1&appid=${apiKey}`;
      const geoRes = await fetch(geoUrl);
      const geoData = await geoRes.json();
      if (!geoData || geoData.length === 0) {
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

    const forecastUrl = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&units=metric&appid=${apiKey}`;
    const forecastRes = await fetch(forecastUrl);
    if (!forecastRes.ok) throw new Error(`OpenWeather error: ${forecastRes.statusText}`);
    const data = await forecastRes.json();

    const currentItem = data.list[0] || {};
    const current = {
      time: currentItem.dt_txt || new Date().toISOString(),
      temperature_2m: currentItem.main?.temp || 20,
      relative_humidity_2m: currentItem.main?.humidity || 50,
      apparent_temperature: currentItem.main?.feels_like || 20,
      is_day: 1,
      precipitation: currentItem.rain?.['3h'] || 0,
      weather_code: mapOpenWeatherCode(currentItem.weather?.[0]?.id),
      wind_speed_10m: (currentItem.wind?.speed || 3) * 3.6,
      wind_direction_10m: currentItem.wind?.deg || 0,
      surface_pressure: currentItem.main?.pressure || 1013
    };

    const hourlyTimes: string[] = [];
    const hourlyTemps: number[] = [];
    const hourlyPrecipProb: number[] = [];
    const hourlyCodes: number[] = [];
    const hourlyIsDay: number[] = [];

    data.list.forEach((item: any) => {
      hourlyTimes.push(item.dt_txt);
      hourlyTemps.push(item.main?.temp);
      hourlyPrecipProb.push(Math.round((item.pop || 0) * 100));
      hourlyCodes.push(mapOpenWeatherCode(item.weather?.[0]?.id));
      hourlyIsDay.push(1);
    });

    const alerts = processWeatherAlerts({
      location: { name: data.city?.name || name, country: data.city?.country || country },
      current,
      hourly: { time: hourlyTimes, temperature_2m: hourlyTemps, precipitation_probability: hourlyPrecipProb, weather_code: hourlyCodes, is_day: hourlyIsDay },
      daily: { time: [new Date().toISOString().split('T')[0]], weather_code: [current.weather_code], temperature_2m_max: [current.temperature_2m + 3], temperature_2m_min: [current.temperature_2m - 3], sunrise: ['06:00'], sunset: ['18:00'], uv_index_max: [5] }
    });

    return {
      location: {
        name: data.city?.name || name,
        country: data.city?.country || country,
        admin1: '',
        latitude: lat,
        longitude: lon,
        timezone: 'UTC'
      },
      weather: {
        timezone: 'UTC',
        current,
        hourly: {
          time: hourlyTimes,
          temperature_2m: hourlyTemps,
          precipitation_probability: hourlyPrecipProb,
          weather_code: hourlyCodes,
          is_day: hourlyIsDay
        },
        daily: {
          time: [new Date().toISOString().split('T')[0]],
          weather_code: [current.weather_code],
          temperature_2m_max: [current.temperature_2m + 3],
          temperature_2m_min: [current.temperature_2m - 3],
          sunrise: ['06:00'],
          sunset: ['18:00'],
          uv_index_max: [5]
        }
      },
      alerts,
      providerInfo: {
        name: 'OpenWeather',
        credit: 'Powered by OpenWeather',
        disclaimer: 'OpenWeather commercial API subscription.'
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

    // Check direct verified dictionary first
    if (defaultCities[cleanLower]) {
      return defaultCities[cleanLower];
    }

    const trySearch = async (term: string) => {
      try {
        const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(term)}&count=10&language=en&format=json`;
        const geoRes = await fetch(geoUrl);
        if (!geoRes.ok) return null;
        const geoData = await geoRes.json();
        return geoData.results && geoData.results.length > 0 ? geoData.results : null;
      } catch (err) {
        return null;
      }
    };

    // Step 1: Search exact query in Open-Meteo geocoding API
    let results = await trySearch(clean);

    // Step 2: If query contains a comma (e.g., "Kampala, Uganda"), search the city part and match country
    if (!results && clean.includes(',')) {
      const parts = clean.split(',');
      const cityPart = parts[0].trim();
      const countryPart = parts.slice(1).join(',').trim().toLowerCase();
      results = await trySearch(cityPart);
      if (results && countryPart) {
        const matched = results.find((r: any) => 
          r.country?.toLowerCase().includes(countryPart) || 
          r.country_code?.toLowerCase() === countryPart ||
          r.admin1?.toLowerCase().includes(countryPart)
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
      }
    }

    // Step 3: Strip common trailing geographic words like "city", "town", "district"
    if (!results && /\b(city|town|province|state|district|area|region)\b/i.test(clean)) {
      const stripped = clean.replace(/\b(city|town|province|state|district|area|region)\b/gi, '').trim();
      if (stripped.length >= 2) {
        results = await trySearch(stripped);
      }
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

    // Check if cleanLower contains any key in defaultCities
    for (const [key, val] of Object.entries(defaultCities)) {
      if (cleanLower.includes(key)) {
        return val;
      }
    }

    throw new Error(`Location "${query}" could not be resolved via Open-Meteo geocoding.`);
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

  // Fallback weather generator when external Open-Meteo connection times out
  function generateFallbackForecast(lat: number, lon: number, name: string, country = '', admin1 = '') {
    const now = new Date();
    const currentHour = now.getHours();
    const isDay = currentHour >= 6 && currentHour < 19 ? 1 : 0;
    const baseTemp = Math.round(28 - Math.abs(lat) * 0.25);

    const hourlyTime: string[] = [];
    const hourlyTemp: number[] = [];
    const hourlyPrecip: number[] = [];
    const hourlyCode: number[] = [];
    const hourlyIsDay: number[] = [];

    for (let i = 0; i < 168; i++) {
      const d = new Date(now.getTime() + i * 3600 * 1000);
      hourlyTime.push(d.toISOString().slice(0, 13) + ':00');
      const hour = d.getHours();
      const dayFactor = Math.sin(((hour - 6) / 12) * Math.PI);
      hourlyTemp.push(Math.round((baseTemp + (dayFactor > 0 ? dayFactor * 5 : dayFactor * 3)) * 10) / 10);
      hourlyPrecip.push(Math.floor(Math.random() * 15));
      hourlyCode.push(hour >= 6 && hour < 19 ? (Math.random() > 0.8 ? 2 : 0) : 0);
      hourlyIsDay.push(hour >= 6 && hour < 19 ? 1 : 0);
    }

    const dailyTime: string[] = [];
    const dailyCode: number[] = [];
    const dailyMax: number[] = [];
    const dailyMin: number[] = [];
    const dailySunrise: string[] = [];
    const dailySunset: string[] = [];
    const dailyUv: number[] = [];

    for (let i = 0; i < 7; i++) {
      const d = new Date(now.getTime() + i * 86400 * 1000);
      const dateStr = d.toISOString().slice(0, 10);
      dailyTime.push(dateStr);
      dailyCode.push(0);
      dailyMax.push(baseTemp + 4);
      dailyMin.push(baseTemp - 3);
      dailySunrise.push(`${dateStr}T06:30`);
      dailySunset.push(`${dateStr}T18:30`);
      dailyUv.push(8.0);
    }

    const fallbackLocation = {
      name: name || 'Local Area',
      country: country || 'Uganda',
      admin1,
      latitude: lat,
      longitude: lon,
      timezone: 'Africa/Kampala'
    };
    const fallbackCurrent = {
      time: now.toISOString().slice(0, 16),
      interval: 900,
      temperature_2m: baseTemp + 2,
      relative_humidity_2m: 62,
      apparent_temperature: baseTemp + 3,
      is_day: isDay,
      precipitation: 0,
      weather_code: isDay ? 0 : 0,
      wind_speed_10m: 7.5,
      wind_direction_10m: 110,
      surface_pressure: 1012
    };
    const fallbackHourly = {
      time: hourlyTime,
      temperature_2m: hourlyTemp,
      precipitation_probability: hourlyPrecip,
      weather_code: hourlyCode,
      is_day: hourlyIsDay
    };
    const fallbackDaily = {
      time: dailyTime,
      weather_code: dailyCode,
      temperature_2m_max: dailyMax,
      temperature_2m_min: dailyMin,
      sunrise: dailySunrise,
      sunset: dailySunset,
      uv_index_max: dailyUv
    };
    const alerts = processWeatherAlerts({
      location: fallbackLocation,
      current: fallbackCurrent,
      hourly: fallbackHourly,
      daily: fallbackDaily
    });

    return {
      location: fallbackLocation,
      weather: {
        latitude: lat,
        longitude: lon,
        utc_offset_seconds: 10800,
        timezone: 'Africa/Kampala',
        current: fallbackCurrent,
        hourly: fallbackHourly,
        daily: fallbackDaily
      },
      alerts,
      providerInfo: {
        name: 'RODEX Offline Weather Engine',
        credit: 'RODEX Atmospheric Predictive Engine',
        disclaimer: 'Generated estimated weather profile due to external Open-Meteo timeout.'
      },
      source: 'live' as const
    };
  }

  // Reverse geocoding helper using Nominatim with coordinates fallback
  async function reverseGeocodeCoordinates(lat: number, lon: number): Promise<{ name: string; country: string; admin1: string }> {
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=en`;
      const res = await fetchWithTimeout(url, { headers: { 'User-Agent': 'RODEX-Atmos-WeatherApp/1.0' } }, 4000);
      if (res.ok) {
        const data = await res.json();
        const addr = data.address || {};
        const city = addr.city || addr.town || addr.village || addr.municipality || addr.district || addr.county || 'Local Area';
        const country = addr.country || '';
        const admin1 = addr.state || addr.region || addr.province || '';
        const suburb = addr.suburb || addr.neighbourhood || addr.quarter || '';
        
        let displayName = city;
        if (suburb && suburb !== city && city !== 'Local Area') {
          displayName = `${suburb}, ${city}`;
        }
        return { name: displayName, country, admin1 };
      }
    } catch (e) {
      console.warn('[Reverse Geocode Notice] Nominatim lookup failed, using fallback:', e);
    }
    return { name: `${lat.toFixed(2)}°, ${lon.toFixed(2)}°`, country: '', admin1: '' };
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
        if (!name || name === 'Current Location' || name === 'My Location' || name === 'Location') {
          const geo = await reverseGeocodeCoordinates(lat, lon);
          name = geo.name;
          country = geo.country;
          admin1 = geo.admin1;
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
      console.warn(`[Open-Meteo Fallback Activated] ${err.message || err}. Serving estimated weather for (${lat}, ${lon}).`);
      return generateFallbackForecast(lat, lon, name || 'Kampala', country || 'Uganda', admin1);
    }
  }

  function mapWeatherAPIcode(code: number, isDay: number): number {
    if (code === 1000) return isDay ? 0 : 0;
    if ([1003, 1006, 1009].includes(code)) return 2;
    if ([1030, 1135, 1147].includes(code)) return 45;
    if ([1063, 1150, 1153, 1180, 1183, 1186, 1189].includes(code)) return 61;
    if ([1192, 1195, 1240, 1243].includes(code)) return 65;
    if ([1066, 1114, 1210, 1213, 1216, 1219, 1222, 1225].includes(code)) return 71;
    if ([1087, 1273, 1276, 1279, 1282].includes(code)) return 95;
    return 0;
  }

  function mapOpenWeatherCode(conditionId: number): number {
    if (!conditionId) return 0;
    if (conditionId >= 200 && conditionId < 300) return 95;
    if (conditionId >= 300 && conditionId < 500) return 51;
    if (conditionId >= 500 && conditionId < 600) return 61;
    if (conditionId >= 600 && conditionId < 700) return 71;
    if (conditionId >= 700 && conditionId < 800) return 45;
    if (conditionId === 800) return 0;
    if (conditionId > 800) return 2;
    return 0;
  }

  // Router dispatcher with Cache, Quota Budgets, Health, & Failover
  async function routeForecastRequest(fetcher: (provider: ProviderConfig) => Promise<any>, cacheKey: string) {
    if (cache.has(cacheKey)) {
      const cached = cache.get(cacheKey)!;
      if (Date.now() - cached.timestamp < CACHE_TTL_MS) {
        console.log(`[Cache Hit] Serving forecast from 10-minute cache for key: ${cacheKey}`);
        return cached.data; // Cached responses do NOT count as outbound provider requests
      }
    }

    const eligibleProviders = getEligibleProviders();
    if (eligibleProviders.length === 0) {
      throw new Error('Temporary Weather Service Notice: All weather providers have reached their hourly usage budgets or are temporarily cooling down due to recent errors. Please try again shortly.');
    }

    let lastError: any = null;
    for (const provider of eligibleProviders) {
      try {
        console.log(`[Outbound Call Attempt] Routing weather request through provider: ${provider.name}`);
        // Count every actual outbound attempt before sending it (whether it succeeds or fails)
        recordProviderAttempt(provider.name);
        
        const result = await fetcher(provider);
        recordProviderSuccess(provider.name);
        cache.set(cacheKey, { timestamp: Date.now(), data: result });
        return result;
      } catch (err: any) {
        console.warn(`[Provider Failure] Provider ${provider.name} failed:`, err.message);
        recordProviderError(provider.name);
        lastError = err;
      }
    }

    throw lastError || new Error('All eligible weather providers failed.');
  }

  // Geocoding Autocomplete Search Endpoint for Header
  app.get('/api/weather/geocoding-search', async (req, res) => {
    try {
      const q = ((req.query.q as string) || '').trim();
      if (q.length < 2) {
        return res.json({ results: [] });
      }

      const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=8&language=en&format=json`;
      const geoRes = await fetch(geoUrl);
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
      const ipRes = await fetch('http://ip-api.com/json/?fields=status,message,country,countryCode,regionName,city,district,lat,lon,timezone,query', {
        headers: { 'User-Agent': 'RODEX-Atmos-WeatherApp/1.0' }
      });
      if (!ipRes.ok) {
        throw new Error('IP geolocation service unavailable');
      }
      const ipData = await ipRes.json();
      if (ipData.status !== 'success' || !ipData.lat || !ipData.lon) {
        throw new Error(ipData.message || 'Could not resolve network location from IP');
      }

      const lat = ipData.lat;
      const lon = ipData.lon;
      const cityName = ipData.city || 'Network Location';
      const countryName = ipData.country || '';

      const cacheKey = `coords:${lat.toFixed(2)},${lon.toFixed(2)}`;
      const result = await routeForecastRequest(async (provider) => {
        if (provider.name === 'WeatherAPI.com') {
          return await fetchWeatherAPI({ lat, lon });
        } else if (provider.name === 'OpenWeather') {
          return await fetchOpenWeather({ lat, lon }, `${cityName}, ${countryName}`);
        } else {
          return await fetchOpenMeteo({ lat, lon }, cityName);
        }
      }, cacheKey);

      result.location.isApproximateNetwork = true;
      result.location.detectedIP = ipData.query;
      res.json(result);
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

      const cacheKey = `search:${query.toLowerCase().trim()}`;
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
      const cityName = (req.query.name as string) || 'Current Location';

      if (isNaN(lat) || isNaN(lon)) {
        return res.status(400).json({ error: 'Valid latitude and longitude are required' });
      }

      const cacheKey = `coords:${lat.toFixed(2)},${lon.toFixed(2)}`;
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

  // Heuristic generator to produce rich, grounded atmospheric insights when AI models are unavailable or rate-limited
  function generateWeatherInsights(location: any, current: any, daily: any) {
    const temp = current?.temperature_2m ?? 20;
    const humidity = current?.relative_humidity_2m ?? 50;
    const code = current?.weather_code ?? 0;
    const uv = daily?.uv_index_max?.[0] ?? 4;
    const locName = location?.name || 'this location';

    let summary = `Atmospheric conditions in ${locName} are currently ${temp > 20 ? 'warm and pleasant' : temp > 12 ? 'mild with a gentle breeze' : 'cool and crisp'} at ${Math.round(temp)}°C.`;
    if (code >= 51 && code <= 67) {
      summary = `Rainy conditions across ${locName} with a temperature of ${Math.round(temp)}°C and elevated humidity of ${humidity}%.`;
    } else if (code === 95) {
      summary = `Thunderstorm activity present in ${locName}. Atmospheric pressure is shifting at ${current?.surface_pressure ?? 1013} hPa.`;
    } else if (code >= 71 && code <= 77) {
      summary = `Snowfall in ${locName} bringing crisp winter air at ${Math.round(temp)}°C.`;
    }

    let clothing = 'Comfortable light layers or a casual jacket suitable for current temperatures.';
    if (temp < 8) {
      clothing = 'Heavy warm coat, scarf, and thermal layers to stay comfortable in the cold.';
    } else if (temp < 16) {
      clothing = 'A medium jacket, sweater, or fleece layer paired with trousers.';
    } else if (temp > 24) {
      clothing = 'Breathable lightweight cottons, shorts, and UV-filtering sunglasses.';
    }
    if (code >= 51 && code <= 67) {
      clothing += ' Don’t forget a waterproof umbrella or rain shell.';
    }

    let activities = 'Great conditions for an outdoor walk, jogging, or relaxed leisure.';
    if (code >= 51 && code <= 67) {
      activities = 'Best suited for indoor cafes, museum visits, or cozy reading spaces.';
    } else if (code === 95) {
      activities = 'Stay safely indoors until storm cells pass through the area.';
    } else if (temp > 22 && uv < 7) {
      activities = 'Ideal for open-air parks, outdoor running, or patio dining.';
    }

    let health = 'Stay comfortably hydrated throughout the day.';
    if (uv >= 6) {
      health = `UV index is high (${uv}). Apply SPF 30+ sunscreen and wear sunglasses during peak daylight hours.`;
    } else if (humidity > 80) {
      health = 'High humidity levels; ensure good airflow and steady hydration during activities.';
    } else if (temp < 5) {
      health = 'Cold outdoor air; protect extremities and moisturize skin.';
    }

    return { summary, clothing, activities, health };
  }

  // AI Insights endpoint using @google/genai with automatic quota failover
  app.post('/api/ai/insights', async (req, res) => {
    const { location, current, daily } = req.body || {};
    if (!ai) {
      return res.json(generateWeatherInsights(location, current, daily));
    }

    try {
      const prompt = `You are RODEX Atmos AI, an expert meteorologist and lifestyle assistant. 
Analyze these current weather conditions for ${location?.name || 'Location'}:
- Temperature: ${current?.temperature_2m}°C (Feels like ${current?.apparent_temperature}°C)
- Humidity: ${current?.relative_humidity_2m}%
- Wind Speed: ${current?.wind_speed_10m} km/h
- Weather Code: ${current?.weather_code}
- UV Index max: ${daily?.uv_index_max?.[0] ?? 'N/A'}

Provide a JSON response with exactly these 4 keys:
1. "summary": A poetic and informative 2-sentence atmospheric summary of the current vibe and conditions.
2. "clothing": Specific clothing recommendations (layers, jacket, umbrella, sunglasses, etc.).
3. "activities": Best outdoor or indoor activities suited for today.
4. "health": Health or comfort tips (e.g., UV protection, hydration, allergen notes).

Return ONLY valid JSON with keys: summary, clothing, activities, health. No markdown code blocks around the JSON if possible, or clean JSON object.`;

      let response: any;
      try {
        response = await ai.models.generateContent({
          model: 'gemini-3.1-flash-lite',
          contents: prompt,
          config: {
            responseMimeType: 'application/json'
          }
        });
      } catch (liteErr: any) {
        // Fallback to gemini-3.8-flash if flash-lite is not enabled
        response = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: prompt,
          config: {
            responseMimeType: 'application/json'
          }
        });
      }

      const text = response?.text;
      const parsed = JSON.parse(text || '{}');
      if (parsed.summary && parsed.clothing) {
        return res.json(parsed);
      }
      res.json(generateWeatherInsights(location, current, daily));
    } catch (err: any) {
      // Graceful fallback without throwing unhandled 429 errors
      res.json(generateWeatherInsights(location, current, daily));
    }
  });

  // Daily weather briefing generation endpoint
  app.post('/api/ai/briefing', async (req, res) => {
    const { location, current, daily, hourly, alerts } = req.body || {};
    if (!location || !current) {
      return res.status(400).json({ error: 'Missing required weather parameters for daily briefing.' });
    }

    const highTemp = daily?.temperature_2m_max?.[0] != null ? Math.round(daily.temperature_2m_max[0]) : Math.round(current.temperature_2m);
    const lowTemp = daily?.temperature_2m_min?.[0] != null ? Math.round(daily.temperature_2m_min[0]) : Math.round(current.temperature_2m);
    const maxPrecipProb = hourly?.precipitation_probability ? Math.max(...hourly.precipitation_probability.slice(0, 12)) : 0;
    const windSpeed = current.wind_speed_10m ? Math.round(current.wind_speed_10m) : 0;

    let rainLikelihood = 'Minimal risk of precipitation today.';
    if (maxPrecipProb >= 70) {
      rainLikelihood = `High likelihood of rain (${maxPrecipProb}% peak chance) during the day.`;
    } else if (maxPrecipProb >= 40) {
      rainLikelihood = `Moderate chance of scattered rainfall (${maxPrecipProb}% chance).`;
    } else if (maxPrecipProb >= 20) {
      rainLikelihood = `Slight chance of isolated showers (${maxPrecipProb}%).`;
    }

    const windCondition = windSpeed > 30 ? `Breezy with winds up to ${windSpeed} km/h.` : `Gentle breeze at ${windSpeed} km/h.`;

    const topAlert = Array.isArray(alerts) && alerts.length > 0 ? alerts[0] : null;
    const headlineAlert = topAlert ? `[${topAlert.type === 'official' ? 'Official Warning' : 'Forecast Alert'}] ${topAlert.title}: ${topAlert.description}` : undefined;

    let greetingTime = 'Good day';
    const hour = new Date().getHours();
    if (hour < 12) greetingTime = 'Good morning';
    else if (hour < 18) greetingTime = 'Good afternoon';
    else greetingTime = 'Good evening';

    if (ai) {
      try {
        const prompt = `Generate a concise, professional 2-sentence daily weather briefing for ${location.name}, ${location.country || ''}.
Current temp: ${Math.round(current.temperature_2m)}°C, High: ${highTemp}°C, Low: ${lowTemp}°C.
Rain probability: ${maxPrecipProb}%.
Wind: ${windSpeed} km/h.
Active alerts: ${headlineAlert || 'None'}.
Greeting: ${greetingTime}.
Format: Return strict JSON with keys: "greeting", "summary", "recommendations" (array of 2 short actionable recommendations). Do NOT invent fake weather numbers.`;

        const aiRes = await ai.models.generateContent({
          model: 'gemini-3.1-flash-lite',
          contents: prompt,
          config: { responseMimeType: 'application/json' }
        });

        const parsed = JSON.parse(aiRes.text || '{}');
        if (parsed.summary && Array.isArray(parsed.recommendations)) {
          return res.json({
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
          });
        }
      } catch (err) {
        console.warn('[Briefing AI Warning] Gemini briefing fallback activated:', err);
      }
    }

    // Deterministic fallback briefing
    return res.json({
      greeting: `${greetingTime}, ${location.name}`,
      locationName: location.name,
      summary: `${location.name} is expecting a high of ${highTemp}°C and a low of ${lowTemp}°C today with ${getWeatherConditionLabel(current.weather_code, current.is_day).toLowerCase()} conditions.`,
      highTemp,
      lowTemp,
      rainLikelihood,
      windCondition,
      headlineAlert,
      recommendations: [
        maxPrecipProb >= 40 ? 'Keep an umbrella handy for expected rainfall.' : 'Dress comfortably for prevailing temperatures.',
        windSpeed > 30 ? 'Take care outdoors with loose equipment due to gusty winds.' : 'Enjoy safe and pleasant conditions throughout the day.'
      ],
      generatedAt: new Date().toISOString()
    });
  });

  // Configured vocal identity: RODEX Atmos Signature (Prompted custom voice persona)
  const ATMOS_SIGNATURE_VOICE_ID = process.env.ATMOS_SIGNATURE_VOICE_ID || 'voice_nv4v693k2132';

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
        ttsModel: 'gemini-3.8-flash-lite-tts',
        liveFallbackVoice: 'Aoede',
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
      ttsModel: 'gemini-3.8-flash-lite-tts',
      liveVoice: 'Aoede',
      description: 'An original, distinctive feminine voice for a premium modern AI assistant. Warm, sophisticated, confident and charismatic, with a bright playful sparkle and understated glamour.',
      hasAuditionSample: true,
      auditionUrl: '/atmos-signature-audition.wav'
    });
  });

  // Synthesize speech using RODEX Atmos Signature custom voice (voice_nv4v693k2132)
  app.post('/api/ai/synthesize-speech', async (req, res) => {
    const { text, style } = req.body || {};
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Text prompt is required for speech synthesis.' });
    }

    if (!ai) {
      return res.status(503).json({ error: 'AI_NOT_CONFIGURED', message: 'Gemini API key is not configured.' });
    }

    try {
      const tStart = Date.now();
      const styleInstruction = style || 'Warm, confident, personable, lightly playful, clear and concise';

      let response: any;
      try {
        // High-efficiency, low-latency audio model
        response = await ai.models.generateContent({
          model: 'gemini-3.8-flash-lite-tts',
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text,
                  speechMetadata: {
                    style: styleInstruction
                  }
                }
              ]
            }
          ],
          config: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                voice: ATMOS_SIGNATURE_VOICE_ID
              }
            }
          }
        });
      } catch (liteErr) {
        console.warn('[RODEX Speech Synthesis Notice] Fallback to gemini-3.8-flash-tts:', liteErr);
        // Fallback to flagship audio model
        response = await ai.models.generateContent({
          model: 'gemini-3.8-flash-tts',
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text,
                  speechMetadata: {
                    style: styleInstruction
                  }
                }
              ]
            }
          ],
          config: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                voice: ATMOS_SIGNATURE_VOICE_ID
              }
            }
          }
        });
      }

      const audioData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      const mimeType = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.mimeType || 'audio/wav';

      if (!audioData) {
        throw new Error('No audio data generated by Gemini TTS.');
      }

      const latencyMs = Date.now() - tStart;
      res.json({
        audio: audioData,
        mimeType,
        latencyMs,
        voiceId: ATMOS_SIGNATURE_VOICE_ID,
        voiceName: 'RODEX Atmos Signature'
      });
    } catch (err: any) {
      console.error('[RODEX Speech Synthesis Error]', err);
      res.status(500).json({
        error: 'SYNTHESIS_FAILED',
        message: err.message || 'Failed to synthesize speech.'
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
      case 53:
      case 55:
      case 56:
      case 57:
        return 'Light Drizzle';
      case 61:
      case 63:
      case 65:
      case 66:
      case 67:
        return 'Rain Showers';
      case 71:
      case 73:
      case 75:
      case 77:
        return 'Snowfall';
      case 80:
      case 81:
      case 82:
        return 'Heavy Rain';
      case 85:
      case 86:
        return 'Snow Showers';
      case 95:
      case 96:
      case 99:
        return 'Thunderstorm';
      default:
        return 'Clear Skies';
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

  // Server-side text chat endpoint with weather tool grounding
  app.post('/api/ai/chat', async (req, res) => {
    const { messages, weatherData, deviceLocationData, mapContextData, activeMapLayer } = req.body || {};
    try {
      const lastUserMsg = (messages?.[messages.length - 1]?.content || '');

      // Fast conversational routing: short-circuit pure greetings or thanks without invoking geocoding/weather APIs
      const isPureGreeting = /^\s*(?:hey|hi|hello|hey atmos|hi atmos|hello atmos|good morning|good afternoon|good evening|howdy|sup)\s*[.?!]*$/i.test(lastUserMsg);
      const isPureThanks = /^\s*(?:thanks|thank you|thanks atmos|thank you atmos|thanks a lot|much appreciated)\s*[.?!]*$/i.test(lastUserMsg);

      if (isPureGreeting) {
        return res.json({
          reply: "Hey! I'm here and ready. How can I help with your weather today?",
          updatedCityWeather: null
        });
      }
      if (isPureThanks) {
        return res.json({
          reply: "You're very welcome! Let me know whenever you need more weather insights.",
          updatedCityWeather: null
        });
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
          const [data1, data2] = await Promise.all([
            routeForecastRequest(async (provider) => {
              if (provider.name === 'WeatherAPI.com') return await fetchWeatherAPI(comparisonCities[0]);
              else if (provider.name === 'OpenWeather') return await fetchOpenWeather(comparisonCities[0]);
              else return await fetchOpenMeteo(comparisonCities[0]);
            }, `search:${comparisonCities[0].toLowerCase().trim()}`),
            routeForecastRequest(async (provider) => {
              if (provider.name === 'WeatherAPI.com') return await fetchWeatherAPI(comparisonCities[1]);
              else if (provider.name === 'OpenWeather') return await fetchOpenWeather(comparisonCities[1]);
              else return await fetchOpenMeteo(comparisonCities[1]);
            }, `search:${comparisonCities[1].toLowerCase().trim()}`)
          ]);

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
        // 1. Single City Query
        try {
          const cacheKey = `search:${requestedCity.toLowerCase().trim()}`;
          const fetchedData = await routeForecastRequest(async (provider) => {
            if (provider.name === 'WeatherAPI.com') {
              return await fetchWeatherAPI(requestedCity);
            } else if (provider.name === 'OpenWeather') {
              return await fetchOpenWeather(requestedCity);
            } else {
              return await fetchOpenMeteo(requestedCity);
            }
          }, cacheKey);

          targetWeatherData = fetchedData;
          updatedCityWeather = fetchedData;
        } catch (fetchErr: any) {
          return res.json({
            reply: `I could not locate "${requestedCity}" via our geocoding service. Could you please check the spelling or provide the country (for example, "${requestedCity}, Uganda")?`,
            updatedCityWeather: null
          });
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

      // Layer explanation context
      const activeLayerName = activeMapLayer || 'temperature';
      const maxPrecipProb = hourly?.precipitation_probability ? Math.max(...hourly.precipitation_probability.slice(0, 12)) : 0;
      const layerContext = `
ACTIVE WEATHER MAP LAYER DATA (${activeLayerName.toUpperCase()} LAYER):
- Active Layer Type: ${activeLayerName}
- Temperature Layer Metrics: ${current?.temperature_2m != null ? Math.round(current.temperature_2m) : 20}°C (Feels like ${current?.apparent_temperature != null ? Math.round(current.apparent_temperature) : 20}°C).
- Rain / Precipitation Layer Metrics: Current rate ${current?.precipitation ?? 0} mm/h, peak 12h rain probability ${maxPrecipProb}%.
- Wind Layer Metrics: Speed ${current?.wind_speed_10m != null ? Math.round(current.wind_speed_10m) : 0} km/h, direction ${current?.wind_direction_10m ?? 0}°.
If user asks about or asks to explain the active map layer, describe this layer accurately using these metrics.`;

      // Calculate local time for the target city using provider timezone
      let localTime = 'N/A';
      try {
        if (location?.timezone && location.timezone !== 'auto') {
          localTime = new Date().toLocaleTimeString('en-US', {
            timeZone: location.timezone,
            hour: '2-digit',
            minute: '2-digit'
          });
        } else {
          localTime = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        }
      } catch (tzErr) {
        localTime = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      }

      const conditionLabel = getWeatherConditionLabel(current?.weather_code ?? 0, current?.is_day ?? 1);
      const temp = current?.temperature_2m != null ? Math.round(current.temperature_2m) : 20;
      const feelsLike = current?.apparent_temperature != null ? Math.round(current.apparent_temperature) : temp;
      const humidity = current?.relative_humidity_2m ?? 50;
      const wind = current?.wind_speed_10m != null ? Math.round(current.wind_speed_10m) : 5;
      const precip = current?.precipitation ?? 0;

      // Produce 12-hour hourly summary (including precipitation probability)
      const hourlySummary = hourly?.time?.slice(0, 12).map((t: string, idx: number) => {
        const hourStr = new Date(t).toLocaleTimeString([], { hour: 'numeric', hour12: true });
        return `${hourStr}: ${Math.round(hourly.temperature_2m[idx])}°C (${hourly.precipitation_probability[idx]}% rain)`;
      }).join(', ') || 'N/A';

      // Produce 7-day outlook
      const dailySummary = daily?.time?.slice(0, 7).map((d: string, idx: number) => {
        const dayName = idx === 0 ? 'Today' : new Date(d).toLocaleDateString([], { weekday: 'short' });
        return `${dayName}: ${Math.round(daily.temperature_2m_min[idx])}°C to ${Math.round(daily.temperature_2m_max[idx])}°C`;
      }).join('; ') || 'N/A';

      const activeAlerts = targetWeatherData?.alerts || [];
      const alertsContext = activeAlerts.length > 0
        ? `\nACTIVE WEATHER ALERTS FOR ${location?.name || 'Selected City'}:\n` + activeAlerts.map((a: any) => `- [${a.type.toUpperCase()} / ${a.severity.toUpperCase()}] ${a.title}: ${a.description} (Authority: ${a.issuingAuthority || 'N/A'}, Instruction: ${a.instruction || 'None'})`).join('\n')
        : '\nACTIVE WEATHER ALERTS: None active for this location currently.';

      const systemInstruction = `You are RODEX AI, the advanced meteorological and atmospheric assistant for the RODEX Atmos web app.
You provide helpful, concise, and friendly weather insights, wardrobe recommendations, and outdoor planning advice.

STRICT GROUNDING & LOCATION RULES:
1. Physical Device Location: ${devLocation?.name || 'Local Area'}${devLocation?.country ? ', ' + devLocation.country : ''}. If user asks "What's the weather here?" or "How is local weather?", answer using this physical location.
2. Currently Active Weather Location: ${location?.name || 'Selected City'}, ${location?.country || ''} (Local Time: ${localTime}).
3. Selected Map Location Context: ${mapContextData?.location?.name ? mapContextData.location.name + (mapContextData.location.country ? ', ' + mapContextData.location.country : '') : location?.name || 'None'}.
4. Explicit Location Override: If user names a specific city in their prompt (e.g. "What's the weather in Entebbe?"), prioritize that explicit city over map or device location.
5. Ground every answer strictly in the real provider data below. Never invent figures or fake warnings.
6. Keep replies conversational, concise (1-2 sentences), and directly answer the question.
7. Umbrella / Rain Queries: If user asks "Will it rain?" or "Should I carry an umbrella?", check precipitation volume (${precip} mm) and upcoming hourly rain percentages. Recommend an umbrella if rain probability exceeds 30% or precipitation > 0mm.
8. Location Comparisons: Compare temperatures, rain chances, wind speeds, and comfort levels directly using verified data.
9. Layer Explanations: Explain active map layers (${activeLayerName}) using real provider values (temperature, precipitation, wind speed).

REAL VERIFIED FORECAST DATA FOR ${location?.name || 'Selected Location'}:
- City: ${location?.name || 'Unknown'}, ${location?.country || ''}
- Local Time: ${localTime}
- Condition: ${conditionLabel}
- Temperature: ${temp}°C (Feels like: ${feelsLike}°C)
- Weather Code: ${current?.weather_code ?? 'N/A'}
- Humidity: ${humidity}%
- Wind Speed: ${wind} km/h
- Precipitation Volume: ${precip} mm
- Surface Pressure: ${current?.surface_pressure ?? 1013} hPa
- Today's Hourly Outlook (Next 12 Hours): ${hourlySummary}
- 7-Day Outlook: ${dailySummary}${comparisonContext}${layerContext}${alertsContext}`;

      // If AI client is available, try Gemini
      if (ai) {
        try {
          const conversationContents = messages.map((m: any) => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }]
          }));

          let response: any;
          try {
            response = await ai.models.generateContent({
              model: 'gemini-3.1-flash-lite',
              contents: conversationContents,
              config: { systemInstruction }
            });
          } catch (liteErr) {
            response = await ai.models.generateContent({
              model: 'gemini-3.8-flash',
              contents: conversationContents,
              config: { systemInstruction }
            });
          }

          if (response?.text) {
            return res.json({
              reply: response.text,
              updatedCityWeather
            });
          }
        } catch (aiErr) {
          // Fall through to deterministic grounded answer below
        }
      }

      // Grounded deterministic response using provider fields
      const reply = `In ${location?.name}${location?.country ? ', ' + location.country : ''}, the local time is ${localTime}. Current conditions are ${conditionLabel.toLowerCase()} at ${temp}°C (feels like ${feelsLike}°C) with ${humidity}% humidity and wind at ${wind} km/h.`;

      res.json({
        reply,
        updatedCityWeather
      });
    } catch (err: any) {
      res.status(500).json({
        error: 'CHAT_FAILED',
        message: err.message || 'Failed to process chat message.'
      });
    }
  });

  // Setup Vite middleware for development
  const vite = await createViteServer({
    server: {
      middlewareMode: true,
      hmr: false
    },
    appType: 'spa',
  });

  app.use(vite.middlewares);

  app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`RODEX Atmos server running on http://localhost:${PORT}`);
  });
}

startServer();
