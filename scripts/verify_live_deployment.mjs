const baseUrl = (process.env.RODEX_ATMOS_BASE_URL || '').replace(/\/+$/, '');
if (!baseUrl) throw new Error('RODEX_ATMOS_BASE_URL is required.');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const timeoutSignal = (ms) => AbortSignal.timeout(ms);

async function getText(url, timeoutMs = 10000) {
  const response = await fetch(url, {
    redirect: 'follow',
    cache: 'no-store',
    headers: { 'user-agent': 'RODEX-Atmos-deployment-smoke/1.0', 'cache-control': 'no-cache' },
    signal: timeoutSignal(timeoutMs)
  });
  const body = await response.text();
  return { response, body };
}

async function assertLiveDeployment() {
  const { response: pageResponse, body: html } = await getText(baseUrl);
  if (!pageResponse.ok) {
    throw new Error(`Root page returned HTTP ${pageResponse.status}.`);
  }
  if (!html.includes('id="root"') || !html.includes('RODEX Atmos')) {
    throw new Error('Root page responded but does not contain the expected RODEX Atmos application shell.');
  }

  const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+\.(?:js|css))"/g)].map((match) => match[1]);
  if (!assets.some((asset) => asset.endsWith('.js'))) {
    throw new Error('The deployed HTML does not reference a JavaScript application bundle.');
  }
  if (!assets.some((asset) => asset.endsWith('.css'))) {
    throw new Error('The deployed HTML does not reference a CSS application bundle.');
  }
  for (const asset of [...new Set(assets)]) {
    const { response } = await getText(new URL(asset, baseUrl).href);
    if (!response.ok) throw new Error(`Static bundle ${asset} returned HTTP ${response.status}.`);
  }

  const { response: healthResponse, body: healthText } = await getText(new URL('/api/health', baseUrl).href);
  let health;
  try { health = JSON.parse(healthText); }
  catch { throw new Error(`/api/health did not return JSON (HTTP ${healthResponse.status}). Body begins: ${healthText.slice(0, 120)}`); }
  if (!healthResponse.ok || health?.ok !== true || health?.service !== 'rodex-atmos-api' || health?.runtime !== 'vercel') {
    throw new Error(`API health check failed: HTTP ${healthResponse.status}, payload ${JSON.stringify(health)}`);
  }

  const weatherUrl = new URL('/api/weather/search?query=Kampala%2CUganda', baseUrl).href;
  const { response: weatherResponse, body: weatherText } = await getText(weatherUrl, 20000);
  let weather;
  try { weather = JSON.parse(weatherText); }
  catch { throw new Error(`Weather endpoint did not return JSON (HTTP ${weatherResponse.status}). Body begins: ${weatherText.slice(0, 160)}`); }
  const temperature = weather?.weather?.current?.temperature_2m;
  if (!weatherResponse.ok || !weather?.location?.name || !Number.isFinite(temperature)) {
    throw new Error(`Live weather check failed: HTTP ${weatherResponse.status}, payload ${JSON.stringify(weather).slice(0, 320)}`);
  }

  console.log(`PASS deployed website: HTTP ${pageResponse.status}; ${new Set(assets).size} JavaScript/CSS bundle(s) available.`);
  console.log(`PASS deployed backend: /api/health reports runtime ${health.runtime}.`);
  console.log(`PASS live weather: ${weather.location.name} returned a valid current temperature.`);
}

let lastError;
const maxAttempts = 18;
for (let attempt = 1; attempt <= maxAttempts; attempt++) {
  try {
    await assertLiveDeployment();
    process.exit(0);
  } catch (error) {
    lastError = error instanceof Error ? error : new Error(String(error));
    console.error(`Deployment smoke attempt ${attempt}/${maxAttempts}: ${lastError.message}`);
    if (attempt < maxAttempts) await sleep(8000);
  }
}
throw new Error(`Live deployment checks failed after ${maxAttempts} attempts. Last failure: ${lastError?.message || 'unknown error'}`);
