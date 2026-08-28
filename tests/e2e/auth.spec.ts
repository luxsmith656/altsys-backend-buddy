import { expect, test } from '@playwright/test';
import { attachRuntimeMonitor, expectRenderedPage } from '../support/runtime-monitor';

test('direct navigation to protected monitoring redirects to login and remains stable after reload', async ({ page }) => {
  const monitor = attachRuntimeMonitor(page);
  await page.goto('/monitoring', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/login$/);
  await expectRenderedPage(page, 'login', 'Welcome Back');

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/login$/);
  await expectRenderedPage(page, 'login', 'Welcome Back');
  monitor.assertClean();
});

test('invalid credentials show a real authentication error without navigating', async ({ page }) => {
  const monitor = attachRuntimeMonitor(page, {
    // Chromium reports the intentionally rejected login response as a console error.
    allowConsole: [/Failed to load resource: the server responded with a status of 400/],
    allowResponse: (response) =>
      response.status() === 400 && response.url().includes('/auth/v1/token?grant_type=password'),
  });

  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.getByLabel(/email/i).fill('release-gate-invalid@example.invalid');
  await page.getByLabel(/password/i).fill('definitely-not-a-real-password');
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();

  await expect(page).toHaveURL(/\/login$/);
  await expect(page.locator('[data-sonner-toast]')).toBeVisible();
  await expect(page.locator('[data-sonner-toast]')).not.toContainText(/success/i);
  monitor.assertClean();
});
