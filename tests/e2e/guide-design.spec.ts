import { expect, test } from '@playwright/test';
import { installGuideFixture, monitorGuideFixture } from '../support/guide-fixture';

test('legacy guide schema keeps assignments usable and reports reviews unavailable honestly', async ({ page }) => {
  await installGuideFixture(page, { legacyProfileSchema: true });
  const reviewRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/rest/v1/guide_reviews')) reviewRequests.push(request.url());
  });
  await page.goto('/guide');
  await expect(page.getByRole('button', { name: 'Accept Hike' })).toBeVisible();
  await page.getByRole('tab', { name: 'Reviews', exact: true }).click();
  await expect(page.getByText('Guide reviews are unavailable until the database upgrade is applied.')).toBeVisible();
  expect(reviewRequests).toEqual([]);
  await expect(page.getByText('No hiker reviews recorded yet.')).toHaveCount(0);
});

for (const width of [360, 768, 1440]) {
  test(`guide workspace navigation and dialogs at ${width}px`, async ({ page }, testInfo) => {
    const monitor = monitorGuideFixture(page);
    await page.setViewportSize({ width, height: 900 });
    await installGuideFixture(page);
    await page.goto('/guide');
    await expect(page.getByRole('heading', { name: 'Alex Rivera' })).toBeVisible();
    expect(await page.locator('.guide-workspace').evaluate((el) => getComputedStyle(el).getPropertyValue('--background').trim())).toBe('148 40% 94%');
    await expect(page.getByRole('button', { name: 'Accept Hike' })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`guide-${width}.png`), fullPage: true });
    await page.getByRole('combobox', { name: 'Show', exact: true }).click();
    await page.getByRole('option', { name: 'Completed', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Accept Hike' })).toHaveCount(0);
    await expect(page.locator('.guide-assignment')).toHaveCount(1);
    await page.getByRole('button', { name: 'View Details' }).click();
    await expect(page.getByRole('dialog')).toContainText('Robin Cruz');
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    for (const [tab, heading] of [['Earnings', 'Earnings history'], ['Reviews', 'Hiker reviews'], ['Team', 'Your guide team'], ['Schedule', 'Request off-duty']]) {
      await page.getByRole('tab', { name: tab, exact: true }).click();
      await expect(page.getByRole('heading', { name: heading })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await page.getByRole('button', { name: 'Guide profile and sharing' }).click();
    await expect(page.getByRole('dialog')).toContainText('Alex Rivera');
    await expect(page.getByRole('dialog').getByRole('button', { name: 'Referral' })).toBeVisible();
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await page.getByRole('tab', { name: /Assignments/ }).click();
    await expect(page.getByRole('heading', { name: 'Assignments' })).toBeVisible();
    await page.getByRole('button', { name: 'Switch to dark mode' }).click();
    expect(await page.locator('.guide-workspace').evaluate((el) => getComputedStyle(el).getPropertyValue('--background').trim())).toBe('160 10% 6%');
    await page.screenshot({ path: testInfo.outputPath(`guide-dark-${width}.png`) });
    monitor.assertClean();
  });
}
