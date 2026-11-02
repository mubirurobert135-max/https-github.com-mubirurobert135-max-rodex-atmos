# RODEX Atmos

**Understand your day.**

RODEX Atmos is a responsive weather and atmospheric-intelligence application. It combines current conditions, hourly and multi-day forecasts, an interactive weather map, weather-aware clothing guidance, alerts, account/privacy controls, and the RODEX AI voice and chat assistant.

The application is built with React, TypeScript, Vite, Tailwind CSS, and an Express API. The interface uses a unified black, white, and graphite design and adapts to phone, tablet, laptop, and desktop layouts.

## Main features

- Device GPS weather with location-aware fallback and manual city search.
- Current conditions, hourly forecast, seven-day forecast, sunrise/sunset, and weather measurements.
- Interactive 2D weather map and 3D globe.
- RODEX AI weather chat, voice assistant, weather insights, and wardrobe recommendations.
- Weather alerts, account access, and a Privacy Portal.
- Installable Progressive Web App (PWA), offline status indication, and automatic service-worker updates.
- Responsive navigation that keeps the main app features available across screen sizes.

## Requirements

- Node.js 22 or later for production runtime.
- Bun for the reproducible dependency install and build workflow, or npm for a conventional local install.
- A modern browser. GPS and microphone access require a secure HTTPS origin outside localhost.

## Local development

Install the locked dependencies and start the development server:

```bash
bun install --frozen-lockfile
bun run dev
```

The local application is available at `http://localhost:3000`.

Alternatively, with Node.js and npm:

```bash
npm install
npm run dev
```

## Production build on a Node.js host

The production server serves the built React application and all Express API routes from one process. It does not require Vercel's serverless runtime.

```bash
bun install --frozen-lockfile
bun run build
NODE_ENV=production PORT=3000 node server.js
```

The app listens on the `PORT` provided by the hosting platform (3000 by default). The production health endpoint is `/api/health`.

When using npm, the equivalent commands are:

```bash
npm install
npm run build
NODE_ENV=production PORT=3000 npm start
```

## Deployment choices

RODEX Atmos is not tied to one hosting provider. The repository keeps its Vercel configuration and also includes a portable Docker production build.

### Docker (portable option)

Docker is suitable for Render, Railway, Fly.io, container platforms, and self-managed Linux servers.

```bash
docker build -t rodex-atmos .
docker run --rm -p 3000:3000 --env-file .env rodex-atmos
```

Open `http://localhost:3000`. Configure the same environment variables in the hosting platform's secret/environment settings rather than committing a `.env` file.

### Render

The repository includes a `render.yaml` blueprint and a Dockerfile. Create a new Blueprint deployment from this repository, then add the required secrets in the Render service settings.

### Railway, Fly.io, or another Docker host

Create a service from this repository and choose Dockerfile-based deployment. The container listens on `PORT` (default 3000) and exposes `/api/health` for health checks.

### Vercel

Vercel remains supported through the existing `vercel.json` and explicit API function adapters. The Node/Docker production server is an additional deployment route, not a replacement for Vercel.

## Environment variables

Set sensitive values in the hosting provider's secret manager. Never commit API keys.

| Variable | Purpose |
| --- | --- |
| `GEMINI_API_KEY` | Enables Gemini-powered AI chat, insights, and voice features. The existing `API_KEY` name is also accepted as a compatibility alias. |
| `WEATHERAPI_KEY` | Optional additional weather provider and failover source. Open-Meteo remains available without this key. |
| `PORT` | HTTP port supplied by the hosting platform. Defaults to `3000`. |
| `NODE_ENV` | Set to `production` for a production Node/Docker deployment. |

Firebase client configuration is managed by the existing Firebase integration in the source. Keep Firebase security rules deployed and reviewed when changing the data model.

## App updates and device support

The PWA uses the Vite PWA plugin with automatic service-worker updates. Browsers receive the latest published application assets after a new deployment and service-worker refresh. A deployment is still required when the source code changes; auto-update does not create releases by itself.

The responsive layouts are designed for narrow phones, larger phones, portrait/landscape tablets, laptops, and wide desktop screens. Actual GPS, microphone, installation, and notification capabilities depend on browser permissions and device support. Serve the app over HTTPS in production so secure browser APIs can work.

## Health check

Use `GET /api/health` to check server readiness. The endpoint returns a small JSON status response and does not expose secrets or internal stack traces.

## Project scripts

- `bun run dev` — local Vite + Express development server.
- `bun run build` — PWA/static production build and bundled Express server.
- `bun run start` — start the production Node server.
- `bun run lint` — TypeScript validation (`tsc --noEmit`).
- `bun run deploy:firestore-rules` — deploy Firebase Firestore rules.
