import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const migrationPath = process.env.GUIDE_REVIEW_MIGRATION || 'supabase/migrations/20260908120000_restore_guide_reviews.sql';
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const people = { hiker: id(1), other: id(2), guide: id(3), admin: id(4), otherAdmin: id(5), central: id(6) };
const locations = { lamot2: id(10), lamot1: id(11) };
const guides = { assigned: id(20), other: id(21) };
const bookings = { completed: id(30), pending: id(31), elsewhere: id(32) };
let db;
let migration;

before(async () => {
  db = new PGlite();
  // This is an in-memory PostgreSQL database, never the project's Supabase URL.
  await db.exec(`
    CREATE ROLE anon NOLOGIN;
    CREATE ROLE authenticated NOLOGIN;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    GRANT USAGE ON SCHEMA auth, public TO anon, authenticated;
    CREATE TYPE public.app_role AS ENUM ('hiker', 'guide', 'admin', 'super_admin');
    CREATE TABLE public.user_roles (user_id uuid, role public.app_role);
    CREATE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
      RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
      $$ SELECT EXISTS (SELECT 1 FROM user_roles WHERE user_id = _user_id AND role = _role) $$;
    CREATE TABLE public.locations (id uuid PRIMARY KEY);
    CREATE TABLE public.user_locations (user_id uuid, location_id uuid);
    CREATE TABLE public.guides (id uuid PRIMARY KEY, user_id uuid REFERENCES auth.users(id), location_id uuid);
    CREATE TABLE public.bookings (id uuid PRIMARY KEY, user_id uuid, location_id uuid, status text);
    CREATE TABLE public.booking_assignments (booking_id uuid, guide_id uuid, status text);
    ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
    CREATE POLICY bookings_owner_read ON public.bookings FOR SELECT TO authenticated USING (user_id = auth.uid());
    ALTER TABLE public.guides ENABLE ROW LEVEL SECURITY;
    CREATE POLICY guides_public_read ON public.guides FOR SELECT USING (true);
    CREATE POLICY guides_own_update ON public.guides FOR UPDATE TO authenticated
      USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
    GRANT SELECT, UPDATE ON public.bookings, public.guides TO authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO anon;
  `);
  for (const userId of Object.values(people)) await db.query('INSERT INTO auth.users VALUES ($1)', [userId]);
  await db.query('INSERT INTO public.locations VALUES ($1), ($2)', Object.values(locations));
  for (const [userId, role] of [[people.hiker, 'hiker'], [people.other, 'hiker'], [people.guide, 'guide'], [people.admin, 'admin'], [people.otherAdmin, 'admin'], [people.central, 'super_admin']]) {
    await db.query('INSERT INTO public.user_roles VALUES ($1, $2)', [userId, role]);
  }
  await db.query('INSERT INTO public.user_locations VALUES ($1, $2), ($3, $4)', [people.admin, locations.lamot2, people.otherAdmin, locations.lamot1]);
  await db.query('INSERT INTO public.guides VALUES ($1, $2, $3), ($4, $5, $6)', [guides.assigned, people.guide, locations.lamot2, guides.other, people.other, locations.lamot1]);
  for (const [bookingId, locationId, status] of [[bookings.completed, locations.lamot2, 'completed'], [bookings.pending, locations.lamot2, 'confirmed'], [bookings.elsewhere, locations.lamot1, 'completed']]) {
    await db.query('INSERT INTO public.bookings VALUES ($1, $2, $3, $4)', [bookingId, people.hiker, locationId, status]);
    await db.query('INSERT INTO public.booking_assignments VALUES ($1, $2, $3)', [bookingId, guides.assigned, status === 'completed' ? 'completed' : 'accepted']);
  }
  migration = await readFile(migrationPath, 'utf8');
  await db.exec(migration);
}, { timeout: 30000 });

beforeEach(async () => {
  await db.exec('RESET ROLE; DELETE FROM public.guide_reviews;');
});
after(async () => { await db?.close(); });

async function asUser(userId) {
  await db.exec('RESET ROLE');
  await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [userId]);
  await db.exec('SET ROLE authenticated');
}
async function insertReview({ bookingId = bookings.completed, guideId = guides.assigned, reviewerId = people.hiker, rating = 5, approved = true } = {}) {
  return db.query(`INSERT INTO public.guide_reviews (booking_id, guide_id, reviewer_id, reviewer_name, rating, comment, is_approved)
    VALUES ($1, $2, $3, 'Test hiker', $4, 'A careful guide.', $5) RETURNING id, comment`, [bookingId, guideId, reviewerId, rating, approved]);
}

test('completed booking owner can persist one review for their actual assigned guide', async () => {
  await asUser(people.hiker);
  const { rows } = await insertReview();
  assert.equal(rows[0].comment, 'A careful guide.');
  await assert.rejects(insertReview(), /duplicate key/i);
});
test('unfinished bookings cannot be reviewed', async () => {
  await asUser(people.hiker);
  await assert.rejects(insertReview({ bookingId: bookings.pending }), /row.level security/i);
});
test('booking owner cannot review an unrelated guide', async () => {
  await asUser(people.hiker);
  await assert.rejects(insertReview({ guideId: guides.other }), /row.level security/i);
});
test('unrelated accounts cannot review another hiker booking or forge its reviewer', async () => {
  await asUser(people.other);
  await assert.rejects(insertReview({ reviewerId: people.other }), /row.level security/i);
  await assert.rejects(insertReview(), /row.level security/i);
});
test('null booking and invalid rating are rejected', async () => {
  await asUser(people.hiker);
  await assert.rejects(insertReview({ bookingId: null }), /row.level security|not.null/i);
  await assert.rejects(insertReview({ rating: 6 }), /check constraint/i);
});
test('same-location admin can moderate a review; another location admin cannot', async () => {
  await asUser(people.hiker);
  const { rows: [review] } = await insertReview();
  await asUser(people.otherAdmin);
  const denied = await db.query('UPDATE public.guide_reviews SET is_approved = false WHERE id = $1 RETURNING id', [review.id]);
  assert.equal(denied.rows.length, 0);
  await asUser(people.admin);
  const allowed = await db.query('UPDATE public.guide_reviews SET is_approved = false WHERE id = $1 RETURNING id', [review.id]);
  assert.equal(allowed.rows.length, 1);
});
test('public profile exposes only approved reviews, not hidden reviews', async () => {
  await insertReview({ approved: false });
  await db.exec('SET ROLE anon');
  assert.equal((await db.query('SELECT id FROM public.guide_reviews')).rows.length, 0);
  await assert.rejects(insertReview(), /permission denied|row.level security/i);
});
test('guide can save own profile photo but cannot overwrite another guide', async () => {
  await asUser(people.guide);
  const own = await db.query("UPDATE public.guides SET photo_url = 'https://example.test/guide.webp' WHERE id = $1 RETURNING photo_url", [guides.assigned]);
  assert.equal(own.rows[0].photo_url, 'https://example.test/guide.webp');
  const other = await db.query("UPDATE public.guides SET photo_url = 'https://example.test/guide.webp' WHERE id = $1 RETURNING id", [guides.other]);
  assert.equal(other.rows.length, 0);
});
test('migration reruns without deleting existing reviews or changing them', async () => {
  const { rows: [review] } = await insertReview();
  await db.exec(migration);
  const persisted = await db.query('SELECT comment FROM public.guide_reviews WHERE id = $1', [review.id]);
  assert.equal(persisted.rows[0].comment, 'A careful guide.');
});
test('existing legacy review policies are replaced without losing their reviews', async () => {
  await db.exec(await readFile('supabase/migrations/20260809090000_guide_profile_and_reviews.sql', 'utf8'));
  const { rows: [review] } = await insertReview();
  await db.exec(migration);
  await asUser(people.otherAdmin);
  const denied = await db.query('DELETE FROM public.guide_reviews WHERE id = $1 RETURNING id', [review.id]);
  assert.equal(denied.rows.length, 0);
  await asUser(people.hiker);
  assert.equal((await db.query('SELECT id FROM public.guide_reviews WHERE id = $1', [review.id])).rows.length, 1);
});
test('moderation cannot rewrite an author or their review text', async () => {
  const { rows: [review] } = await insertReview();
  await asUser(people.admin);
  await assert.rejects(db.query("UPDATE public.guide_reviews SET comment = 'Rewritten by staff' WHERE id = $1", [review.id]), /permission denied/i);
  await assert.rejects(db.query('UPDATE public.guide_reviews SET reviewer_id = $1 WHERE id = $2', [people.admin, review.id]), /permission denied/i);
});
test('central admin can moderate across entry points', async () => {
  const { rows: [review] } = await insertReview({ bookingId: bookings.elsewhere });
  await asUser(people.central);
  const removed = await db.query('DELETE FROM public.guide_reviews WHERE id = $1 RETURNING id', [review.id]);
  assert.equal(removed.rows.length, 1);
});
