import { expect, test } from 'playwright/test';

for (const width of [360, 768, 1440]) {
  test(`RODEX monochrome palette at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const app = page.locator('.rodex-monochrome-theme');
    await expect(app).toBeVisible();
    await expect(page.locator('.rodex-header-brand')).toBeVisible();

    const audit = await page.evaluate(() => {
      const root = document.querySelector('.rodex-monochrome-theme');
      if (!root) return { failures: ['Missing theme root'], count: 0 };
      const failures: string[] = [];
      let count = 0;
      const channels = (cssValue: string) => {
        const results: number[][] = [];
        const pattern = /rgba?\\(\\s*(\\d{1,3})[\\s,]+(\\d{1,3})[\\s,]+(\\d{1,3})/g;
        for (const m of cssValue.matchAll(pattern)) {
          results.push([Number(m[1]), Number(m[2]), Number(m[3])]);
        }
        return results;
      };
      const targets = [root, ...root.querySelectorAll('*')];
      for (const element of targets) {
        const el = element as HTMLElement;
        if (getComputedStyle(el).display === 'none') continue;
        const style = getComputedStyle(el);
        for (const prop of ['color','backgroundColor','backgroundImage','borderTopColor','borderBottomColor','outlineColor','fill','stroke']) {
          const value = style.getPropertyValue(prop.replace(/[A-Z]/g, s => '-' + s.toLowerCase()));
          if (!value || value === 'none') continue;
          for (const rgb of channels(value)) {
            count++;
            if (Math.max(...rgb) - Math.min(...rgb) > 1) {
              failures.push(`${el.tagName.toLowerCase()}.${(el.className?.toString() || '').slice(0,60)} ${prop}=${value.slice(0,85)}`);
              if (failures.length >= 20) break;
            }
          }
          if (failures.length >= 20) break;
        }
        if (failures.length >= 20) break;
      }
      return { failures, count };
    });

    expect(audit.count, 'The browser should inspect computed RGB styles').toBeGreaterThan(0);
    expect(audit.failures, 'Visible UI colours must stay neutral').toEqual([]);
  });
}
