import { expect, test } from '@playwright/test';

test('installed production app can reload its map without a network connection', async ({ page, context }) => {
  await page.goto('/map');
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('.leaflet-container').first()).toBeVisible();
  await expect(page.locator('body')).not.toContainText('Application error');
  await context.setOffline(false);
});
