import { expect, test, type Page } from '@playwright/test';
import { loadEnv } from 'vite';
import { attachRuntimeMonitor } from '../support/runtime-monitor';

const env = loadEnv('development', process.cwd(), 'VITE_');
const base = env.VITE_SUPABASE_URL;

async function rows(page: Page, path: string) {
  const key = `sb-${new URL(base).hostname.split('.')[0]}-auth-token`;
  const token = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) || '{}').access_token, key);
  const result = await page.request.get(`${base}/rest/v1/${path}`, { headers: {
    apikey: env.VITE_SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${token}`,
  } });
  expect(result.ok(), `${path}: ${result.status()}`).toBe(true);
  return result.json();
}

async function dismissGuidance(page: Page) {
  const close = page.getByRole('button', { name: 'Dismiss Kali reminder', exact: true });
  if (await close.isVisible()) await close.click();
}

async function login(page: Page, account: string, route: RegExp) {
  await page.goto('/login');
  await page.getByRole('button', { name: account, exact: true }).click();
  await expect(page).toHaveURL(route, { timeout: 20_000 });
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  if (account.includes('Admin')) await expect(page.getByRole('button', { name: 'Refresh overview' })).toBeEnabled();
}

test('live test booking passes dispatch, guide acceptance, check-in and settlement', async ({ browser }, testInfo) => {
  if (process.env.ALLOW_LIVE_TEST_WRITES !== 'yes') throw new Error('Live database writes require ALLOW_LIVE_TEST_WRITES=yes and explicit owner consent.');
  const hikerContext = await browser.newContext();
  const adminContext = await browser.newContext();
  const guideContext = await browser.newContext();
  const hiker = await hikerContext.newPage();
  const admin = await adminContext.newPage();
  const guide = await guideContext.newPage();
  for (const page of [hiker, admin, guide]) page.setDefaultTimeout(20_000);
  const monitors = [hiker, admin, guide].map((page) => attachRuntimeMonitor(page));
  let bookingId = process.env.LIVE_BOOKING_ID || '';
  let name = `TEST KALI FLOW ${Date.now()}`;
  try {
    await login(hiker, 'Hiker', /\/hiker$/);
    await monitors[0].waitForRequests();
    await hiker.getByRole('button', { name: 'Open quick actions' }).click();
    await hiker.getByRole('button', { name: 'Ask Kali AI', exact: true }).click();
    const chat = hiker.getByRole('dialog', { name: 'Chat with Kali' });
    const liveAnswer = hiker.waitForResponse((response) => response.url().includes('/functions/v1/trail-chat-rag') && response.request().method() === 'POST');
    await chat.getByRole('textbox', { name: 'Ask Kali' }).fill('How many hikers can one guide take? Reply briefly with the group-size limit.');
    await chat.getByRole('button', { name: 'Send message' }).click();
    const aiResponse = await liveAnswer;
    expect(aiResponse.ok()).toBe(true);
    expect(aiResponse.headers()['content-type']).toContain('text/event-stream');
    expect(aiResponse.request().postDataJSON().booking_context.viewer_role).toBe('hiker');
    await expect(chat.locator('.justify-start .whitespace-pre-wrap').last()).toContainText(/\b5\b|five/i, { timeout: 30_000 });
    await expect(chat.locator('[data-activity="thinking"]')).toHaveCount(0);
    await chat.getByRole('button', { name: 'Close chat' }).click();
    await monitors[0].waitForRequests();
    if (!bookingId) {
      const day = new Date(Date.now() + 2 * 86400000).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
      await hiker.goto(`/booking?date=${day}&time=04:00%20AM&pax=1&type=morning`);
      await expect(hiker.getByRole('heading', { name: 'Book Your Hike' })).toBeVisible();
      await dismissGuidance(hiker);
      await hiker.getByRole('button', { name: 'Continue', exact: true }).filter({ visible: true }).click();
      await hiker.getByLabel('Full Name', { exact: true }).fill(name);
      await hiker.getByLabel('Age', { exact: true }).fill('25');
      await hiker.getByRole('button', { name: 'Male', exact: true }).click();
      await hiker.getByLabel('Phone Number', { exact: true }).fill('09000000000');
      await hiker.getByLabel('Special Medical Notes (Optional)', { exact: true }).fill('AUTOMATED TEST ONLY. No real hike, emergency, or money collected. Owner approved this test; safe to delete after review.');
      await hiker.locator('#startLocation').click();
      await hiker.getByRole('option', { name: /Lamot 2/ }).click();
      await dismissGuidance(hiker);
      await hiker.getByRole('button', { name: 'Continue', exact: true }).filter({ visible: true }).click();
      await hiker.locator('#truthful-floating').check();
      await hiker.getByRole('button', { name: 'Continue to Agreement', exact: true }).click();
      await hiker.getByText('Trail Rules and Regulations', { exact: true }).locator('..').evaluate((el) => { el.scrollTop = el.scrollHeight; });
      await hiker.locator('#rules').check();
      await hiker.getByText('Data Privacy Policy', { exact: true }).first().locator('..').evaluate((el) => { el.scrollTop = el.scrollHeight; });
      await hiker.locator('#privacy').check();
      await hiker.getByRole('button', { name: 'Continue', exact: true }).filter({ visible: true }).click();
      await dismissGuidance(hiker);
      const saved = hiker.waitForResponse((r) => r.url().includes('/rest/v1/bookings') && r.request().method() === 'POST');
      await hiker.getByRole('button', { name: 'Confirm Reservation', exact: true }).click();
      const response = await saved;
      expect(response.ok(), await response.text()).toBe(true);
      const record = await response.json();
      bookingId = record.id;
      console.log(`LIVE_TEST_BOOKING_ID=${bookingId}`);
    }
    const booking = (await rows(hiker, `bookings?select=*&id=eq.${bookingId}`))[0];
    expect(booking).toBeTruthy();
    name = JSON.parse(booking.notes).fullName;
    expect(name).toMatch(/^TEST KALI FLOW /);
    await testInfo.attach('test-booking', { body: JSON.stringify({ bookingId, name, locationId: booking.location_id }), contentType: 'application/json' });

    await login(admin, 'Lamot 2 Admin', /\/admin(?:\?.*)?$/);
    await monitors[1].waitForRequests();
    await admin.getByRole('tab', { name: /^Operations/ }).click();
    await expect(admin).toHaveURL(/\/admin\?tab=requests$/);
    await admin.getByPlaceholder('Search by name, booking ID, or date…').fill(bookingId);
    await expect(admin.getByText(name, { exact: true }).first()).toBeVisible();
    let meta = JSON.parse(booking.notes);
    if (booking.status === 'pending' && !meta.assignedGuideId) {
      await admin.getByRole('button', { name: 'Accept & Assign Guide', exact: true }).click();
      await admin.getByRole('combobox').filter({ hasText: 'Select a guide' }).click();
      await admin.getByRole('option', { name: /^Test Guide/ }).click();
      const routeChoice = admin.getByRole('combobox').filter({ hasText: 'Select route for this hiker' });
      if (await routeChoice.isVisible()) {
        await routeChoice.click();
        await admin.getByRole('option', { name: /^Summit Trail recorded/ }).click();
      } else {
        await expect(admin.getByText(/Auto-assigned: Summit Trail recorded/)).toBeVisible();
      }
      await admin.getByRole('button', { name: 'Confirm & Notify Guide' }).click();
      await expect.poll(async () => (await rows(admin, `booking_assignments?select=status&booking_id=eq.${bookingId}`)).length).toBe(1);
    }
    await login(guide, 'Guide', /\/guide$/);
    await monitors[2].waitForRequests();
    const assignment = guide.locator('.guide-assignment').filter({ hasText: name });
    await expect(assignment).toBeVisible();
    if (await assignment.getByRole('button', { name: 'Accept Hike', exact: true }).isVisible()) {
      await assignment.getByRole('button', { name: 'Accept Hike', exact: true }).click();
    }
    await expect.poll(async () => (await rows(hiker, `bookings?select=status&id=eq.${bookingId}`))[0]?.status).toBe('confirmed');
    await monitors[1].waitForRequests();
    await admin.getByRole('tab', { name: 'QR Check-in', exact: true }).click();
    await expect(admin).toHaveURL(/\/admin\?tab=scan$/);
    await admin.getByPlaceholder('QR code data, Booking ID, or hiker name…').fill(bookingId);
    await admin.getByRole('button', { name: 'Lookup', exact: true }).click();
    await expect(admin.getByText(name, { exact: true }).first()).toBeVisible();
    meta = JSON.parse((await rows(admin, `bookings?select=notes&id=eq.${bookingId}`))[0].notes);
    if (!meta.onsiteStartConfirmed) {
      await admin.getByRole('checkbox', { name: /I verified every person/ }).check();
      await admin.getByRole('button', { name: /Confirm Onsite Start/ }).click();
    }
    await expect.poll(async () => (await rows(admin, `hiker_sessions?select=participant_role,status&booking_id=eq.${bookingId}&status=eq.active`)).length).toBe(2);
    const sessions = await rows(admin, `hiker_sessions?select=participant_role,trail_zone_id&booking_id=eq.${bookingId}&status=eq.active`);
    expect(sessions.map((s: { participant_role: string }) => s.participant_role).sort()).toEqual(['guide', 'hiker']);
    expect(new Set(sessions.map((s: { trail_zone_id: string }) => s.trail_zone_id)).size).toBe(1);
    await expect(admin.getByRole('button', { name: /Confirm Onsite Start/ })).toHaveCount(0, { timeout: 20_000 });
    await monitors[1].waitForRequests();
    await admin.getByRole('tab', { name: 'Bookings', exact: true }).click();
    await expect(admin).toHaveURL(/\/admin\?tab=requests$/);
    await admin.getByPlaceholder('Search by name, booking ID, or date…').fill(bookingId);
    await admin.getByRole('button', { name: 'End Hike & Settle', exact: true }).click();
    const settlement = admin.getByRole('dialog', { name: 'End Hike & Settle Payment' });
    await settlement.getByRole('checkbox', { name: /All 1 hikers safely returned/ }).check();
    await settlement.getByRole('button', { name: '₱1000', exact: true }).click();
    await expect(settlement.getByText('₱150', { exact: true }).first()).toBeVisible();
    await settlement.getByRole('button', { name: /Collect.*Complete Hike/ }).click();
    await expect(settlement).toHaveCount(0, { timeout: 20_000 });
    await expect.poll(async () => (await rows(hiker, `bookings?select=status&id=eq.${bookingId}`))[0]?.status).toBe('completed');
    const finished = JSON.parse((await rows(hiker, `bookings?select=notes&id=eq.${bookingId}`))[0].notes);
    expect(finished.amountPaid).toBe(850);
    expect(finished.changeReturned).toBe(150);
    expect(finished.guideReviewRequestedAt).toBeTruthy();
    expect((await rows(admin, `hiker_sessions?select=id&booking_id=eq.${bookingId}&status=eq.active`)).length).toBe(0);
    for (const monitor of monitors) { await monitor.waitForRequests(); monitor.assertClean(); }
  } finally {
    console.log(`Live test record retained for owner review: ${bookingId || 'none created'}`);
    // Playwright owns browser cleanup; closing here can mask a timeout's original error.
  }
});
