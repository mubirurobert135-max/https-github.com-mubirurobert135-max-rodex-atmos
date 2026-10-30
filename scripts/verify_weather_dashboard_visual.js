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
  await page.waitForSelector('.wx-map-discovery', { state: 'attached', timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(350);

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
      const overflowDetails = await page.evaluate(() => Array.from(document.querySelectorAll('body *'))
        .map((el) => {
          const rect = el.getBoundingClientRect();
          const style = getComputedStyle(el);
          return {
            tag: el.tagName.toLowerCase(),
            id: el.id || '',
            className: typeof el.className === 'string' ? el.className.slice(0, 120) : '',
            left: Math.round(rect.left),
            right: Math.round(rect.right),
            width: Math.round(rect.width),
            scrollWidth: el.scrollWidth,
            clientWidth: el.clientWidth,
            position: style.position,
            whiteSpace: style.whiteSpace
          };
        })
        .filter((item) => item.width > 0 && (item.right > window.innerWidth + 1 || item.left < -1))
        .sort((a, b) => b.right - a.right)
        .slice(0, 15));
      throw new Error(`Horizontal overflow at ${target.name}: viewport ${layout.viewport}px, document ${layout.documentWidth}px. Elements: ${JSON.stringify(overflowDetails)}`);
    }
    await page.screenshot({ path: path.join(outDir, `${target.name}.png`), fullPage: false });
    console.log(`PASS ${target.name}: ${layout.mainTitle}; document width ${layout.documentWidth}px`);
  }

  // Verify the real search control, tab switching, and assistant entrypoint after responsive captures.
  const searchInput = page.getByRole('textbox', { name: 'Search city or country' });
  await page.setViewportSize({ width: 1440, height: 900 });
  await searchInput.waitFor({ state: 'visible', timeout: 5000 });
  const desktopActiveRail = page.locator('.wx-reference-rail-button.is-active').first();
  const desktopActiveStyle = await desktopActiveRail.evaluate((el) => {
    const style = getComputedStyle(el);
    return { backgroundImage: style.backgroundImage, backgroundColor: style.backgroundColor, color: style.color, weight: Number(style.fontWeight) };
  });
  if ((desktopActiveStyle.backgroundImage === 'none' && desktopActiveStyle.backgroundColor === 'rgba(0, 0, 0, 0)') || desktopActiveStyle.weight < 600) {
    throw new Error('Desktop navigation active tab is not visibly highlighted or legible.');
  }

  if (await page.getByText('PWA Ready', { exact: true }).count() !== 0) {
    throw new Error('The non-actionable PWA Ready status badge should be removed.');
  }
  const accountShortcut = page.locator('button.header-account-shortcut');
  if (await accountShortcut.count() !== 1 || !(await accountShortcut.isVisible())) {
    throw new Error('The Account shortcut must be visible directly beside the location search.');
  }

  await page.setViewportSize({ width: 390, height: 844 });
  if (!(await accountShortcut.isVisible())) {
    throw new Error('The Account shortcut must remain visible on mobile.');
  }
  const mobileNav = page.locator('nav[aria-label="Mobile Navigation"]');
  const mobileActiveStyle = await mobileNav.locator('button[aria-current="page"]').evaluate((el) => {
    const style = getComputedStyle(el);
    return { background: style.backgroundImage + ' ' + style.backgroundColor, color: style.color, weight: Number(style.fontWeight) };
  });
  if ((mobileActiveStyle.backgroundImage === 'none' && mobileActiveStyle.backgroundColor === 'rgba(0, 0, 0, 0)') || mobileActiveStyle.weight < 600) {
    throw new Error('Mobile active tab is not visibly highlighted or legible.');
  }
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
  await page.locator('.leaflet-container').waitFor({ state: 'visible', timeout: 10000 });
  await page.getByRole('textbox', { name: 'Search a place on the map' }).waitFor({ state: 'visible', timeout: 5000 });
  const mapViewport = await page.evaluate(() => ({ viewport: window.innerWidth, width: document.documentElement.scrollWidth }));
  if (mapViewport.width > mapViewport.viewport + 1) {
    throw new Error(`Weather map overflows at mobile width: viewport ${mapViewport.viewport}px, document ${mapViewport.width}px`);
  }
  const selectedMapTab = mobileNav.locator('button[aria-current="page"]');
  if (await selectedMapTab.count() !== 1 || await selectedMapTab.getAttribute('aria-label') !== 'Interactive Weather Map') {
    throw new Error('Mobile map tab does not expose a single accessible active state.');
  }
  await page.getByRole('button', { name: 'Weather Dashboard' }).click();
  await page.locator('.wx-reference-shell').waitFor({ state: 'visible', timeout: 10000 });

  const moreWeather = page.locator('.wx-more-weather-toggle');
  await moreWeather.waitFor({ state: 'visible', timeout: 5000 });
  if (await moreWeather.getAttribute('aria-expanded') !== 'false') {
    throw new Error('Additional weather information should be collapsed by default.');
  }
  await moreWeather.click();
  await page.locator('#wx-more-weather-content').waitFor({ state: 'visible', timeout: 5000 });
  if (await moreWeather.getAttribute('aria-expanded') !== 'true') {
    throw new Error('The additional weather information disclosure should expose its expanded state.');
  }
  await moreWeather.click();

  await page.getByRole('button', { name: 'Open RODEX AI Voice and Chat Assistant' }).click();
  await page.getByRole('dialog').waitFor({ state: 'visible', timeout: 5000 });
  await page.getByTitle('Close Assistant').click();
  await page.getByRole('dialog').waitFor({ state: 'detached', timeout: 5000 });
  console.log('PASS interaction checks: desktop/mobile navigation, account shortcut, details disclosure, search, map/dashboard switching, assistant dialog.');

  if (pageErrors.length) {
    throw new Error(`Browser runtime errors detected:\n${pageErrors.join('\n')}`);
  }
  console.log('RODEX Atmos visual layout checks passed.');
  await context.close();
} finally {
  await browser.close();
}
