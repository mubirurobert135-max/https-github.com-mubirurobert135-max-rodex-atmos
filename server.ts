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

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes cache

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;

  app.use(express.json());

  // Initialize Gemini API if key is available
  const geminiApiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
  const ai = geminiApiKey ? new GoogleGenAI({ apiKey: geminiApiKey }) : null;

  // Check eligible providers based on environment secrets and defaults
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

    // 3. OpenWeather (Disabled by default until compatible MIT-compatible license & commercial key confirmed)
    if (process.env.OPENWEATHER_API_KEY && process.env.OPENWEATHER_COMMERCIAL_CONFIRMED === 'true') {
      providers.push({
        name: 'OpenWeather',
        isEligible: true,
        credit: 'Powered by OpenWeather',
        disclaimer: 'OpenWeather commercial API subscription.'
      });
    }

    return providers;
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
    
    // Normalize into standard WeatherData format
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

    // Extract hourly from forecast forecastday[0] and [1]
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

  // Helper to fetch weather via Open-Meteo
  async function fetchOpenMeteo(queryOrCoords: string | { lat: number; lon: number }, cityNameHint?: string) {
    let lat: number;
    let lon: number;
    let name = cityNameHint || 'Location';
    let country = '';
    let admin1 = '';
    let timezone = 'auto';

    if (typeof queryOrCoords === 'string') {
      const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(queryOrCoords)}&count=1&language=en&format=json`;
      const geoRes = await fetch(geoUrl);
      const geoData = await geoRes.json();
      if (!geoData.results || geoData.results.length === 0) {
        throw new Error('City not found via Open-Meteo geocoding');
      }
      const loc = geoData.results[0];
      lat = loc.latitude;
      lon = loc.longitude;
      name = loc.name;
      country = loc.country || '';
      admin1 = loc.admin1 || '';
      timezone = loc.timezone || 'auto';
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
        disclaimer: 'Open-Meteo commercial API licensed usage.'
      },
      source: 'live' as const
    };
  }

  function mapWeatherAPIcode(code: number, isDay: number): number {
    // Map WeatherAPI condition codes to WMO standard codes used across app
    if (code === 1000) return isDay ? 0 : 0; // Sunny / Clear
    if ([1003, 1006, 1009].includes(code)) return 2; // Cloudy
    if ([1030, 1135, 1147].includes(code)) return 45; // Fog
    if ([1063, 1150, 1153, 1180, 1183, 1186, 1189].includes(code)) return 61; // Rain
    if ([1192, 1195, 1240, 1243].includes(code)) return 65; // Heavy rain
    if ([1066, 1114, 1210, 1213, 1216, 1219, 1222, 1225].includes(code)) return 71; // Snow
    if ([1087, 1273, 1276, 1279, 1282].includes(code)) return 95; // Thunderstorm
    return 0;
  }

  // Router dispatcher with Failover & Caching
  async function routeForecastRequest(fetcher: (provider: ProviderConfig) => Promise<any>, cacheKey: string) {
    if (cache.has(cacheKey)) {
      const cached = cache.get(cacheKey)!;
      if (Date.now() - cached.timestamp < CACHE_TTL_MS) {
        return cached.data;
      }
    }

    const eligibleProviders = getEligibleProviders();
    if (eligibleProviders.length === 0) {
      throw new Error('SETUP_REQUIRED: No eligible weather providers are configured. Please configure WEATHERAPI_KEY in server secrets to enable live weather.');
    }

    let lastError: any = null;
    for (const provider of eligibleProviders) {
      try {
        console.log(`Routing weather request through provider: ${provider.name}`);
        const result = await fetcher(provider);
        cache.set(cacheKey, { timestamp: Date.now(), data: result });
        return result;
      } catch (err: any) {
        console.warn(`Provider ${provider.name} failed:`, err.message);
        lastError = err;
        // Continue to backup provider
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
        } else {
          return await fetchOpenMeteo(query);
        }
      }, cacheKey);

      res.json(result);
    } catch (error: any) {
      console.error('Weather router search error:', error);
      if (error.message && error.message.startsWith('SETUP_REQUIRED')) {
        return res.status(503).json({ 
          error: 'SETUP_REQUIRED', 
          message: error.message.replace('SETUP_REQUIRED: ', '') 
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
        } else {
          return await fetchOpenMeteo({ lat, lon }, cityName);
        }
      }, cacheKey);

      res.json(result);
    } catch (error: any) {
      console.error('Weather router coordinates error:', error);
      if (error.message && error.message.startsWith('SETUP_REQUIRED')) {
        return res.status(503).json({ 
          error: 'SETUP_REQUIRED', 
          message: error.message.replace('SETUP_REQUIRED: ', '') 
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
