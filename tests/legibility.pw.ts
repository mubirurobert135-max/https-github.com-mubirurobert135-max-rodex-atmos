import { expect, test } from 'playwright/test';

for (const width of [320, 390, 768, 1024, 1440]) {
  test(`RODEX logo and dashboard labels remain readable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width < 600 ? 844 : 900 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const logo = page.locator('.rodex-header-brand img.rodex-brand-symbol');
    await expect(logo).toBeVisible();
    await expect.poll(() => logo.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);
    await expect(page.locator('.rodex-brand-name')).toBeVisible();

    const dashboard = page.locator('.wx-reference-shell');
    await expect(dashboard).toBeVisible({ timeout: 25_000 });
    const keyLabels = [
      '.wx-dashboard-panel-heading h2',
      '.wx-dashboard-hour-time',
      '.wx-dashboard-day-name',
      '.wx-hero-metric-copy small',
      '.wx-reference-kicker',
    ];
    for (const selector of keyLabels) {
      const item = dashboard.locator(selector).first();
      await expect(item, `Missing label: ${selector}`).toBeVisible();
      const metric = await item.evaluate((node) => {
        const css = getComputedStyle(node);
        const match = css.color.match(/\\d+(?:\\.\\d+)?/g);
        const rgb = match ? match.slice(0,3).map(Number) : [0,0,0];
        return {
          px: Number.parseFloat(css.fontSize),
          brightness: Math.min(...rgb),
          lineHeight: Number.parseFloat(css.lineHeight),
          text: node.textContent?.trim() || '',
        };
      });
      expect(metric.px, `Tiny label at ${width}px: ${selector}`).toBeGreaterThanOrEqual(10);
      expect(metric.brightness, `Dim label at ${width}px: ${selector}`).toBeGreaterThanOrEqual(175);
      expect(metric.text.length, `Empty label: ${selector}`).toBeGreaterThan(0);
    }

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    expect(overflow, `Page overflows at ${width}px`).toBeLessThanOrEqual(4);
    if (width >= 1280) {
      const railMark = page.locator('img.wx-reference-mark');
      await expect(railMark).toBeVisible();
      await expect.poll(() => railMark.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);
    }
    await page.screenshot({ path: `test-results/rodex-legibility-${width}.png`, fullPage: true });
  });
}
