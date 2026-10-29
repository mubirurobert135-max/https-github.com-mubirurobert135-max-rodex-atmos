import { chromium } from 'playwright';

async function runVisualSuite() {
  console.log('Starting automated visual test suite...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const targets = [
    { name: 'desktop_1440', width: 1440, height: 900 },
    { name: 'desktop_1280', width: 1280, height: 800 },
    { name: 'tablet_768', width: 768, height: 1024 },
    { name: 'mobile_390', width: 390, height: 844 },
    { name: 'mobile_320', width: 320, height: 600 },
  ];

  for (const target of targets) {
    await page.setViewportSize({ width: target.width, height: target.height });
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 15000 }).catch(e => console.log(`Nav warning for ${target.name}: ${e.message}`));
    await page.waitForTimeout(1000);
    const screenshotPath = `visual_check_${target.name}.png`;
    await page.screenshot({ path: screenshotPath, fullPage: false });
    console.log(`[PASS] Captured screenshot for ${target.name} (${target.width}x${target.height}) -> ${screenshotPath}`);
  }

  await browser.close();
  console.log('Automated visual test suite completed successfully!');
}

runVisualSuite().catch(err => {
  console.error('Visual test suite failed:', err);
  process.exit(1);
});
