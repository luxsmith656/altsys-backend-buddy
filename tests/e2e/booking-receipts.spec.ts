import { expect, test } from '@playwright/test';
import { loadEnv } from 'vite';
import { createGuideFixture, monitorGuideFixture } from '../support/guide-fixture';

for (const role of ['hiker', 'guide'] as const) {
  test(`${role} can review the before/after receipt on mobile without rescheduling a completed hike`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 360, height: 740 });
    const monitor = monitorGuideFixture(page);
    const origin = loadEnv('test', process.cwd(), 'VITE_').VITE_SUPABASE_URL;
    const { user, rows } = createGuideFixture();
    rows.user_roles = [{ user_id: user.id, role }];
    rows.bookings = [{ id: 'receipt-booking', user_id: user.id, location_id: 'lamot2', booking_date: '2027-01-01', group_size: 1, status: 'completed',
      notes: JSON.stringify({ fullName: 'Sam Hiker', assignedGuide: 'Alex Rivera', hikeType: 'morning', hikeTime: '04:00', baseFee: 850, totalFee: 850,
        originalQuote: { total: 850, capturedAt: '2026-09-09' }, additionalExpenses: [{ id: 'water', label: 'Water', amount: 60 }, { id: 'porter', label: 'Porter', amount: 300 }],
        horseHelpRequests: [{ stationLabel: 'Stations 5-3', fee: 1000, status: 'completed' }], amountPaid: 2210, paymentSettledAt: '2026-09-09T06:00:00Z', groupPhase: 'completed' }) }];
    rows.booking_assignments = [{ id: 'receipt-assignment', booking_id: 'receipt-booking', guide_id: 'guide-preview', location_id: 'lamot2', status: 'completed' }];
    rows.hiker_sessions = []; rows.booking_messages = [];
    await page.route('https://firestore.googleapis.com/**', route => route.abort('internetdisconnected'));
    await page.routeWebSocket(/supabase\.co\/realtime\//, () => {});
    await page.route(`${origin}/**`, async route => {
      const request = route.request(); const url = new URL(request.url());
      if (url.pathname.startsWith('/auth/v1/')) return route.fulfill({ json: user });
      const table = url.pathname.split('/rest/v1/')[1];
      if (request.method() !== 'GET' || !(table in rows)) throw new Error(`Unexpected receipt fixture request: ${request.method()} ${url.pathname}`);
      return route.fulfill({ json: request.headers().accept?.includes('object+json') ? rows[table][0] ?? null : rows[table] });
    });
    await page.addInitScript(({ origin, user }) => {
      localStorage.setItem(`sb-${new URL(origin).hostname.split('.')[0]}-auth-token`, JSON.stringify({ access_token: 'fixture-token', refresh_token: 'fixture-refresh', expires_at: Date.now() / 1000 + 3600, user }));
      localStorage.setItem('mtk-theme', 'light');
    }, { origin, user });
    await page.goto(`/${role}`);
    if (role === 'hiker') {
      await expect(page.getByRole('button', { name: 'Reschedule', exact: true })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Cancel Booking', exact: true })).toHaveCount(0);
      await page.getByRole('button', { name: 'Details / receipt' }).click();
    } else {
      await page.getByRole('combobox', { name: 'Show', exact: true }).click();
      await page.getByRole('option', { name: 'Completed', exact: true }).click();
      await page.getByRole('button', { name: 'View Details' }).click();
    }
    const receipt = page.getByRole('region', { name: 'Booking receipt' });
    await expect(receipt).toContainText('Original booking quote');
    await expect(receipt).toContainText('850');
    await expect(receipt).toContainText('Final charges');
    await expect(receipt).toContainText('2,210');
    await expect(receipt).toContainText('Horse help - Stations 5-3');
    await expect(receipt).toContainText('Water');
    await expect(receipt).toContainText('Porter');
    expect(await page.getByRole('dialog').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`${role}-receipt.png`) });
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    monitor.assertClean();
  });
}
