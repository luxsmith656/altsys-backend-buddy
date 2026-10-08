import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const bookingId = '00000000-0000-4000-8000-000000000001';
const guideId = '00000000-0000-4000-8000-000000000002';
const guideUserId = '00000000-0000-4000-8000-000000000003';
let db;

before(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE authenticated;
    CREATE TYPE public.app_role AS ENUM ('admin', 'super_admin', 'ranger', 'hiker', 'guide', 'mdrrmo');
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    CREATE FUNCTION public.has_role(uuid, public.app_role) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
    CREATE FUNCTION public.admin_can_access_location(uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
    CREATE TABLE public.bookings(
      id uuid PRIMARY KEY, status text NOT NULL, notes text, location_id uuid
    );
    CREATE TABLE public.hiker_sessions(
      id uuid PRIMARY KEY, booking_id uuid, status text NOT NULL, tracking_phase text,
      end_time timestamptz
    );
    CREATE TABLE public.guides(
      id uuid PRIMARY KEY, user_id uuid NOT NULL, status text NOT NULL, updated_at timestamptz
    );
    CREATE TABLE public.booking_assignments(
      id uuid PRIMARY KEY, booking_id uuid NOT NULL, guide_id uuid NOT NULL,
      status text NOT NULL, decided_at timestamptz
    );
    INSERT INTO public.bookings VALUES ('${bookingId}', 'confirmed', '{}', NULL);
    INSERT INTO public.hiker_sessions VALUES ('00000000-0000-4000-8000-000000000004', '${bookingId}', 'active', 'ascent', NULL);
    INSERT INTO public.guides VALUES ('${guideId}', '${guideUserId}', 'on_duty', NULL);
    INSERT INTO public.booking_assignments VALUES ('00000000-0000-4000-8000-000000000005', '${bookingId}', '${guideId}', 'accepted', NULL);
    SELECT set_config('request.jwt.claim.sub', '${guideUserId}', false);
  `);
  await db.exec(await readFile('supabase/migrations/20261008170000_atomic_hike_completion.sql', 'utf8'));
});

after(async () => { await db?.close(); });

test('guide completion atomically closes session, booking and assignment', async () => {
  const result = await db.query('SELECT public.complete_hike_session($1, $2) AS result', [bookingId, '{"groupPhase":"completed"}']);
  assert.equal(result.rows[0].result.status, 'completed');
  assert.equal(result.rows[0].result.already_completed, false);
  assert.deepEqual((await db.query('SELECT status, tracking_phase FROM public.hiker_sessions')).rows[0], { status: 'completed', tracking_phase: 'completed' });
  assert.equal((await db.query('SELECT status FROM public.bookings')).rows[0].status, 'completed');
  assert.equal((await db.query('SELECT status FROM public.booking_assignments')).rows[0].status, 'completed');
  assert.equal((await db.query('SELECT status FROM public.guides')).rows[0].status, 'available');
});

test('a completion retry is idempotent and does not create another state transition', async () => {
  const result = await db.query('SELECT public.complete_hike_session($1, $2) AS result', [bookingId, '{"groupPhase":"completed"}']);
  assert.equal(result.rows[0].result.already_completed, true);
  assert.equal((await db.query('SELECT count(*)::int AS count FROM public.hiker_sessions WHERE status = \'completed\'')).rows[0].count, 1);
});
