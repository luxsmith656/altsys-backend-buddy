import type { Page } from '@playwright/test';
import { loadEnv } from 'vite';
import { attachRuntimeMonitor } from './runtime-monitor';

export function monitorGuideFixture(page: Page) {
  return attachRuntimeMonitor(page, {
    // This fixture deliberately disconnects only Firestore. Supabase, app assets,
    // AI requests, and unrelated console errors must still fail these UI tests.
    allowConsoleMessage: (message) => (
      message.location().url.startsWith('https://firestore.googleapis.com/')
      && message.text() === 'Failed to load resource: net::ERR_INTERNET_DISCONNECTED'
    ) || /^\[[^\]]+\]\s+@firebase\/firestore: Firestore \([\d.]+\): Could not reach Cloud Firestore backend\./.test(message.text()),
  });
}

// Synthetic records for layout and interaction tests. No live account or writes.
export function createGuideFixture() {
  const user = { id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated', email: 'guide@example.test', user_metadata: { full_name: 'Alex Rivera' }, app_metadata: { provider: 'email' }, created_at: '2026-01-01T00:00:00Z' };
  const guide = { id: 'guide-preview', user_id: user.id, full_name: 'Alex Rivera', specialty: 'Lamot 2 trailhead', location_id: 'lamot2', status: 'available', is_active: true, per_trip_fee: 800, photo_url: null };
  const statuses = ['pending', 'accepted', 'completed'] as const;
  const assignments = statuses.map((status, i) => ({ id: `assignment-${i}`, booking_id: `booking-${i}`, guide_id: guide.id, location_id: 'lamot2', status, created_at: '2026-09-05T00:00:00Z', decided_at: null }));
  const bookings = statuses.map((status, i) => ({ id: `booking-${i}`, user_id: `hiker-${i}`, booking_date: '2026-09-08', group_size: i + 3, status: status === 'accepted' ? 'confirmed' : status, notes: JSON.stringify({ fullName: ['Sam Mendoza', 'Jamie Santos', 'Robin Cruz'][i], phoneNumber: '09000000000', hikeTime: '04:00', assignedTrailName: 'Lamot 2 summit trail', hikeType: 'morning', medicalNotes: i === 0 ? 'Asthma - carries an inhaler' : null }) }));
  const rows: Record<string, unknown[]> = {
    guides: [guide], user_roles: [{ role: 'guide' }], bookings,
    booking_assignments: assignments, hiker_sessions: [], user_locations: [{ location_id: 'lamot2' }],
    locations: [{ id: 'lamot2', name: 'Lamot 2', slug: 'lamot2', status: 'active', center_lat: 14.15, center_lng: 121.34 }, { id: 'lamot1', name: 'Lamot 1', slug: 'lamot1', status: 'active', center_lat: 14.15, center_lng: 121.33 }],
    daily_capacity: [],
    guide_reviews: [{ id: 'review-1', reviewer_name: 'Robin Cruz', rating: 5, comment: 'Kept a comfortable pace and checked on everyone at each station.', created_at: '2026-09-01T00:00:00Z' }],
    guide_off_duty_requests: [], profiles: [],
  };
  return { user, rows };
}

export async function installGuideFixture(page: Page, options: { legacyProfileSchema?: boolean } = {}) {
  // No production Firestore reads from a synthetic identity.
  await page.route('https://firestore.googleapis.com/**', (route) => route.abort('internetdisconnected'));
  const env = loadEnv('test', process.cwd(), 'VITE_');
  const origin = env.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL!;
  const { user, rows } = createGuideFixture();
  if (options.legacyProfileSchema) {
    rows.guides = rows.guides.map((guide) => {
      const { photo_url: _photo, ...legacyGuide } = guide as Record<string, unknown>;
      return legacyGuide;
    });
  }
  await page.route(`${origin}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname.startsWith('/auth/v1/')) return route.fulfill({ json: user });
    const table = url.pathname.split('/rest/v1/')[1];
    if (request.method() !== 'GET' || !Object.hasOwn(rows, table)) {
      throw new Error(`Unexpected fixture request: ${request.method()} ${url.pathname}`);
    }
    const single = request.headers().accept?.includes('object+json');
    await route.fulfill({ json: single ? rows[table][0] ?? null : rows[table] });
  });
  await page.routeWebSocket(/supabase\.co\/realtime\//, () => {});
  await page.addInitScript(({ origin, user }) => {
    localStorage.setItem(`sb-${new URL(origin).hostname.split('.')[0]}-auth-token`, JSON.stringify({ access_token: 'preview-token', refresh_token: 'preview-refresh', expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: 'bearer', user }));
    localStorage.setItem('mtk-theme', 'light');
  }, { origin, user });
}
