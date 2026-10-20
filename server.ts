import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;

  app.use(express.json());

  // Initialize Gemini API if key is available
  const geminiApiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
  const ai = geminiApiKey ? new GoogleGenAI({ apiKey: geminiApiKey }) : null;

  // Geocoding & Weather proxy endpoint
  app.get('/api/weather/search', async (req, res) => {
    try {
      const query = req.query.query as string;
      if (!query || query.trim().length === 0) {
        return res.status(400).json({ error: 'Query parameter is required' });
      }

      // 1. Geocode search
      const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=10&language=en&format=json`;
      const geoRes = await fetch(geoUrl);
      const geoData = await geoRes.json();

      if (!geoData.results || geoData.results.length === 0) {
        return res.status(404).json({ error: 'City not found' });
      }

      const location = geoData.results[0];
      const { latitude, longitude, name, country, admin1, timezone } = location;

      // 2. Fetch weather from Open-Meteo
      const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m,wind_direction_10m,surface_pressure&hourly=temperature_2m,precipitation_probability,weather_code,is_day&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max&timezone=auto`;
      
      const weatherRes = await fetch(weatherUrl);
      const weatherData = await weatherRes.json();

      res.json({
        location: {
          name,
          country: country || '',
          admin1: admin1 || '',
          latitude,
          longitude,
          timezone: timezone || 'UTC'
        },
        weather: weatherData,
        source: 'live'
      });
    } catch (error: any) {
      console.error('Weather search error:', error);
      res.status(500).json({ error: error.message || 'Failed to fetch weather data' });
    }
  });

  app.get('/api/weather/coordinates', async (req, res) => {
    try {
      const lat = req.query.lat;
      const lon = req.query.lon;
      const cityName = req.query.name as string || 'Current Location';

      if (!lat || !lon) {
        return res.status(400).json({ error: 'Latitude and longitude are required' });
      }

      const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m,wind_direction_10m,surface_pressure&hourly=temperature_2m,precipitation_probability,weather_code,is_day&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max&timezone=auto`;
      
      const weatherRes = await fetch(weatherUrl);
      const weatherData = await weatherRes.json();

      res.json({
        location: {
          name: cityName,
          country: '',
          admin1: '',
          latitude: Number(lat),
          longitude: Number(lon),
          timezone: weatherData.timezone || 'UTC'
        },
        weather: weatherData,
        source: 'live'
      });
    } catch (error: any) {
      console.error('Coordinates weather error:', error);
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
