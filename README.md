# RODEX Atmos

RODEX Atmos is a responsive weather and atmospheric-intelligence application for desktop, tablet, and mobile. It combines live weather conditions, hourly and 7-day forecasts, location-aware map exploration, wardrobe guidance, weather alerts, and RODEX AI voice/chat assistance.

## Core capabilities

- **Live weather:** Open-Meteo is the default provider; WeatherAPI.com and OpenWeather can be enabled as configured fallbacks.
- **Automatic location:** browser GPS is used when permission is granted; approximate network location and a clearly labelled fallback are available when GPS cannot be used.
- **Forecasts:** current conditions, hourly outlook, 7-day forecast, sunrise/sunset, UV, wind, humidity, and other measurements.
- **RODEX AI:** grounded weather chat, voice assistance, atmospheric insights, and practical clothing recommendations.
- **Installable experience:** responsive web app with PWA install support on compatible browsers.
- **Responsive interface:** core navigation and weather tools remain reachable on desktop, tablet, and phone.

## Requirements

- Node.js 20.19+ or 22.12+ (Vite 8 requirement).
- A supported package manager. Bun is used by the repository's CI workflow; npm can also install the declared dependencies.
- Optional server-side environment variables:
  - `GEMINI_API_KEY` or `API_KEY`: enables Gemini-powered RODEX AI features.
  - `WEATHERAPI_KEY`: enables WeatherAPI.com routing/failover.
  - `OPENWEATHER_API_KEY` and `OPENWEATHER_COMMERCIAL_CONFIRMED=true`: enables the optional OpenWeather provider.
  - `PORT`: HTTP port for a standalone Node deployment (defaults to 3000).

Keep provider secrets on the server. Do not expose them in client-side Vite variables.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. The development server uses Vite middleware and the shared Express API routes.

## Build and run on a standard Node host

RODEX Atmos is **not tied to Vercel**. The Express backend can serve the compiled Vite frontend and API routes from one persistent Node.js process. This deployment mode is suitable for Node-capable services such as Render, Railway, Fly.io, a VPS, or a container host.

```bash
npm install
npm run build
NODE_ENV=production npm start
```

Set the host's build command to `npm run build` and start command to `npm start`. Configure `NODE_ENV=production`, set `PORT` when required by the host, and add the server-side secrets listed above. The build creates `dist/` for the frontend and `server.js` for the production Express server. The server serves static assets, supports SPA routes, and sends API requests to the shared backend.

On Windows PowerShell:

```powershell
npm install
npm run build
$env:NODE_ENV = "production"
npm start
```

## Vercel (optional)

The existing `vercel.json` and `api/` serverless adapters remain available for Vercel deployments. They are an optional hosting adapter; the standalone Node server path is used on other Node hosts.

## Quality checks

```bash
npm run lint
npm run build
```

The GitHub Actions UI verification workflow also runs unit tests and desktop/mobile browser checks on pull requests to `main`.
