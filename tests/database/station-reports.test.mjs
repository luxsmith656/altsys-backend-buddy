import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('station reports enforce ownership, active sessions, staff scope and retry idempotency', async () => {
  const db = new PGlite();
  const user = '00000000-0000-4000-8000-000000000001';
  const other = '00000000-0000-4000-8000-000000000002';
  const session = '00000000-0000-4000-8000-000000000003';
  const report = '00000000-0000-4000-8000-000000000004';
  try {
    await db.exec(`
      CREATE ROLE authenticated;
      CREATE SCHEMA auth;
      CREATE TABLE auth.users(id uuid PRIMARY KEY);
      INSERT INTO auth.users VALUES ('${user}'), ('${other}');
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT current_setting('request.user')::uuid $$;
      CREATE FUNCTION public.has_role(uuid, text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT current_setting('request.role') = $2 $$;
      CREATE TABLE hiker_sessions(id uuid PRIMARY KEY, user_id uuid, status text, location_id uuid);
      CREATE TABLE user_locations(user_id uuid, location_id uuid);
      INSERT INTO hiker_sessions VALUES ('${session}', '${user}', 'active', '${session}');
      GRANT USAGE ON SCHEMA auth TO authenticated;
      GRANT SELECT ON hiker_sessions, user_locations TO authenticated;
    `);
    await db.exec(await readFile('supabase/migrations/20261011140000_manual_station_reports.sql', 'utf8'));
    await db.exec(`SET ROLE authenticated; SELECT set_config('request.user','${user}',false), set_config('request.role','hiker',false)`);
    const insert = `INSERT INTO hike_station_reports(id, session_id, user_id, station, reported_at) VALUES ('${report}', '${session}', '${user}', 2, now()) ON CONFLICT(id) DO NOTHING`;
    await db.exec(insert);
    await db.exec(insert);
    assert.equal((await db.query('SELECT * FROM hike_station_reports')).rows.length, 1);
    await db.exec(`SELECT set_config('request.user','${other}',false)`);
    assert.equal((await db.query('SELECT * FROM hike_station_reports')).rows.length, 0);
    await assert.rejects(db.exec(`INSERT INTO hike_station_reports VALUES ('${other}', '${session}', '${other}', 3, now(), now())`), /row-level security/);
    await db.exec(`SELECT set_config('request.role','admin',false)`);
    assert.equal((await db.query('SELECT * FROM hike_station_reports')).rows.length, 0);
    await db.exec(`RESET ROLE; INSERT INTO user_locations VALUES ('${other}', '${session}'); SET ROLE authenticated`);
    assert.equal((await db.query('SELECT * FROM hike_station_reports')).rows.length, 1);
    await db.exec(`SELECT set_config('request.role','super_admin',false)`);
    assert.equal((await db.query('SELECT * FROM hike_station_reports')).rows.length, 1);
    await db.exec(`RESET ROLE; UPDATE hiker_sessions SET status='completed'; SET ROLE authenticated; SELECT set_config('request.user','${user}',false), set_config('request.role','hiker',false)`);
    await assert.rejects(db.exec(`INSERT INTO hike_station_reports VALUES ('${other}', '${session}', '${user}', 6, now(), now())`), /row-level security/);
  } finally { await db.close(); }
});
