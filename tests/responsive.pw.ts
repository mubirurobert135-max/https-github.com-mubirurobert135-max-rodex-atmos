import { expect, test } from 'playwright/test';

const viewports = [
  { width: 320, height: 700, device: 'small phone' },
  { width: 360, height: 780, device: 'Android phone' },
  { width: 390, height: 844, device: 'iPhone-sized phone' },
  { width: 430, height: 932, device: 'large phone' },
  { width: 768, height: 1024, device: 'portrait tablet' },
  { width: 1024, height: 768, device: 'landscape tablet' },
  { width: 1440, height: 900, device: 'desktop' },
];

for (const { width, height, device } of viewports) {
  test(`responsive navigation and horizontal layout at ${width}px (${device})`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const header = page.locator('header.sticky');
    await expect(header).toBeVisible();
    await expect(header.getByRole('textbox', { name: 'Search city or country' })).toBeVisible();

    const mobileNav = page.getByRole('navigation', { name: 'Mobile Navigation' });
    if (width < 1024) {
      await expect(mobileNav).toBeVisible();
      await expect(mobileNav.locator('button')).toHaveCount(6);
      await expect(mobileNav.getByRole('button', { name: 'Open RODEX AI Voice and Chat Assistant' })).toBeVisible();

      const mapButton = mobileNav.getByRole('button', { name: 'Interactive Weather Map' });
      await mapButton.click();
      await expect(mapButton).toHaveAttribute('aria-current', 'page');

      const dashboardButton = mobileNav.getByRole('button', { name: 'Weather Dashboard' });
      await dashboardButton.click();
      await expect(dashboardButton).toHaveAttribute('aria-current', 'page');
    } else {
      await expect(mobileNav).toBeHidden();
      await expect(page.getByRole('navigation', { name: 'Primary Navigation' })).toBeVisible();
      await expect(header.getByRole('button', { name: 'Open RODEX AI from header navigation' })).toBeVisible();
    }

    const diagnostics = await page.evaluate(() => {
      const shortcutButtons = Array.from(document.querySelectorAll<HTMLElement>('.rodex-header-shortcuts > button'));
      const boxes = shortcutButtons.map((button) => {
        const rect = button.getBoundingClientRect();
        return { left: rect.left, right: rect.right, width: rect.width };
      });
      const overlappedShortcuts = boxes.some((box, i) =>
        boxes.slice(i + 1).some((other) => Math.min(box.right, other.right) - Math.max(box.left, other.left) > 2)
      );
      return {
        horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        overlappedShortcuts,
        viewport: window.innerWidth,
      };
    });

    expect(diagnostics.viewport).toBe(width);
    expect(diagnostics.horizontalOverflow, 'The page must not scroll horizontally').toBeLessThanOrEqual(4);
    expect(diagnostics.overlappedShortcuts, 'Header shortcuts must not overlap').toBe(false);

    await page.screenshot({ path: `test-results/rodex-responsive-${width}px.png`, fullPage: true });
  });
}
