import { expect, test } from '@playwright/test';
import { attachRuntimeMonitor } from '../support/runtime-monitor';

const SEEDS = ['/', '/login', '/register', '/map', '/chat', '/booking'];

test('rendered internal links resolve without NotFound, blank pages, or redirect loops', async ({ page }) => {
  const destinations = new Set<string>();

  for (const seed of SEEDS) {
    const monitor = attachRuntimeMonitor(page);
    await page.goto(seed, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => (document.querySelector('#root')?.textContent?.trim().length || 0) > 20);
    const links = await page.locator('a[href]').evaluateAll((anchors) =>
      anchors
        .map((anchor) => (anchor as HTMLAnchorElement).href)
        .filter((href) => href.startsWith(window.location.origin)),
    );
    links.forEach((href) => destinations.add(new URL(href).pathname + new URL(href).search));
    monitor.assertClean();
  }

  expect(destinations.size).toBeGreaterThan(3);

  for (const destination of destinations) {
    const monitor = attachRuntimeMonitor(page);
    const response = await page.goto(destination, { waitUntil: 'domcontentloaded' });
    expect(response?.status(), destination).toBeLessThan(400);
    await page.waitForFunction(() => (document.querySelector('#root')?.textContent?.trim().length || 0) > 20);
    await expect(page.locator('body'), destination).not.toContainText('Oops! Page not found');
    await expect(page.getByTestId('fatal-error-boundary'), destination).toHaveCount(0);
    monitor.assertClean();
  }
});

test('monitoring is not exposed in normal navigation', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('a[href="/monitoring"]')).toHaveCount(0);
});
