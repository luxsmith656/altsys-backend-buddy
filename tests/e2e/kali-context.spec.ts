import { expect, test } from '@playwright/test';
import { attachRuntimeMonitor } from '../support/runtime-monitor';

test('booking guidance explains the two-guide plan without blocking the form', async ({ page }) => {
  const monitor = attachRuntimeMonitor(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/booking', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Book Your Hike' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Kali context guidance' })).toHaveCount(0);

  const increase = page.getByRole('button', { name: 'Increase group size' });
  for (let index = 0; index < 5; index += 1) await increase.click();

  await expect(page.getByRole('region', { name: 'Kali context guidance' })).toContainText('front and back');
  await page.getByRole('button', { name: 'Ask Kali in chat' }).click();
  await expect(page.getByText('Kali — AI Trail Assistant')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeVisible();
  await expect(page.getByTestId('fatal-error-boundary')).toHaveCount(0);
  monitor.assertClean();
});
