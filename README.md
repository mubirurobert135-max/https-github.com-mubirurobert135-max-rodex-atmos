# RODEX Atmos

RODEX Atmos is a polished, responsive weather forecasting web application featuring atmospheric dynamic backgrounds, live weather conditions from Open-Meteo and WeatherAPI.com, 7-day multi-day forecasts, hourly breakdowns, and AI-powered weather intelligence (via Google Gemini).

## Features

- **Atmospheric Dynamic Backgrounds**: Continuous weather-reactive background that adapts to sunny, rainy, snowy, night, cloudy, or thunderstorm conditions.
- **Multi-Provider Weather Router**: Seamlessly routes requests between Open-Meteo (default, no API key required) and WeatherAPI.com (when configured) with health failover and in-memory caching.
- **AI Atmospheric Insights**: Smart clothing recommendations, outdoor activity advisories, and health tips powered by Google Gemini.
- **Responsive Layout**: Designed for mobile phones, tablets, and desktop displays.

## Setup & Configuration

1. **Environment Secrets (.env)**:
   - `GEMINI_API_KEY`: Required for AI weather insights.
   - `WEATHERAPI_KEY`: Optional server secret for WeatherAPI.com failover/routing.
   - Open-Meteo is used by default when no API key is provided.

2. **Running Locally**:
   ```bash
   npm install
   npm run dev
   ```
