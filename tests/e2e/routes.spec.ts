import { expect, test } from '@playwright/test';
import { APP_ROUTES } from '../../src/app/routes';
import { attachRuntimeMonitor, expectRenderedPage } from '../support/runtime-monitor';

const PUBLIC_EXPECTATIONS: Record<string, string | RegExp> = {
  '/': 'Mt. Kalisungan',
  '/login': 'Welcome Back',
  '/register': 'Create Account',
  '/map': /Mt\. Kalisungan (Tracking Console|Hike)/,
  '/chat': 'Trail Assistant',
  '/booking': 'Book Your',
  '/join-hike': 'Invalid or Expired Link',
  '/join': 'Invalid or Expired Link',
  '/guide/:guideId': 'This guide profile is unavailable',
};

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
    }

    monitor.assertClean();
  });
}
