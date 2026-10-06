import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const migrationPath = 'supabase/migrations/20261006130000_merge_lamot1_to_lamot2_after_jump_off.sql';
const ids = {
  lamot1: '00000000-0000-4000-8000-000000000001',
  lamot2: '00000000-0000-4000-8000-000000000002',
  route1: '00000000-0000-4000-8000-000000000011',
  route2: '00000000-0000-4000-8000-000000000012',
};
let db;

before(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE TABLE public.locations (id uuid PRIMARY KEY, slug text, name text);
    CREATE TABLE public.trail_zones (
      id uuid PRIMARY KEY,
      location_id uuid NOT NULL,
      name text NOT NULL,
      coordinates_json jsonb NOT NULL,
      recording_metadata jsonb,
      status text NOT NULL,
      is_official boolean NOT NULL,
      review_status text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    INSERT INTO public.locations VALUES
      ('${ids.lamot1}', 'lamot-1', 'Lamot 1'),
      ('${ids.lamot2}', 'lamot-2', 'Lamot 2');
  `);

  const points = (baseLat, baseLng) => Array.from({ length: 20 }, (_, index) => ({
    lat: baseLat + index * 0.0001,
    lng: baseLng + index * 0.0001,
  }));
  for (const [routeId, locationId, baseLat, baseLng] of [
    [ids.route1, ids.lamot1, 14.147, 121.324],
    [ids.route2, ids.lamot2, 14.148, 121.329],
  ]) {
    await db.query(`
      INSERT INTO public.trail_zones
        (id, location_id, name, coordinates_json, recording_metadata, status, is_official, review_status)
      VALUES ($1, $2, 'Approved route', $3::jsonb, '{}'::jsonb, 'active', true, 'approved')
    `, [routeId, locationId, JSON.stringify(points(baseLat, baseLng))]);
  }
  await db.exec(await readFile(migrationPath, 'utf8'));
}, { timeout: 30000 });

after(async () => { await db?.close(); });

test('merges Lamot 1 at Station 1 and is safe to rerun', async () => {
  const { rows } = await db.query(`
    SELECT coordinates_json, recording_metadata
    FROM public.trail_zones WHERE id = $1
  `, [ids.route1]);
  const route = rows[0];
  const reference = await db.query(`
    SELECT coordinates_json FROM public.trail_zones WHERE id = $1
  `, [ids.route2]);

  assert.equal(route.coordinates_json.length, 20);
  assert.deepEqual(route.coordinates_json[3], reference.rows[0].coordinates_json[3]);
  assert.deepEqual(route.coordinates_json.slice(4), reference.rows[0].coordinates_json.slice(4));
  assert.equal(route.recording_metadata.sharedRouteSuffix.transitionStartProgress, 0.05);

  await db.exec(await readFile(migrationPath, 'utf8'));
  const { rows: rerun } = await db.query('SELECT coordinates_json FROM public.trail_zones WHERE id = $1', [ids.route1]);
  assert.deepEqual(rerun[0].coordinates_json, route.coordinates_json);
});
