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

  // Helper to fetch weather via WeatherAPI.com
  async function fetchWeatherAPI(queryOrCoords: string | { lat: number; lon: number }) {
    const apiKey = process.env.WEATHERAPI_KEY;
    if (!apiKey) throw new Error('WEATHERAPI_KEY not configured');

    const q = typeof queryOrCoords === 'string' ? queryOrCoords : `${queryOrCoords.lat},${queryOrCoords.lon}`;
    const url = `https://api.weatherapi.com/v1/forecast.json?key=${apiKey}&q=${encodeURIComponent(q)}&days=7&aqi=no&alerts=no`;
    
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

  // Helper to fetch weather via Open-Meteo
  async function fetchOpenMeteo(queryOrCoords: string | { lat: number; lon: number }, cityNameHint?: string) {
    let lat: number;
    let lon: number;
    let name = cityNameHint || 'Location';
    let country = '';
    let admin1 = '';
    let timezone = 'auto';

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
    }

    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m,wind_direction_10m,surface_pressure&hourly=temperature_2m,precipitation_probability,weather_code,is_day&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max&timezone=auto`;
    const weatherRes = await fetch(weatherUrl);
    if (!weatherRes.ok) throw new Error(`Open-Meteo error: ${weatherRes.statusText}`);
    const weatherData = await weatherRes.json();

    return {
      location: {
        name,
        country,
        admin1,
        latitude: lat,
        longitude: lon,
        timezone: weatherData.timezone || timezone
      },
      weather: weatherData,
      providerInfo: {
        name: 'Open-Meteo',
        credit: 'Weather data by Open-Meteo.com',
        disclaimer: 'Open-Meteo public free weather API.'
      },
      source: 'live' as const
    };
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

  // Voice readiness status endpoint (checks presence of GEMINI_API_KEY without revealing secret)
  app.get('/api/ai/live-status', (req, res) => {
    const isConfigured = !!ai;
    res.json({
      supported: isConfigured,
      hasServerKey: isConfigured,
      model: 'gemini-3.8-live',
      message: isConfigured
        ? 'Gemini Live voice service is configured and ready.'
        : 'GEMINI_API_KEY is not configured in server secrets. Add your key to server secrets to enable live voice.'
    });
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

  // Server-side text chat endpoint with weather tool grounding
  app.post('/api/ai/chat', async (req, res) => {
    const { messages, weatherData } = req.body || {};
    try {
      const lastUserMsg = (messages?.[messages.length - 1]?.content || '');
      const requestedCity = extractCityFromQuery(lastUserMsg);

      let targetWeatherData = weatherData;
      let updatedCityWeather: any = null;

      // 1. If user named a city, resolve it through the existing router immediately
      if (requestedCity) {
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

      const current = targetWeatherData?.weather?.current;
      const location = targetWeatherData?.location;
      const daily = targetWeatherData?.weather?.daily;

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

      const systemInstruction = `You are RODEX AI, the advanced meteorological and atmospheric assistant for the RODEX Atmos web app.
You provide helpful, concise, and friendly weather insights, wardrobe recommendations, and outdoor planning advice.

STRICT GROUNDING RULES:
1. Ground every answer strictly in the real provider data below. Never answer from general knowledge or invent missing values or official alerts.
2. State the city name (${location?.name}), country (${location?.country || ''}), local time (${localTime}), and relevant weather details (${conditionLabel}, ${temp}°C, feels like ${feelsLike}°C, ${humidity}% humidity, wind ${wind} km/h) concisely.
3. Keep replies conversational, concise (1-2 sentences), and practical.

REAL WEATHER DATA FOR SELECTED LOCATION:
- City: ${location?.name || 'Unknown'}, ${location?.country || ''}
- Local Time: ${localTime}
- Condition: ${conditionLabel}
- Temperature: ${temp}°C (Feels like: ${feelsLike}°C)
- Weather Code: ${current?.weather_code ?? 'N/A'}
- Humidity: ${humidity}%
- Wind Speed: ${wind} km/h
- Precipitation: ${current?.precipitation ?? 0} mm
- Surface Pressure: ${current?.surface_pressure ?? 1013} hPa`;

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
    server: { middlewareMode: true },
    appType: 'spa',
  });

  app.use(vite.middlewares);

  app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`RODEX Atmos server running on http://localhost:${PORT}`);
  });
}

startServer();
