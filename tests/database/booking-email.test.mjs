import { before, after, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

let db;
const booking = '00000000-0000-4000-8000-000000000001';
before(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE TABLE public.bookings (id uuid PRIMARY KEY, status text);
    INSERT INTO public.bookings VALUES ('${booking}', 'confirmed');`);
  await db.exec(await readFile('supabase/migrations/20260908140000_booking_confirmation_outbox.sql', 'utf8'));
}, { timeout: 30000 });
beforeEach(async () => {
  await db.exec(`RESET ROLE; TRUNCATE public.booking_confirmation_emails; UPDATE public.bookings SET status = 'pending';`);
});
after(async () => { await db?.close(); });

test('only a newly confirmed booking is enqueued; repeated updates cannot duplicate it', async () => {
  assert.equal((await db.query('SELECT * FROM booking_confirmation_emails')).rows.length, 0);
  await db.exec("UPDATE bookings SET status = 'confirmed'; UPDATE bookings SET status = 'confirmed';");
  const { rows } = await db.query('SELECT booking_id, status, attempts FROM booking_confirmation_emails');
  assert.deepEqual(rows, [{ booking_id: booking, status: 'pending', attempts: 0 }]);
});
test('email claims have a lease, so concurrent callers cannot send the same booking', async () => {
  await db.exec("UPDATE bookings SET status = 'confirmed'");
  const first = await db.query('SELECT * FROM claim_booking_confirmation_email($1)', [booking]);
  assert.equal(first.rows.length, 1);
  assert.equal(first.rows[0].attempts, 1);
  assert.equal((await db.query('SELECT * FROM claim_booking_confirmation_email($1)', [booking])).rows.length, 0);
});
test('sent confirmations stay sent across reloads and repeated confirmations', async () => {
  await db.exec("UPDATE bookings SET status = 'confirmed'; UPDATE booking_confirmation_emails SET status = 'sent', provider_id = 'provider-1'; UPDATE bookings SET status = 'pending'; UPDATE bookings SET status = 'confirmed';");
  assert.equal((await db.query('SELECT * FROM claim_booking_confirmation_email($1)', [booking])).rows.length, 0);
  assert.equal((await db.query('SELECT provider_id FROM booking_confirmation_emails')).rows[0].provider_id, 'provider-1');
});
test('cancelled and completed bookings cannot be dispatched from the queue', async () => {
  for (const status of ['cancelled', 'completed']) {
    await db.exec(`UPDATE bookings SET status = 'confirmed'; UPDATE bookings SET status = '${status}';`);
    assert.equal((await db.query('SELECT * FROM claim_booking_confirmation_email($1)', [booking])).rows.length, 0);
  }
});
test('uncertain attempts older than the provider idempotency window require manual review', async () => {
  await db.exec("UPDATE bookings SET status = 'confirmed'; UPDATE booking_confirmation_emails SET status = 'processing', first_attempt_at = now() - interval '24 hours', lease_until = now() - interval '1 minute';");
  assert.equal((await db.query('SELECT * FROM claim_booking_confirmation_email($1)', [booking])).rows.length, 0);
  assert.equal((await db.query('SELECT status FROM booking_confirmation_emails')).rows[0].status, 'needs_review');
});
test('anonymous and authenticated clients cannot read payloads, forge sent status, or claim mail', async () => {
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`SET ROLE ${role}`);
    await assert.rejects(db.query('SELECT * FROM booking_confirmation_emails'), /permission denied/);
    await assert.rejects(db.query("UPDATE booking_confirmation_emails SET status = 'sent'"), /permission denied/);
    await assert.rejects(db.query('SELECT * FROM claim_booking_confirmation_email($1)', [booking]), /permission denied/);
    await db.exec('RESET ROLE');
  }
});
test('service role can claim and persist the provider result', async () => {
  await db.exec("UPDATE bookings SET status = 'confirmed'; SET ROLE service_role;");
  assert.equal((await db.query('SELECT * FROM claim_booking_confirmation_email($1)', [booking])).rows.length, 1);
  await db.exec("UPDATE booking_confirmation_emails SET status = 'sent', provider_id = 'provider-2'");
  assert.equal((await db.query('SELECT provider_id FROM booking_confirmation_emails')).rows[0].provider_id, 'provider-2');
});
