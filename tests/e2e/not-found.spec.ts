import { expect, test } from '@playwright/test';
import { attachRuntimeMonitor } from '../support/runtime-monitor';

test('an unknown route renders NotFound without a blank screen', async ({ page }) => {
  const monitor = attachRuntimeMonitor(page, {
    allowConsole: [/404 Error: User attempted to access non-existent route/],
  });

  const response = await page.goto('/__this-route-must-not-exist__', { waitUntil: 'domcontentloaded' });
  expect(response?.status()).toBeLessThan(400);
  await expect(page.getByRole('heading', { name: '404' })).toBeVisible();
  await expect(page.getByText('Oops! Page not found')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Return to Home' })).toHaveAttribute('href', '/');
  monitor.assertClean();
});
