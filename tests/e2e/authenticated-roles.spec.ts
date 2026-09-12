import { expect, test } from '@playwright/test';
import { attachRuntimeMonitor, expectRenderedPage } from '../support/runtime-monitor';

const ROLE_CASES = [
  { role: 'super_admin', email: process.env.E2E_SUPER_ADMIN_EMAIL, password: process.env.E2E_SUPER_ADMIN_PASSWORD, path: '/central', pageKey: 'central' },
  { role: 'mdrrmo', email: process.env.E2E_MDRRMO_EMAIL, password: process.env.E2E_MDRRMO_PASSWORD, path: '/mdrrmo', pageKey: 'mdrrmo' },
  { role: 'admin', email: process.env.E2E_ADMIN_EMAIL, password: process.env.E2E_ADMIN_PASSWORD, path: '/admin', pageKey: 'admin' },
  { role: 'sto_tomas_admin', email: process.env.E2E_STOTOMAS_ADMIN_EMAIL, password: process.env.E2E_STOTOMAS_ADMIN_PASSWORD, path: '/admin', pageKey: 'admin' },
  { role: 'guide', email: process.env.E2E_GUIDE_EMAIL, password: process.env.E2E_GUIDE_PASSWORD, path: '/guide', pageKey: 'guide' },
  { role: 'hiker', email: process.env.E2E_HIKER_EMAIL, password: process.env.E2E_HIKER_PASSWORD, path: '/hiker', pageKey: 'hiker' },
] as const;

for (const account of ROLE_CASES) {
  test(`authenticated ${account.role} can load its dashboard and survive reload`, async ({ page }) => {
    const missing = [account.email ? '' : 'email', account.password ? '' : 'password'].filter(Boolean);
    if (missing.length > 0) {
      throw new Error(`Missing E2E_${account.role.toUpperCase()}_${missing.join(' and ').toUpperCase()} for authenticated role coverage. Supply test credentials; authentication must not silently pass without running.`);
    }

    const monitor = attachRuntimeMonitor(page);
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await page.getByLabel(/email/i).fill(account.email);
    await page.getByLabel(/password/i).fill(account.password);
    await page.getByRole('button', { name: 'Sign In', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${account.path.replace('/', '\\/')}(?:\\?.*)?$`), { timeout: 15_000 });
    await expectRenderedPage(page, account.pageKey, /Dashboard|Hike|Checkpoint|Duty|Central|Emergency/i);
    if (account.role === 'guide') await expect(page.getByRole('tab', { name: /Earnings/i })).toBeVisible();
    await monitor.waitForRequests();

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(new RegExp(`${account.path.replace('/', '\\/')}(?:\\?.*)?$`), { timeout: 15_000 });
    await expectRenderedPage(page, account.pageKey, /Dashboard|Hike|Checkpoint|Duty|Central|Emergency/i);
    if (account.role === 'guide') await expect(page.getByRole('tab', { name: /Earnings/i })).toBeVisible();
    await monitor.waitForRequests();
    monitor.assertClean();
  });
}
