import { expect, test } from '@playwright/test';
import { loadEnv } from 'vite';
import { createGuideFixture, monitorGuideFixture } from '../support/guide-fixture';

for (const role of ['admin', 'guide'] as const) {
  for (const viewport of [{ width: 360, height: 740 }, { width: 844, height: 390 }, { width: 1440, height: 900 }]) {
    test(`${role} map has reachable controls and a separate details panel at ${viewport.width}`, async ({ page }, testInfo) => {
      await page.setViewportSize(viewport);
      const monitor = monitorGuideFixture(page);
      const origin = loadEnv('test', process.cwd(), 'VITE_').VITE_SUPABASE_URL;
      const { user, rows } = createGuideFixture();
      rows.user_roles = [{ user_id: user.id, role }];
      rows.user_locations = [{ user_id: user.id, location_id: 'lamot2' }];
      rows.checkpoints = []; rows.checkpoint_surveys = []; rows.trail_recordings = [];
      rows.profiles = [{ user_id: 'lead', full_name: 'Sam Lead' }, { user_id: 'guide', full_name: 'Actual Guide' }];
      rows.trail_zones = [{ id: 'official', location_id: 'lamot2', name: 'Lamot 2 published trail', status: 'active', is_official: true, review_status: 'approved', coordinates_json: [{ lat: 14.15, lng: 121.34 }, { lat: 14.16, lng: 121.35 }] }];
      rows.hiker_sessions = role === 'guide' ? [] : [{ id: 'live-1', user_id: 'lead', booking_id: 'booking', location_id: 'lamot2', trail_zone_id: 'official', status: 'active', participant_role: 'hiker', tracking_phase: 'ascent', start_time: new Date().toISOString(), client_session_id: 'admin-checkin:test' }];
      rows.bookings = [{ id: 'booking', location_id: 'lamot2', group_size: 3, notes: JSON.stringify({ fullName: 'Sam Lead', assignedGuide: 'Actual Guide', companions: ['Jo Companion'] }) }];
      rows.hiker_locations = [{ session_id: 'live-1', latitude: 14.151, longitude: 121.341, timestamp: new Date().toISOString() }];
      await page.route('https://firestore.googleapis.com/**', route => route.abort('internetdisconnected'));
      await page.routeWebSocket(/supabase\.co\/realtime\//, () => {});
      await page.route(`${origin}/**`, async route => {
        const request = route.request(); const url = new URL(request.url());
        if (url.pathname.startsWith('/auth/v1/')) return route.fulfill({ json: user });
        const table = url.pathname.split('/rest/v1/')[1];
        if (request.method() !== 'GET' || !(table in rows)) throw new Error(`Unexpected map fixture request: ${request.method()} ${url.pathname}`);
        let result = rows[table] as Record<string, unknown>[];
        for (const [key, filter] of url.searchParams) {
          if (filter.startsWith('eq.')) result = result.filter(row => String(row[key]) === filter.slice(3));
          if (filter.startsWith('in.(')) result = result.filter(row => filter.slice(4, -1).split(',').includes(String(row[key])));
        }
        return route.fulfill({ json: request.headers().accept?.includes('object+json') ? result[0] ?? null : result });
      });
      await page.addInitScript(({ origin, user }) => {
        localStorage.setItem(`sb-${new URL(origin).hostname.split('.')[0]}-auth-token`, JSON.stringify({ access_token: 'fixture-token', refresh_token: 'fixture-refresh', expires_at: Date.now() / 1000 + 3600, user }));
        localStorage.setItem('mtk-theme', 'light');
      }, { origin, user });
      await page.goto('/map');
      await expect(page.getByRole('navigation', { name: 'Map dock' })).toBeVisible();
      await expect(page.locator('.live-map-page > header')).toHaveCount(0);
      const toggle = page.getByRole('button', { name: role === 'admin' ? /(?:Expand|Collapse) group panel/ : /(?:Expand|Collapse) my hike/ });
      await expect(toggle).toBeVisible();
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      const mapBox = (await page.locator('.live-map-canvas').boundingBox())!;
      expect(mapBox.height).toBeGreaterThan(viewport.height * .8);
      expect(mapBox.width).toBeGreaterThan(viewport.width * .95);
      if (await toggle.getAttribute('aria-expanded') === 'false') await toggle.click();
      if (viewport.width < 768 && viewport.height > 500) {
        expect((await page.locator('.live-map-panel').boundingBox())!.height).toBeLessThan(viewport.height * .35);
      }
      if (role === 'admin') {
        await page.getByRole('button', { name: /Sam Lead.*3 pax/ }).click();
        await expect(page.getByRole('region', { name: 'Selected group details' })).toContainText('Jo Companion');
      } else {
        await expect(page.getByText('Check in at your jump-off to start your hike.')).toBeVisible();
        await expect(page.getByText('Sam Lead')).toHaveCount(0);
        await expect(page.getByRole('button', { name: /simulation/i })).toHaveCount(0);
      }
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await expect(page.locator('.live-map-panel')).toBeHidden();
      await page.getByRole('button', { name: 'Routes', exact: true }).click();
      await expect(page.locator('.live-map-panel')).toContainText('Lamot 2 published trail');
      await page.getByRole('button', { name: 'Show Lamot 2 published trail on map' }).click();
      await page.getByRole('button', { name: 'Close map panel' }).click();
      for (const name of ['Zoom in', 'Zoom out']) {
        const control = page.getByRole('button', { name, exact: true });
        await expect(control).toBeInViewport();
        const box = await control.boundingBox();
        expect(box!.width).toBeGreaterThanOrEqual(44); expect(box!.height).toBeGreaterThanOrEqual(44);
        await control.click();
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
      await page.screenshot({ path: testInfo.outputPath(`${role}-map-${viewport.width}.png`) });
      if (role === 'admin') {
        await page.getByRole('button', { name: 'Routes', exact: true }).click();
        await page.getByRole('button', { name: 'Open route editor' }).click();
        await expect(page.getByRole('heading', { name: 'Route Editor', exact: true })).toBeVisible();
        const editor = page.locator('[data-testid="route-editor-panel"]');
        const editorBox = (await editor.boundingBox())!;
        const dockBox = (await page.getByRole('navigation', { name: 'Map dock' }).boundingBox())!;
        expect(editorBox.y + editorBox.height).toBeLessThanOrEqual(dockBox.y);
        await page.screenshot({ path: testInfo.outputPath(`admin-editor-${viewport.width}.png`) });
        await page.getByRole('button', { name: 'Routes', exact: true }).click();
        await page.getByRole('button', { name: 'Back to live map' }).click();
        await expect(page.getByRole('button', { name: 'Expand group panel' })).toBeVisible();
      }
      if (role === 'admin' && viewport.width === 360) {
        await page.getByRole('button', { name: 'Tools', exact: true }).click();
        await page.getByRole('button', { name: 'Enable simulation mode' }).click();
        const panel = page.getByRole('button', { name: /(?:Expand|Collapse) simulation groups/ });
        if (await panel.getAttribute('aria-expanded') === 'false') await panel.click();
        await page.getByRole('button', { name: 'Simulation controls', exact: true }).click();
        await page.getByRole('button', { name: 'Pause', exact: true }).click();
        await expect(page.getByRole('button', { name: 'Resume', exact: true })).toBeVisible();
        await page.getByRole('button', { name: 'Resume', exact: true }).click();
        await page.getByRole('button', { name: '10x', exact: true }).click();
        await expect(page.getByRole('button', { name: '10x', exact: true })).toHaveAttribute('aria-pressed', 'true');
        await page.screenshot({ path: testInfo.outputPath('admin-simulation-mobile.png') });
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
        const overflow = await page.locator('.live-map-panel-body:visible').evaluate(el => el.scrollWidth > el.clientWidth);
        expect(overflow).toBe(false);
        await page.getByRole('button', { name: 'Hide simulation controls' }).click();
        await panel.click();
        await expect(panel).toHaveAttribute('aria-expanded', 'false');
        for (let cycle = 0; cycle < 3; cycle++) {
          await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
          await page.getByRole('button', { name: 'Tools', exact: true }).click();
          await page.getByRole('button', { name: 'Disable simulation mode' }).click();
          await expect(page.getByRole('button', { name: /(?:Expand|Collapse) group panel/ })).toBeVisible();
          await page.getByRole('button', { name: 'Zoom out', exact: true }).click();
          await page.getByRole('button', { name: 'Tools', exact: true }).click();
          await page.getByRole('button', { name: 'Enable simulation mode' }).click();
          await expect(page.getByRole('button', { name: /(?:Expand|Collapse) simulation groups/ })).toBeVisible();
        }
      }
      monitor.assertClean();
    });
  }
}
