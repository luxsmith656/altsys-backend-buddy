import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
let db;

before(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE TABLE public.locations(
      id uuid PRIMARY KEY, slug text NOT NULL, center_lat numeric NOT NULL, center_lng numeric NOT NULL
    );
    CREATE TABLE public.trail_zones(
      id uuid PRIMARY KEY, location_id uuid NOT NULL, coordinates_json jsonb NOT NULL,
      status text NOT NULL, is_official boolean NOT NULL, review_status text NOT NULL
    );
    CREATE TABLE public.guides(id uuid PRIMARY KEY, referral_code text);
    CREATE TABLE public.bookings(id uuid PRIMARY KEY);
    CREATE TABLE public.reviews(
      id uuid PRIMARY KEY, user_id uuid NOT NULL, reviewer_name text NOT NULL DEFAULT '',
      rating int NOT NULL DEFAULT 5, trail_name text NOT NULL DEFAULT '',
      review_text text NOT NULL DEFAULT '', is_approved boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    INSERT INTO public.locations VALUES ('${id(1)}', 'lamot-2', 14.1420, 121.3410);
    INSERT INTO public.trail_zones VALUES (
      '${id(2)}', '${id(1)}',
      '[{"lat":14.144,"lng":121.343},{"lat":14.147,"lng":121.345}]'::jsonb,
      'active', true, 'approved'
    );
    INSERT INTO public.guides VALUES ('${id(3)}', NULL);
    INSERT INTO public.bookings VALUES ('${id(4)}');
  `);
  await db.exec(await readFile('supabase/migrations/20261007130000_booking_integrity_and_lamot2_start.sql', 'utf8'));
});

after(async () => { await db?.close(); });

test('Lamot 2 jump-off and active route anchor use the published GPS start', async () => {
  const location = await db.query("SELECT center_lat, center_lng FROM public.locations WHERE slug='lamot-2'");
  assert.equal(Number(location.rows[0].center_lat), 14.1486888);
  assert.equal(Number(location.rows[0].center_lng), 121.3291523);
  const route = await db.query('SELECT coordinates_json->0 AS first_point, coordinates_json->1 AS second_point FROM public.trail_zones WHERE id=$1', [id(2)]);
  assert.deepEqual(route.rows[0].first_point, { lat: 14.1486888, lng: 121.3291523 });
  assert.deepEqual(route.rows[0].second_point, { lat: 14.147, lng: 121.345 });
});

test('guide referral codes are backfilled and duplicate reviews are rejected', async () => {
  const guide = await db.query('SELECT referral_code FROM public.guides WHERE id=$1', [id(3)]);
  assert.equal(guide.rows[0].referral_code, 'KALI-00000000');
  await db.query('INSERT INTO public.reviews (id, user_id, booking_id, review_text) VALUES ($1,$2,$3,$4)', [id(7), id(6), id(4), 'Good trail']);
  await assert.rejects(
    db.query('INSERT INTO public.reviews (id, user_id, booking_id, review_text) VALUES ($1,$2,$3,$4)', [id(8), id(6), id(4), 'Second review']),
    /reviews_one_per_booking_user_idx|duplicate key/,
  );
});
