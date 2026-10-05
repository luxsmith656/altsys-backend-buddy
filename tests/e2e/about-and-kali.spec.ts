import { expect, test } from '@playwright/test';
import { attachRuntimeMonitor } from '../support/runtime-monitor';

for (const width of [390, 1440]) {
  test(`About directions and booking Kali remain usable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const monitor = attachRuntimeMonitor(page);
    await page.goto('/about');
    await expect(page.getByRole('heading', { name: 'How to Get to Mt. Kalisungan' })).toBeVisible();
    await expect(page.getByText('Ready to Hike Mount Kalisungan?', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Explore 3D Map' })).toHaveCount(0);
    const ask = page.getByRole('button', { name: 'Need more information? Ask Kali' });
    await expect(ask).toBeDisabled();
    await page.getByLabel('Where are you coming from?').fill('San Pablo City');
    await page.getByLabel('Preferred jump-off').selectOption('Sto. Tomas');
    await expect(ask).toBeEnabled();
    const directions = new URL((await page.getByRole('link', { name: 'Open directions' }).getAttribute('href'))!);
    expect(directions.searchParams.get('origin')).toBe('San Pablo City');
    expect(directions.searchParams.get('destination')).toBe('Sto. Tomas, Calauan, Laguna, Philippines');
    await page.screenshot({ path: `test-results/about-directions-${width}.png`, fullPage: false });
    await monitor.waitForRequests();
    await page.goto('/booking');
    const launcher = page.getByRole('button', { name: 'Ask Kali about your booking' });
    await expect(launcher).toBeVisible();
    await launcher.click();
    await expect(page.getByLabel('Chat with Kali', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Close chat', exact: true }).click();
    await expect(page.getByLabel('Chat with Kali', { exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(2);
    await monitor.waitForRequests();
    monitor.assertClean();
  });
}
