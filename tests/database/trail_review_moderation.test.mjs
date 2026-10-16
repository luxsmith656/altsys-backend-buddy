import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
let db;

before(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE SCHEMA auth;
    CREATE TYPE public.app_role AS ENUM ('super_admin', 'admin', 'hiker');
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT current_setting('test.actor')::uuid $$;
    CREATE FUNCTION public.has_role(u uuid, r public.app_role) RETURNS boolean LANGUAGE sql AS $$
      SELECT (u = '${id(1)}' AND r = 'admin') OR (u = '${id(2)}' AND r = 'super_admin')
    $$;
    CREATE TABLE public.bookings(id uuid PRIMARY KEY, location_id uuid);
    CREATE TABLE public.user_locations(user_id uuid, location_id uuid);
    CREATE TABLE public.reviews(
      id uuid PRIMARY KEY,
      user_id uuid NOT NULL,
      reviewer_name text NOT NULL DEFAULT '',
      rating int NOT NULL DEFAULT 5,
      trail_name text NOT NULL DEFAULT '',
      review_text text NOT NULL DEFAULT '',
      is_approved boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE POLICY "Admins can manage reviews" ON public.reviews FOR ALL TO authenticated USING (true);
    CREATE POLICY rv_admin_all ON public.reviews FOR ALL TO authenticated USING (true);
    GRANT USAGE ON SCHEMA auth, public TO authenticated;
    GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO authenticated;
    INSERT INTO public.user_locations VALUES ('${id(1)}', '${id(10)}');
    INSERT INTO public.bookings VALUES ('${id(20)}', '${id(10)}'), ('${id(21)}', '${id(11)}');
    SET test.actor = '${id(1)}';
  `);
  await db.exec(await readFile('supabase/migrations/20261014143000_trail_review_local_moderation.sql', 'utf8'));
  await db.exec(await readFile('supabase/migrations/20261016120000_trail_review_central_moderation.sql', 'utf8'));
}, { timeout: 30000 });

after(async () => { await db?.close(); });

test('local review moderation is limited to the admin trailhead while central moderation spans all trailheads', async () => {
  await db.exec(`SET test.actor = '${id(1)}';`);
  assert.equal((await db.query('SELECT public.can_moderate_trail_review($1) AS allowed', [id(20)])).rows[0].allowed, true);
  assert.equal((await db.query('SELECT public.can_moderate_trail_review($1) AS allowed', [id(21)])).rows[0].allowed, false);

  await db.exec(`SET test.actor = '${id(2)}';`);
  assert.equal((await db.query('SELECT public.can_moderate_trail_review($1) AS allowed', [id(21)])).rows[0].allowed, true);
});

test('migration records the trail review fields and removes historical global-admin policies', async () => {
  const columns = await db.query("SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'reviews'");
  const names = columns.rows.map((row) => row.column_name);
  assert.ok(names.includes('review_type'));
  assert.ok(names.includes('difficulty'));
  assert.ok(names.includes('photo_url'));
  assert.ok(names.includes('booking_id'));

  const policies = await db.query("SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'reviews'");
  const namesByPolicy = policies.rows.map((row) => row.policyname);
  assert.equal(namesByPolicy.includes('Admins can manage reviews'), false);
  assert.equal(namesByPolicy.includes('rv_admin_all'), false);
  assert.ok(namesByPolicy.includes('trail_reviews_local_admin_update'));
  assert.ok(namesByPolicy.includes('trail_reviews_central_admin_select'));
  assert.ok(namesByPolicy.includes('trail_reviews_central_admin_update'));
});
