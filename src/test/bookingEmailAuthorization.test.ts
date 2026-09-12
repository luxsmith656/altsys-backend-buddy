// @vitest-environment node
import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { canSendBookingEmail, createBookingEmailStore } from '../../supabase/functions/send-booking-confirmation/handler';

function client(role: string, location = 'lamot2', accepted = true) {
  return createClient('https://example.supabase.co', 'test-service-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init) => {
      const url = new URL(String(input));
      const table = url.pathname.split('/').pop()!;
      const rows: Record<string, Record<string, unknown>[]> = {
        bookings: [{ id: 'booking', user_id: 'owner', location_id: 'lamot2', status: 'confirmed', booking_date: '2026-09-10', group_size: 4, notes: JSON.stringify({ fullName: 'Lead', emailAddress: 'hiker@example.com', hikeType: 'morning', hikeTime: '06:00 AM', guideStatus: 'accepted', assignedGuideId: 'assigned' }) }],
        user_roles: [{ user_id: 'caller', role }],
        user_locations: [{ user_id: 'caller', location_id: location }],
        guides: [{ id: 'assigned', user_id: 'caller', full_name: 'Guide', phone: '+639171234567' }],
        locations: [{ id: 'lamot2', name: 'Lamot 2' }],
        booking_assignments: [{ id: 'assignment', booking_id: 'booking', guide_id: 'assigned', status: accepted ? 'accepted' : 'declined' }],
      };
      if (!(table in rows)) throw new Error(`Unexpected table: ${table}`);
      let data = rows[table];
      for (const [key, value] of url.searchParams) if (value.startsWith('eq.')) data = data.filter(row => row[key] === value.slice(3));
      // Supabase maybeSingle accepts JSON arrays and normalizes zero/one rows.
      const single = new Headers(init?.headers).get('accept')?.includes('object+json');
      return new Response(JSON.stringify(single ? data[0] ?? null : data), { headers: { 'Content-Type': 'application/json' } });
    } },
  });
}
describe('booking email authorization with real Supabase query construction', () => {
  it.each([
    ['hiker', 'owner', 'lamot2', true, true],
    ['hiker', 'caller', 'lamot2', true, false],
    ['admin', 'caller', 'lamot2', true, true],
    ['admin', 'caller', 'lamot1', true, false],
    ['super_admin', 'caller', 'lamot1', true, true],
    ['guide', 'caller', 'lamot2', true, true],
    ['guide', 'caller', 'lamot2', false, false],
    ['mdrrmo', 'caller', 'lamot2', true, false],
  ])('%s account at %s is properly scoped', async (role, user, location, accepted, expected) => {
    expect(await canSendBookingEmail(client(String(role), String(location), Boolean(accepted)), String(user), 'booking')).toBe(expected);
  });
  it('does not authorize nonexistent bookings', async () => {
    expect(await canSendBookingEmail(client('super_admin'), 'caller', 'missing')).toBe(false);
  });
  it('loads the actual confirmed booking and accepted assigned guide', async () => {
    const details = await createBookingEmailStore(client('guide')).loadDetails('booking');
    expect(details.guide).toMatchObject({ full_name: 'Guide', phone: '+639171234567' });
    expect(details.location).toMatchObject({ name: 'Lamot 2' });
  });
  it('rejects a metadata-only assignment when the real assignment is declined', async () => {
    await expect(createBookingEmailStore(client('guide', 'lamot2', false)).loadDetails('booking')).rejects.toThrow();
  });
});
