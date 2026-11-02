import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { chromium } from 'playwright';

async function reservePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Could not reserve a local test port.');
  const port = address.port;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function fetchWithTimeout(url, timeoutMs = 5000) {
  return fetch(url, {
    redirect: 'follow',
    cache: 'no-store',
    signal: AbortSignal.timeout(timeoutMs)
  });
}

const port = await reservePort();
const origin = `http://127.0.0.1:${port}`;
const env = { ...process.env, NODE_ENV: 'production', PORT: String(port) };
delete env.VERCEL;
delete env.VERCEL_ENV;
delete env.VERCEL_URL;
// Keep this test offline and avoid making paid AI/TTS requests during startup.
delete env.GEMINI_API_KEY;
delete env.API_KEY;
delete env.WEATHERAPI_KEY;

const server = spawn(process.execPath, ['server.js'], {
  cwd: process.cwd(),
  env,
  stdio: 'inherit'
});

let browser;
try {
  let healthResponse;
  let health;
  let lastError;

  for (let attempt = 0; attempt < 30; attempt++) {
    if (server.exitCode !== null) throw new Error(`Production server exited with code ${server.exitCode}.`);
    try {
      healthResponse = await fetchWithTimeout(`${origin}/api/health`);
      health = await healthResponse.json();
      if (healthResponse.ok && health?.ok === true) break;
      lastError = new Error(`Health check returned HTTP ${healthResponse.status}: ${JSON.stringify(health)}`);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
  }

  if (!healthResponse?.ok || health?.ok !== true || health?.runtime !== 'node') {
    throw new Error(`Node production health check failed: ${lastError?.message || JSON.stringify(health)}`);
  }
  console.log('PASS Node production server starts and /api/health reports runtime=node.');

  const rootResponse = await fetchWithTimeout(origin);
  const html = await rootResponse.text();
  if (!rootResponse.ok || !html.includes('id="root"') || !html.includes('RODEX Atmos')) {
    throw new Error(`Production homepage is not served correctly (HTTP ${rootResponse.status}).`);
  }

  const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+\.(?:js|css))"/g)]
    .map((match) => match[1]);
  if (!assets.some((asset) => asset.endsWith('.js')) || !assets.some((asset) => asset.endsWith('.css'))) {
    throw new Error('Production HTML is missing the application JavaScript or CSS bundle.');
  }
  for (const asset of new Set(assets)) {
    const response = await fetchWithTimeout(new URL(asset, origin).href);
    if (!response.ok) throw new Error(`Static asset ${asset} returned HTTP ${response.status}.`);
  }
  console.log(`PASS Node production server serves the homepage and ${new Set(assets).size} application asset(s).`);

  for (const route of ['/map', '/account', '/privacy']) {
    const response = await fetchWithTimeout(origin + route);
    const body = await response.text();
    if (!response.ok || !body.includes('id="root"')) {
      throw new Error(`SPA route ${route} did not resolve to the application shell (HTTP ${response.status}).`);
    }
  }
  console.log('PASS Node production server resolves client-side routes /map, /account and /privacy.');

  const unknownApi = await fetchWithTimeout(origin + '/api/verification-route-does-not-exist');
  const unknownBody = await unknownApi.json();
  if (unknownApi.status !== 404 || unknownBody?.error !== 'API_ROUTE_NOT_FOUND') {
    throw new Error('Unknown API routes must return a predictable JSON 404 response.');
  }
  console.log('PASS Unknown API paths return JSON 404 responses.');

  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const viewports = [
    { width: 320, height: 720 },
    { width: 360, height: 800 },
    { width: 390, height: 844 },
    { width: 430, height: 932 },
    { width: 768, height: 1024 },
    { width: 820, height: 1180 },
    { width: 1023, height: 768 },
    { width: 1024, height: 768 },
    { width: 1280, height: 800 },
    { width: 1440, height: 900 }
  ];

  for (const viewport of viewports) {
    const page = await browser.newPage({ viewport });
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.locator('#root').waitFor({ state: 'attached' });
    await page.waitForTimeout(120);

    const layout = await page.evaluate(() => ({
      viewport: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
      rootWidth: document.querySelector('#root > div')?.getBoundingClientRect().width || 0
    }));

    if (layout.documentWidth > viewport.width + 1 || layout.bodyWidth > viewport.width + 1) {
      throw new Error(`Horizontal overflow at ${viewport.width}px: ${JSON.stringify(layout)}`);
    }
    if (Math.abs(layout.rootWidth - viewport.width) > 2) {
      throw new Error(`App frame width mismatch at ${viewport.width}px: ${JSON.stringify(layout)}`);
    }

    const mobileNavVisible = await page.locator('nav[aria-label="Mobile Navigation"]').isVisible();
    const desktopNavVisible = await page.locator('nav[aria-label="Primary Navigation"]').isVisible();
    if (viewport.width < 1024 && !mobileNavVisible) {
      throw new Error(`Mobile/tablet navigation is hidden at ${viewport.width}px.`);
    }
    if (viewport.width >= 1024 && !desktopNavVisible) {
      throw new Error(`Desktop navigation is hidden at ${viewport.width}px.`);
    }

    const searchVisible = await page.locator('input[aria-label="Search city or country"]').isVisible();
    const accountVisible = await page.locator('button[aria-label="Open account"], button[aria-label="Sign in or create an account"]').first().isVisible();
    const assistantVisible = await page.locator('button[aria-label="Open RODEX AI from header navigation"], button[aria-label="Open RODEX AI Voice and Chat Assistant"]').first().isVisible();
    const privacyVisible = await page.locator('button[aria-label="Open Privacy Portal"], button[aria-label="Privacy Portal and Preferences"]').first().isVisible();
    if (!searchVisible || !accountVisible || !assistantVisible || !privacyVisible) {
      throw new Error(`A standard navigation feature is not visible at ${viewport.width}px.`);
    }
    if (pageErrors.length) {
      throw new Error(`Browser runtime error at ${viewport.width}px: ${pageErrors.join('; ')}`);
    }

    console.log(`PASS responsive ${viewport.width}x${viewport.height}: no horizontal overflow; navigation and core shortcuts visible.`);
    await page.close();
  }
} finally {
  if (browser) await browser.close();
  if (server.exitCode === null) {
    server.kill('SIGTERM');
    await Promise.race([
      new Promise((resolve) => server.once('exit', resolve)),
      new Promise((resolve) => setTimeout(resolve, 3000))
    ]);
    if (server.exitCode === null) server.kill('SIGKILL');
  }
}
