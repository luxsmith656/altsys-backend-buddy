import { before, after, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
let db;

before(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE TABLE public.bookings(id uuid PRIMARY KEY, location_id uuid);
    CREATE TABLE public.guides(id uuid PRIMARY KEY, location_id uuid);
    CREATE TABLE public.booking_assignments(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      booking_id uuid NOT NULL,
      guide_id uuid NOT NULL,
      location_id uuid,
      status text NOT NULL DEFAULT 'pending'
    );
  `);
  await db.exec(await readFile('supabase/migrations/20261006130000_booking_guide_location_boundary.sql', 'utf8'));
});

beforeEach(async () => {
  await db.exec(`
    TRUNCATE public.booking_assignments, public.bookings, public.guides;
    INSERT INTO public.bookings VALUES ('${id(1)}', '${id(10)}');
    INSERT INTO public.guides VALUES ('${id(2)}', '${id(10)}'), ('${id(3)}', '${id(11)}');
  `);
});

after(async () => { await db?.close(); });

test('same-trailhead guide assignments inherit the booking location', async () => {
  await db.query('INSERT INTO public.booking_assignments (booking_id, guide_id) VALUES ($1, $2)', [id(1), id(2)]);
  assert.equal((await db.query('SELECT location_id FROM public.booking_assignments')).rows[0].location_id, id(10));
});

test('cross-trailhead guide assignments are rejected even when the client inserts directly', async () => {
  await assert.rejects(
    db.query('INSERT INTO public.booking_assignments (booking_id, guide_id, location_id) VALUES ($1, $2, $3)', [id(1), id(3), id(10)]),
    /same trailhead/,
  );
  assert.equal((await db.query('SELECT count(*)::int AS count FROM public.booking_assignments')).rows[0].count, 0);
});

test('assignment updates cannot move a booking to another trailhead guide', async () => {
  await db.query('INSERT INTO public.booking_assignments (booking_id, guide_id) VALUES ($1, $2)', [id(1), id(2)]);
  await assert.rejects(
    db.query('UPDATE public.booking_assignments SET guide_id = $1 WHERE booking_id = $2', [id(3), id(1)]),
    /same trailhead/,
  );
});

test('an active booking cannot be moved away from its assigned guide trailhead', async () => {
  await db.query('INSERT INTO public.booking_assignments (booking_id, guide_id) VALUES ($1, $2)', [id(1), id(2)]);
  await assert.rejects(
    db.query('UPDATE public.bookings SET location_id = $1 WHERE id = $2', [id(11), id(1)]),
    /Reassign the active guide/,
  );
});

test('a guide with active assignments cannot be moved to another trailhead', async () => {
  await db.query('INSERT INTO public.booking_assignments (booking_id, guide_id) VALUES ($1, $2)', [id(1), id(2)]);
  await assert.rejects(
    db.query('UPDATE public.guides SET location_id = $1 WHERE id = $2', [id(11), id(2)]),
    /Finish or reassign active bookings/,
  );
});
