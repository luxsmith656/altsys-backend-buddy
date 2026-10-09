import { expect, test } from '@playwright/test';
import { installGuideFixture } from '../support/guide-fixture';

test('guide referral copies this guide and the booking preserves a manual override', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await installGuideFixture(page);
  await page.goto('/guide');
  await page.locator('.guide-header').getByRole('button', { name: 'Referral', exact: true }).click();
  const link = await page.evaluate(() => navigator.clipboard.readText());
  expect(link).toBe(`${new URL(page.url()).origin}/booking?referral=KALI-ALEX01`);
  const date = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  await page.goto(link + '&date=' + date + '&ready=1');
  await expect(page).toHaveURL(/referral=KALI-ALEX01/);
  await expect(page.getByText('Referred Guide: Alex Rivera', { exact: true })).toBeVisible();
  const dismiss = page.getByRole('button', { name: 'Dismiss Kali reminder' });
  if (await dismiss.isVisible()) await dismiss.click();
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(page.getByLabel(/guide referral code/i)).toBeVisible();
  await page.getByLabel(/guide referral code/i).fill('KALI-ALEX01');
  await page.getByRole('button', { name: 'Apply Code', exact: true }).click();
  await expect(page.getByText('Referred Guide: Alex Rivera', { exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: /Starting Location/ }).click();
  await page.getByRole('option', { name: 'Lamot 1', exact: true }).click();
  await expect(page.getByRole('combobox', { name: /Starting Location/ })).toContainText('Lamot 1');
});

test('booking remains usable when the selected date has no forecast entry', async ({ page }) => {
  await installGuideFixture(page);
  const dateWithoutForecast = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

  await page.goto(`/booking?date=${dateWithoutForecast}&ready=1`);
  await expect(page.getByRole('heading', { name: 'Select Schedule' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeEnabled();
  await expect(page.locator('body')).not.toContainText('Application error');
});
