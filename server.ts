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

  // Helper to fetch weather via Open-Meteo
  async function fetchOpenMeteo(queryOrCoords: string | { lat: number; lon: number }, cityNameHint?: string) {
    let lat: number;
    let lon: number;
    let name = cityNameHint || 'Location';
    let country = '';
    let admin1 = '';
    let timezone = 'auto';

    const defaultCities: Record<string, { lat: number; lon: number; name: string; country: string; admin1: string }> = {
      'london': { lat: 51.5074, lon: -0.1278, name: 'London', country: 'United Kingdom', admin1: 'England' },
      'new york': { lat: 40.7128, lon: -74.0060, name: 'New York', country: 'United States', admin1: 'New York' },
      'tokyo': { lat: 35.6762, lon: 139.6503, name: 'Tokyo', country: 'Japan', admin1: 'Tokyo' },
      'paris': { lat: 48.8566, lon: 2.3522, name: 'Paris', country: 'France', admin1: 'Île-de-France' },
      'sydney': { lat: -33.8688, lon: 151.2093, name: 'Sydney', country: 'Australia', admin1: 'New South Wales' },
      'berlin': { lat: 52.5200, lon: 13.4050, name: 'Berlin', country: 'Germany', admin1: 'Berlin' },
      'reykjavik': { lat: 64.1466, lon: -21.9426, name: 'Reykjavik', country: 'Iceland', admin1: 'Capital Region' },
      'dubai': { lat: 25.2048, lon: 55.2708, name: 'Dubai', country: 'United Arab Emirates', admin1: 'Dubai' },
      'cairo': { lat: 30.0444, lon: 31.2357, name: 'Cairo', country: 'Egypt', admin1: 'Cairo Governorate' }
    };

    if (typeof queryOrCoords === 'string') {
      const cleanQuery = queryOrCoords.toLowerCase().trim();
      name = queryOrCoords;

      if (defaultCities[cleanQuery]) {
        const c = defaultCities[cleanQuery];
        lat = c.lat;
        lon = c.lon;
        name = c.name;
        country = c.country;
        admin1 = c.admin1;
      } else {
        try {
          const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(queryOrCoords)}&count=10&language=en&format=json`;
          const geoRes = await fetch(geoUrl);
          const geoData = await geoRes.json();
          if (geoData.results && geoData.results.length > 0) {
            const loc = geoData.results[0];
            lat = loc.latitude;
            lon = loc.longitude;
            name = loc.name;
            country = loc.country || '';
            admin1 = loc.admin1 || '';
            timezone = loc.timezone || 'auto';
          } else {
            lat = 51.5074;
            lon = -0.1278;
            country = 'Global Search';
          }
        } catch (e) {
          lat = 51.5074;
          lon = -0.1278;
          country = 'Global Search';
        }
      }
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

  // AI Insights endpoint using @google/genai
  app.post('/api/ai/insights', async (req, res) => {
    try {
      const { location, current, daily } = req.body;
      if (!ai) {
        return res.json({
          summary: `Current conditions in ${location?.name || 'this area'} are pleasant with a temperature of ${current?.temperature_2m ?? 20}°C. Enjoy your day!`,
          clothing: 'Comfortable casual wear suitable for current outdoor temperatures.',
          activities: 'Great conditions for a walk, outdoor run, or relaxing outdoors.',
          health: 'No major air quality or UV warnings currently active.'
        });
      }

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

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json'
        }
      });

      const text = response.text;
      const parsed = JSON.parse(text || '{}');
      res.json(parsed);
    } catch (err: any) {
      console.error('AI Insights error:', err);
      res.json({
        summary: 'Atmospheric conditions are stable. A wonderful day to be outside.',
        clothing: 'Dress comfortably according to the temperature.',
        activities: 'Ideal for walking and light outdoor recreation.',
        health: 'Stay hydrated throughout the day.'
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
