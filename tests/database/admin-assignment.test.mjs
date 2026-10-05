import { before, after, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
let db;
before(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE authenticated; CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT current_setting('test.actor')::uuid $$;
    CREATE FUNCTION has_role(u uuid, r text) RETURNS boolean LANGUAGE sql AS $$ SELECT (u = '${id(1)}' AND r = 'admin') OR (u = '${id(2)}' AND r = 'super_admin') $$;
    CREATE TABLE user_locations(user_id uuid, location_id uuid);
    INSERT INTO user_locations VALUES ('${id(1)}','${id(10)}');
    CREATE TABLE bookings(id uuid PRIMARY KEY, location_id uuid, status text, notes text, booking_date date);
    CREATE TABLE guides(id uuid PRIMARY KEY, user_id uuid, location_id uuid, is_active boolean, status text, full_name text);
    CREATE TABLE trail_zones(id uuid, location_id uuid, status text, is_official boolean, review_status text, name text);
    CREATE TABLE booking_assignments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), booking_id uuid, guide_id uuid, location_id uuid, status text, decided_at timestamptz, created_at timestamptz DEFAULT now());
    GRANT USAGE ON SCHEMA auth,public TO authenticated;
    GRANT SELECT,INSERT,UPDATE ON ALL TABLES IN SCHEMA public TO authenticated;`);
  await db.exec(await readFile('supabase/migrations/20261004120000_atomic_admin_guide_assignment.sql', 'utf8'));
}, { timeout: 30000 });
beforeEach(async () => {
  await db.exec(`RESET ROLE; TRUNCATE bookings,guides,booking_assignments,trail_zones;
    INSERT INTO bookings VALUES ('${id(20)}','${id(10)}','confirmed','{}','2026-10-10');
    INSERT INTO guides VALUES ('${id(30)}','${id(40)}','${id(10)}',true,'available','Guide One'), ('${id(31)}','${id(41)}','${id(11)}',true,'available','Other Station');
    SET ROLE authenticated; SET test.actor = '${id(1)}';`);
});
after(async () => { await db?.close(); });
const assign = (guide = id(30), route = null) => db.query('SELECT admin_assign_hike_guide($1,$2,$3) AS result', [id(20), guide, route]);

test('assignment persists one pending offer, preserves confirmed status, and is idempotent', async () => {
  await assign();
  assert.equal((await assign()).rows[0].result.unchanged, true);
  assert.equal((await db.query('SELECT * FROM booking_assignments')).rows.length, 1);
  const b = (await db.query('SELECT * FROM bookings')).rows[0];
  assert.equal(b.status, 'confirmed');
  assert.equal(JSON.parse(b.notes).assignedGuideId, id(30));
});
test('rejects guide from another trailhead without changing booking or assignments', async () => {
  await assert.rejects(assign(id(31)), /booking trailhead/);
  assert.equal((await db.query('SELECT * FROM booking_assignments')).rows.length, 0);
  assert.equal((await db.query('SELECT notes FROM bookings')).rows[0].notes, '{}');
});

test('changing the published route preserves an already accepted guide', async () => {
  await assign();
  await db.exec(`UPDATE booking_assignments SET status = 'accepted';
    INSERT INTO trail_zones VALUES ('${id(50)}','${id(10)}','active',true,'approved','Recorded summit');`);
  await assign(id(30), id(50));
  const booking = (await db.query('SELECT notes FROM bookings')).rows[0];
  assert.equal(JSON.parse(booking.notes).assignedTrailZoneId, id(50));
  assert.equal((await db.query('SELECT status FROM booking_assignments')).rows[0].status, 'accepted');
});
test('rejects non-admin and out-of-scope admin', async () => {
  await db.exec(`SET test.actor = '${id(99)}'`);
  await assert.rejects(assign(), /Only an administrator/);
  await db.exec(`SET test.actor = '${id(1)}'; UPDATE bookings SET location_id = '${id(11)}'`);
  await assert.rejects(assign(), /another trailhead/);
});
test('rejects unlinked guides, ended hikes and unpublished routes', async () => {
  await db.exec('UPDATE guides SET user_id = NULL');
  await assert.rejects(assign(), /active guide/);
  await db.exec(`UPDATE guides SET user_id = '${id(40)}'; UPDATE bookings SET status = 'completed'`);
  await assert.rejects(assign(), /closed/);
  await db.exec("UPDATE bookings SET status = 'pending'");
  await assert.rejects(assign(id(30), id(88)), /published route/);
});
test('rolls back the guide offer when saving the booking fails', async () => {
  await db.exec(`RESET ROLE; ALTER TABLE bookings ADD CONSTRAINT reject_assignment CHECK (notes = '{}'); SET ROLE authenticated;`);
  try {
    await assert.rejects(assign(), /reject_assignment/);
    assert.equal((await db.query('SELECT * FROM booking_assignments')).rows.length, 0);
  } finally { await db.exec('RESET ROLE; ALTER TABLE bookings DROP CONSTRAINT reject_assignment; SET ROLE authenticated;'); }
});
