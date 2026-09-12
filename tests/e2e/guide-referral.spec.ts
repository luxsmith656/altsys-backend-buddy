import { expect, test } from '@playwright/test';
import { installGuideFixture } from '../support/guide-fixture';

test('guide referral copies this guide and the booking preserves a manual override', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await installGuideFixture(page);
  await page.goto('/guide');
  await page.locator('.guide-header').getByRole('button', { name: 'Referral', exact: true }).click();
  const link = await page.evaluate(() => navigator.clipboard.readText());
  expect(link).toBe('http://127.0.0.1:4173/booking?guide=guide-preview');
  const date = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  await page.goto(link + '&date=' + date + '&ready=1');
  await expect(page).toHaveURL(/guide=guide-preview/);
  await expect(page.getByRole('combobox', { name: /Preferred Guide/ })).toContainText('Alex Rivera');
  const dismiss = page.getByRole('button', { name: 'Dismiss Kali reminder' });
  if (await dismiss.isVisible()) await dismiss.click();
  await page.getByRole('combobox', { name: /Preferred Guide/ }).click();
  await page.getByRole('option', { name: 'None (Admin will assign)', exact: true }).click();
  await expect(page.getByRole('combobox', { name: /Preferred Guide/ })).toContainText('None (Admin will assign)');
  await page.getByRole('combobox', { name: /Starting Location/ }).click();
  await page.getByRole('option', { name: 'Lamot 1', exact: true }).click();
  await expect(page.getByRole('combobox', { name: /Starting Location/ })).toContainText('Lamot 1');
  await expect(page.getByRole('combobox', { name: /Preferred Guide/ })).toContainText('None (Admin will assign)');
});
