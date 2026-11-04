import { expect, test } from 'playwright/test';

test('RODEX AI chat accepts one request even when send is triggered twice', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  let requestCount = 0;
  await page.route('**/api/ai/chat', async (route) => {
    requestCount += 1;
    await new Promise((resolve) => setTimeout(resolve, 200));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ reply: 'RODEX test reply: your weather is ready.' }),
    });
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Open RODEX AI from header navigation' }).click();
  await page.getByRole('button', { name: 'Text Chat', exact: true }).click();

  const input = page.getByRole('textbox', { name: 'Ask assistant message' });
  await expect(input).toBeVisible();
  await input.fill('Check my current weather please');
  // Directly trigger two submit events in one browser task to catch a state-only
  // lock that React has not yet rendered as a disabled submit button.
  await input.evaluate((node: HTMLInputElement) => {
    const form = node.closest('form');
    if (!form) throw new Error('RODEX chat form not found');
    form.requestSubmit();
    form.requestSubmit();
  });

  await expect(page.getByText('RODEX test reply: your weather is ready.')).toBeVisible();
  expect(requestCount).toBe(1);
  await expect(page.getByText('Check my current weather please', { exact: true })).toHaveCount(1);
});

test('Closing RODEX AI prevents a late network reply from appearing in chat', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  let started = false;
  // Hold the HTTP reply until after the close operation to test cancellation
  // rather than relying on a timer that can finish before the modal closes.
  let releaseResponse!: () => void;
  const responseGate = new Promise<void>((resolve) => { releaseResponse = resolve; });
  await page.route('**/api/ai/chat', async (route) => {
    started = true;
    await responseGate;
    try {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ reply: 'Stale reply should never appear.' }),
      });
    } catch { /* A correctly cancelled client may end its request first. */ }
  });

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Open RODEX AI from header navigation' }).click();
  await page.getByRole('button', { name: 'Text Chat', exact: true }).click();
  const input = page.getByRole('textbox', { name: 'Ask assistant message' });
  await input.fill('Check cancellation behavior');
  await input.press('Enter');
  await expect.poll(() => started).toBe(true);
  await page.getByTitle('Close Assistant').click();
  await expect(page.getByRole('dialog')).toBeHidden();
  releaseResponse();
  await page.waitForTimeout(250);

  await page.getByRole('button', { name: 'Open RODEX AI from header navigation' }).click();
  await page.getByRole('button', { name: 'Text Chat', exact: true }).click();
  await expect(page.getByText('Stale reply should never appear.')).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Ask assistant message' })).toBeEnabled();
});
