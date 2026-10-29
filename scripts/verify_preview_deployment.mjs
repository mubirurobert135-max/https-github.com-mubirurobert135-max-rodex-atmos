const repository = process.env.GITHUB_REPOSITORY || '';
const pullRequestNumber = process.env.PR_NUMBER || '';
if (!/^[\w.-]+\/[\w.-]+$/.test(repository)) throw new Error('GITHUB_REPOSITORY is missing or invalid.');
if (!/^\d+$/.test(pullRequestNumber)) throw new Error('PR_NUMBER is missing or invalid.');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const headers = {
  'accept': 'application/vnd.github+json',
  'user-agent': 'RODEX-Atmos-preview-smoke/1.0'
};

async function get(url, timeoutMs = 10000) {
  const response = await fetch(url, {
    redirect: 'follow',
    cache: 'no-store',
    headers,
    signal: AbortSignal.timeout(timeoutMs)
  });
  return { response, body: await response.text() };
}

async function latestVercelPreviewUrl() {
  const api = `https://api.github.com/repos/${repository}/issues/${pullRequestNumber}/comments?per_page=100`;
  const { response, body } = await get(api);
  if (!response.ok) throw new Error(`Cannot read preview deployment status comments (HTTP ${response.status}).`);
  const comments = JSON.parse(body);
  const matches = comments
    .filter((comment) => comment.user?.login === 'vercel[bot]')
    .map((comment) => ({
      updatedAt: Date.parse(comment.updated_at || comment.created_at || ''),
      url: (comment.body || '').match(/\[Preview\]\((https?:\/\/[^)]+)\)/)?.[1]
    }))
    .filter((item) => item.url)
    .sort((a, b) => b.updatedAt - a.updatedAt);
  return matches[0]?.url || null;
}

async function assertPreview(baseUrl) {
  const { response: pageResponse, body: html } = await get(baseUrl);
  if (!pageResponse.ok) throw new Error(`Preview root returned HTTP ${pageResponse.status}.`);
  if (!html.includes('id="root"') || !html.includes('RODEX Atmos')) {
    throw new Error('Preview root does not contain the RODEX Atmos application shell.');
  }

  const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+\.(?:js|css))"/g)].map((m) => m[1]);
  if (!assets.some((asset) => asset.endsWith('.js'))) throw new Error('Preview HTML has no JS application bundle.');
  if (!assets.some((asset) => asset.endsWith('.css'))) throw new Error('Preview HTML has no CSS application bundle.');
  for (const asset of new Set(assets)) {
    const { response } = await get(new URL(asset, baseUrl).href);
    if (!response.ok) throw new Error(`Preview static bundle ${asset} returned HTTP ${response.status}.`);
  }

  const { response: healthResponse, body: healthText } = await get(new URL('/api/health', baseUrl).href);
  let health;
  try { health = JSON.parse(healthText); }
  catch { throw new Error(`Preview /api/health did not return JSON (HTTP ${healthResponse.status}): ${healthText.slice(0,160)}`); }
  if (!healthResponse.ok || health?.ok !== true || health?.service !== 'rodex-atmos-api' || health?.runtime !== 'vercel') {
    throw new Error(`Preview API health failed: HTTP ${healthResponse.status}, payload ${JSON.stringify(health)}`);
  }

  const weatherUrl = new URL('/api/weather/search?query=Kampala%2CUganda', baseUrl).href;
  const { response: weatherResponse, body: weatherText } = await get(weatherUrl, 20000);
  let weather;
  try { weather = JSON.parse(weatherText); }
  catch { throw new Error(`Preview weather route did not return JSON (HTTP ${weatherResponse.status}): ${weatherText.slice(0,180)}`); }
  if (!weatherResponse.ok || !weather?.location?.name || !Number.isFinite(weather?.weather?.current?.temperature_2m)) {
    throw new Error(`Preview live weather failed: HTTP ${weatherResponse.status}, payload ${JSON.stringify(weather).slice(0,320)}`);
  }

  console.log(`PASS Vercel preview ${baseUrl}: root shell and ${new Set(assets).size} static bundle(s) are reachable.`);
  console.log('PASS Preview backend health: API initialization is running in the Vercel runtime.');
  console.log(`PASS Preview weather: ${weather.location.name} returned a valid current temperature.`);
}

let lastError;
const maxAttempts = 20;
for (let attempt = 1; attempt <= maxAttempts; attempt++) {
  try {
    const previewUrl = await latestVercelPreviewUrl();
    if (!previewUrl) throw new Error('Vercel has not posted a preview URL for this pull request yet.');
    await assertPreview(previewUrl);
    process.exit(0);
  } catch (error) {
    lastError = error instanceof Error ? error : new Error(String(error));
    console.error(`Preview deployment check ${attempt}/${maxAttempts}: ${lastError.message}`);
    if (attempt < maxAttempts) await sleep(8000);
  }
}
throw new Error(`Preview deployment verification failed after ${maxAttempts} attempts. Last failure: ${lastError?.message || 'unknown error'}`);
