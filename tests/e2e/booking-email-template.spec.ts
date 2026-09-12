import { expect, test } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

for (const width of [320, 768, 1440]) {
  test(`booking confirmation logo and details render at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('requestfailed', request => errors.push(request.url()));
    await page.goto(pathToFileURL(resolve('email-templates/booking-confirmation-preview.html')).href);
    await expect(page.getByRole('heading', { name: 'Your hike is confirmed' })).toBeVisible();
    const logo = page.getByRole('img', { name: 'Mt. Kalisungan Logo' });
    expect(await logo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
    await expect(page.getByText('Lamot 2 Jump-off', { exact: true })).toBeVisible();
    await expect(page.getByText('October 12, 2026', { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: '+63 917 000 0000' })).toHaveAttribute('href', 'tel:+63 917 000 0000');
    await expect(page.getByRole('heading', { name: 'Call your guide the day before' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.screenshot({ path: info.outputPath(`email-${width}.png`), fullPage: true });
    expect(errors).toEqual([]);
  });
}
