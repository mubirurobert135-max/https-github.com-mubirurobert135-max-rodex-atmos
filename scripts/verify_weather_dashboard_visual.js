import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const outDir = path.resolve('visual-artifacts');
fs.mkdirSync(outDir, { recursive: true });

const targets = [
  { name: 'desktop-1440', width: 1440, height: 900 },
  { name: 'desktop-1280', width: 1280, height: 800 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'mobile-390', width: 390, height: 844 },
  { name: 'mobile-320', width: 320, height: 700 }
];

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({
    geolocation: { latitude: 0.3163, longitude: 32.5822 },
    permissions: ['geolocation'],
    viewport: { width: 1440, height: 900 }
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  const response = await page.goto('http://127.0.0.1:3000', {
    waitUntil: 'domcontentloaded',
    timeout: 30000
  });
  if (!response || !response.ok()) {
    throw new Error(`Application did not return a successful page response: ${response?.status() ?? 'no response'}`);
  }

  await page.locator('.wx-reference-shell').waitFor({ state: 'visible', timeout: 45000 });
  // Let the real nearby-location requests settle before capturing the visual reference.
  await page.waitForFunction(() => document.querySelectorAll('.wx-nearby-city').length > 0 || document.querySelector('.wx-nearby-empty') !== null, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1000);

  for (const target of targets) {
    await page.setViewportSize({ width: target.width, height: target.height });
    await page.waitForTimeout(500);
    const layout = await page.evaluate(() => ({
      viewport: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      shellCount: document.querySelectorAll('.wx-reference-shell').length,
      mainTitle: document.querySelector('.wx-storm-title')?.textContent?.trim() || ''
    }));
    if (layout.shellCount !== 1) {
      throw new Error(`Expected exactly one weather dashboard at ${target.name}; found ${layout.shellCount}`);
    }
    if (layout.documentWidth > layout.viewport + 1) {
      throw new Error(`Horizontal overflow at ${target.name}: viewport ${layout.viewport}px, document ${layout.documentWidth}px`);
    }
    await page.screenshot({ path: path.join(outDir, `${target.name}.png`), fullPage: false });
    console.log(`PASS ${target.name}: ${layout.mainTitle}; document width ${layout.documentWidth}px`);
  }

  // Verify the real search control, tab switching, and assistant entrypoint after responsive captures.
  const searchInput = page.getByRole('textbox', { name: 'Search city or country' });
  await page.setViewportSize({ width: 1440, height: 900 });
  await searchInput.waitFor({ state: 'visible', timeout: 5000 });

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileNav = page.locator('nav[aria-label="Mobile Navigation"]');
  const selectedBeforeMap = mobileNav.locator('button[aria-current="page"]');
  if (await selectedBeforeMap.count() !== 1 || await selectedBeforeMap.getAttribute('aria-label') !== 'Weather Dashboard') {
    throw new Error('Mobile dashboard tab does not expose a single accessible active state.');
  }
  const rootBottomPadding = await page.locator('#root').evaluate((el) => Number.parseFloat(getComputedStyle(el).paddingBottom));
  if (rootBottomPadding < 90) {
    throw new Error(`Mobile content lacks bottom clearance for the navigation dock (${rootBottomPadding}px).`);
  }

  await page.getByRole('button', { name: 'Interactive Weather Map' }).click();
  await page.locator('.wx-reference-shell').waitFor({ state: 'detached', timeout: 10000 });
  const selectedMapTab = mobileNav.locator('button[aria-current="page"]');
  if (await selectedMapTab.count() !== 1 || await selectedMapTab.getAttribute('aria-label') !== 'Interactive Weather Map') {
    throw new Error('Mobile map tab does not expose a single accessible active state.');
  }
  await page.getByRole('button', { name: 'Weather Dashboard' }).click();
  await page.locator('.wx-reference-shell').waitFor({ state: 'visible', timeout: 10000 });

  await page.getByRole('button', { name: 'Open RODEX AI Voice and Chat Assistant' }).click();
  await page.getByRole('dialog').waitFor({ state: 'visible', timeout: 5000 });
  await page.getByTitle('Close Assistant').click();
  await page.getByRole('dialog').waitFor({ state: 'detached', timeout: 5000 });
  console.log('PASS interaction checks: search visible, map/dashboard tabs switch, assistant dialog opens and closes.');

  if (pageErrors.length) {
    throw new Error(`Browser runtime errors detected:\n${pageErrors.join('\n')}`);
  }
  console.log('RODEX Atmos visual layout checks passed.');
  await context.close();
} finally {
  await browser.close();
}
