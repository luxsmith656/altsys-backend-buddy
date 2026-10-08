import { expect, test } from '@playwright/test';
import { APP_ROUTES } from '../../src/app/routes';
import { attachRuntimeMonitor, expectRenderedPage } from '../support/runtime-monitor';

const PUBLIC_EXPECTATIONS: Record<string, string | RegExp> = {
  '/': 'Mt. Kalisungan',
  '/about': 'Geography & Access',
  '/login': 'Welcome Back',
  '/reset-password': 'Set a new password',
  '/register': 'Create Account',
  '/map': 'Check in at your jump-off to start your hike.',
  '/chat': 'Trail Assistant',
  '/booking': 'Book Your',
  '/join-hike': 'Invalid or Expired Link',
  '/join': 'Invalid or Expired Link',
  '/guide/:guideId': 'This guide profile is unavailable',
};

test('document uses the Mt. Kalisungan logo for the browser tab icon', async ({ page, request }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const icon = page.locator('link[rel="icon"]');
  await expect(icon).toHaveAttribute('href', '/mt-kalisungan-logo.png');
  const response = await request.get('/mt-kalisungan-logo.png');
  expect(response.ok()).toBe(true);
  expect(response.headers()['content-type']).toContain('image/png');
});

for (const route of APP_ROUTES) {
  test(`registered route ${route.path} renders the intended page`, async ({ page }) => {
    const monitor = attachRuntimeMonitor(page);
    const path = route.path.replace(':guideId', '00000000-0000-0000-0000-000000000000');
    const response = await page.goto(path, { waitUntil: 'domcontentloaded' });

    expect(response?.status()).toBeLessThan(400);

    if (route.access === 'roles' || route.path === '/dashboard') {
      await expect(page).toHaveURL(/\/login(?:\?.*)?$/);
      await expectRenderedPage(page, 'login', 'Welcome Back');
    } else {
      await expectRenderedPage(page, route.pageKey, PUBLIC_EXPECTATIONS[route.path]);
      if (route.path === '/map') {
        await expect(page.getByRole('heading', { name: 'Map', exact: true })).toBeVisible();
        await expect(page.locator('.leaflet-container')).toBeVisible();
        await expect(page.getByRole('button', { name: 'Zoom in', exact: true })).toBeVisible();
      }
    }

    monitor.assertClean();
  });
}
