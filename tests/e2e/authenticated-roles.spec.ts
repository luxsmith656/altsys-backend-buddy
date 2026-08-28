import { expect, test } from '@playwright/test';
import { attachRuntimeMonitor, expectRenderedPage } from '../support/runtime-monitor';

const ROLE_CASES = [
  { role: 'super_admin', email: process.env.E2E_SUPER_ADMIN_EMAIL, password: process.env.E2E_SUPER_ADMIN_PASSWORD, path: '/central', pageKey: 'central' },
  { role: 'admin', email: process.env.E2E_ADMIN_EMAIL, password: process.env.E2E_ADMIN_PASSWORD, path: '/admin', pageKey: 'admin' },
  { role: 'ranger', email: process.env.E2E_RANGER_EMAIL, password: process.env.E2E_RANGER_PASSWORD, path: '/ranger', pageKey: 'ranger' },
  { role: 'guide', email: process.env.E2E_GUIDE_EMAIL, password: process.env.E2E_GUIDE_PASSWORD, path: '/guide', pageKey: 'guide' },
  { role: 'hiker', email: process.env.E2E_HIKER_EMAIL, password: process.env.E2E_HIKER_PASSWORD, path: '/hiker', pageKey: 'hiker' },
] as const;

for (const account of ROLE_CASES) {
  test(`authenticated ${account.role} can load its dashboard and survive reload`, async ({ page }) => {
    const missing = [account.email ? '' : 'email', account.password ? '' : 'password'].filter(Boolean);
    if (missing.length > 0) {
      if (process.env.E2E_REQUIRE_AUTH === 'true') {
        throw new Error(`Missing E2E_${account.role.toUpperCase()}_${missing.join(' and ').toUpperCase()} for authenticated role coverage.`);
      }
      test.info().annotations.push({
        type: 'configuration',
        description: `${account.role} credentials were not supplied; set E2E_REQUIRE_AUTH=true in CI to make this a release blocker.`,
      });
      return;
    }

    const monitor = attachRuntimeMonitor(page, {
      allowConsole: [/Failed to load resource: the server responded with a status of 400/],
      allowResponse: (response) => response.status() === 400 && response.url().includes('/auth/v1/token?grant_type=password'),
    });
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await page.getByLabel(/email/i).fill(account.email);
    await page.getByLabel(/password/i).fill(account.password);
    await page.getByRole('button', { name: 'Sign In', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${account.path.replace('/', '\\/')}(?:\\?.*)?$`), { timeout: 15_000 });
    await expectRenderedPage(page, account.pageKey, /Dashboard|Hike|Checkpoint|Duty|Central/i);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(new RegExp(`${account.path.replace('/', '\\/')}(?:\\?.*)?$`), { timeout: 15_000 });
    await expect(page.getByTestId(`fatal-error-boundary`)).toHaveCount(0);
    monitor.assertClean();
  });
}
