import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

let db;
const location = '00000000-0000-4000-8000-000000000001';

before(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE TABLE public.announcements (id text PRIMARY KEY, title text NOT NULL);
    CREATE TABLE public.daily_capacity (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      location_id uuid,
      date date NOT NULL,
      max_capacity integer NOT NULL DEFAULT 100,
      current_count integer NOT NULL DEFAULT 0,
      UNIQUE (location_id, date)
    );
    CREATE TABLE public.bookings (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      location_id uuid,
      booking_date date NOT NULL,
      group_size integer NOT NULL DEFAULT 1,
      status text NOT NULL DEFAULT 'pending',
      notes text
    );
    CREATE FUNCTION public.safe_booking_meta(text) RETURNS jsonb
      LANGUAGE sql IMMUTABLE AS $$ SELECT coalesce(nullif($1, '')::jsonb, '{}'::jsonb) $$;
    INSERT INTO public.daily_capacity (location_id, date, max_capacity)
      VALUES (NULL, '2026-10-06', 80), (NULL, '2026-10-06', 90);
    INSERT INTO public.bookings (location_id, booking_date, group_size, status, notes)
      VALUES ('${location}', '2026-10-06', 2, 'confirmed', '{"hikeType":"morning"}');
  `);
  await db.exec(await readFile('supabase/migrations/20261006120000_daily_capacity_day_night_columns.sql', 'utf8'));
}, { timeout: 30000 });

after(async () => { await db?.close(); });

test('adds announcement source and consolidates legacy global capacity rows', async () => {
  const source = await db.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'announcements' AND column_name = 'source'
  `);
  assert.equal(source.rows.length, 1);

  const globalRows = await db.query(`
    SELECT max_capacity, current_count FROM public.daily_capacity
    WHERE location_id IS NULL AND date = '2026-10-06'
  `);
  assert.deepEqual(globalRows.rows, [{ max_capacity: 90, current_count: 2 }]);
});

test('booking status, schedule and deletion keep per-location day/night counters accurate', async () => {
  const insert = await db.query(`
    INSERT INTO public.bookings (location_id, booking_date, group_size, status, notes)
    VALUES ($1, '2026-10-07', 3, 'pending', '{"hikeType":"night"}')
    RETURNING id
  `, [location]);
  const bookingId = insert.rows[0].id;

  let count = await db.query(`
    SELECT current_count, day_current_count, night_current_count
    FROM public.daily_capacity WHERE location_id = $1 AND date = '2026-10-07'
  `, [location]);
  assert.deepEqual(count.rows[0], { current_count: 3, day_current_count: 0, night_current_count: 3 });

  await db.query(`UPDATE public.bookings SET notes = '{"hikeType":"morning"}', group_size = 4 WHERE id = $1`, [bookingId]);
  count = await db.query(`
    SELECT current_count, day_current_count, night_current_count
    FROM public.daily_capacity WHERE location_id = $1 AND date = '2026-10-07'
  `, [location]);
  assert.deepEqual(count.rows[0], { current_count: 4, day_current_count: 4, night_current_count: 0 });

  await db.query('DELETE FROM public.bookings WHERE id = $1', [bookingId]);
  count = await db.query(`
    SELECT current_count, day_current_count, night_current_count
    FROM public.daily_capacity WHERE location_id = $1 AND date = '2026-10-07'
  `, [location]);
  assert.deepEqual(count.rows[0], { current_count: 0, day_current_count: 0, night_current_count: 0 });
});

test('mountain-wide capacity upsert treats NULL location as one unique key', async () => {
  await db.query(`
    INSERT INTO public.daily_capacity (location_id, date, max_capacity)
    VALUES (NULL, '2026-10-08', 70)
    ON CONFLICT (location_id, date) DO UPDATE SET max_capacity = EXCLUDED.max_capacity
  `);
  await db.query(`
    INSERT INTO public.daily_capacity (location_id, date, max_capacity)
    VALUES (NULL, '2026-10-08', 60)
    ON CONFLICT (location_id, date) DO UPDATE SET max_capacity = EXCLUDED.max_capacity
  `);
  const rows = await db.query(`SELECT max_capacity FROM public.daily_capacity WHERE location_id IS NULL AND date = '2026-10-08'`);
  assert.deepEqual(rows.rows, [{ max_capacity: 60 }]);
});
