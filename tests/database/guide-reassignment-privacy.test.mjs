import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
let db;

before(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE authenticated;
    CREATE SCHEMA auth;
    CREATE TYPE public.app_role AS ENUM ('admin','super_admin','guide','hiker');
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT current_setting('test.actor')::uuid $$;
    CREATE FUNCTION public.has_role(u uuid, r public.app_role) RETURNS boolean LANGUAGE sql STABLE AS $$
      SELECT (u = '${id(1)}' AND r = 'admin') OR (u = '${id(2)}' AND r = 'guide')
    $$;
    CREATE FUNCTION public.admin_can_access_location(loc uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
      SELECT current_setting('test.actor')::uuid = '${id(1)}' AND loc = '${id(10)}'
    $$;
    CREATE TABLE public.bookings(
      id uuid PRIMARY KEY, location_id uuid, status text, notes text, booking_date date, user_id uuid
    );
    CREATE TABLE public.guides(
      id uuid PRIMARY KEY, user_id uuid, location_id uuid, is_active boolean,
      status text, full_name text, phone text, updated_at timestamptz DEFAULT now()
    );
    CREATE TABLE public.booking_assignments(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), booking_id uuid, guide_id uuid,
      location_id uuid, status text, decided_at timestamptz, reassignment_reason text,
      created_at timestamptz DEFAULT now()
    );
    CREATE TABLE public.booking_messages(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), booking_id uuid, sender_id uuid,
      sender_role text NOT NULL DEFAULT 'system', kind text NOT NULL DEFAULT 'chat',
      content text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE FUNCTION public.guide_can_read_booking(bid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
      SELECT EXISTS (SELECT 1 FROM public.booking_assignments ba JOIN public.guides g ON g.id=ba.guide_id
        WHERE ba.booking_id=bid AND g.user_id=auth.uid())
    $$;
    CREATE FUNCTION public.guide_can_manage_booking(bid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
      SELECT public.guide_can_read_booking(bid)
    $$;
    ALTER TABLE public.booking_messages ENABLE ROW LEVEL SECURITY;
    CREATE POLICY bm_admin_all ON public.booking_messages FOR ALL TO authenticated
      USING (public.has_role(auth.uid(), 'admin'::public.app_role))
      WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
    CREATE POLICY bm_owner_select ON public.booking_messages FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM public.bookings b WHERE b.id=booking_id AND b.user_id=auth.uid()));
    CREATE POLICY bm_guide_select ON public.booking_messages FOR SELECT TO authenticated
      USING (public.guide_can_read_booking(booking_id));
    GRANT USAGE ON SCHEMA public, auth TO authenticated;
    GRANT SELECT, INSERT, UPDATE ON public.bookings, public.guides, public.booking_assignments, public.booking_messages TO authenticated;
  `);
  await db.exec(await readFile('supabase/migrations/20261006120000_guide_message_audience_and_reassignment.sql', 'utf8'));
});

beforeEach(async () => {
  await db.exec(`
    RESET ROLE;
    TRUNCATE public.booking_messages, public.booking_assignments, public.bookings, public.guides;
    INSERT INTO public.bookings VALUES ('${id(20)}','${id(10)}','confirmed',
      '{"assignedGuideId":"${id(30)}","assignedGuide":"Guide One"}','2026-10-10','${id(3)}');
    INSERT INTO public.guides (id,user_id,location_id,is_active,status,full_name,phone) VALUES
      ('${id(30)}','${id(2)}','${id(10)}',true,'available','Guide One','09170000001'),
      ('${id(31)}','${id(4)}','${id(10)}',true,'available','Guide Two','09170000002'),
      ('${id(32)}','${id(5)}','${id(11)}',true,'available','Other Trailhead','09170000003');
    INSERT INTO public.booking_assignments (id, booking_id, guide_id, location_id, status)
      VALUES ('${id(40)}','${id(20)}','${id(30)}','${id(10)}','accepted');
    INSERT INTO public.booking_messages (booking_id, sender_id, sender_role, recipient_role, content) VALUES
      ('${id(20)}','${id(3)}','hiker','guide','Guide question'),
      ('${id(20)}','${id(3)}','hiker','admin','Private admin request'),
      ('${id(20)}','${id(1)}','admin','hiker','Admin update');
    SET ROLE authenticated;
    SET test.actor = '${id(1)}';
  `);
});

after(async () => { await db?.close(); });

test('admin reassignment updates assignments and booking metadata atomically', async () => {
  const result = await db.query('SELECT public.admin_reassign_hike_guide($1,$2,$3) AS result', [id(20), id(31), 'Coverage change']);
  assert.equal(result.rows[0].result.guideUserId, id(4));
  assert.equal((await db.query('SELECT status FROM booking_assignments WHERE guide_id=$1', [id(30)])).rows[0].status, 'declined');
  assert.equal((await db.query('SELECT status FROM booking_assignments WHERE guide_id=$1', [id(31)])).rows[0].status, 'pending');
  assert.equal(JSON.parse((await db.query('SELECT notes FROM bookings WHERE id=$1', [id(20)])).rows[0].notes).assignedGuideId, id(31));
});

test('assignment failure rolls back all writes', async () => {
  await db.exec(`RESET ROLE; ALTER TABLE public.bookings ADD CONSTRAINT reject_notes CHECK (notes = '{"assignedGuideId":"${id(30)}","assignedGuide":"Guide One"}'); SET ROLE authenticated;`);
  await assert.rejects(
    db.query('SELECT public.admin_reassign_hike_guide($1,$2,$3)', [id(20), id(31), 'Coverage change']),
    /reject_notes/,
  );
  assert.equal((await db.query('SELECT status FROM booking_assignments WHERE guide_id=$1', [id(30)])).rows[0].status, 'accepted');
  assert.equal((await db.query('SELECT count(*)::int AS n FROM booking_assignments WHERE guide_id=$1', [id(31)])).rows[0].n, 0);
  await db.exec('RESET ROLE; ALTER TABLE public.bookings DROP CONSTRAINT reject_notes; SET ROLE authenticated;');
});

test('assigned guide sees hiker-to-guide messages, not messages addressed only to admin', async () => {
  await db.exec(`SET test.actor = '${id(2)}'`);
  const visible = await db.query('SELECT content FROM public.booking_messages ORDER BY content');
  assert.deepEqual(visible.rows.map((row) => row.content), ['Guide question']);
});

test('former guide loses access after atomic reassignment', async () => {
  await db.exec(`SET test.actor = '${id(1)}'`);
  await db.query('SELECT public.admin_reassign_hike_guide($1,$2,$3)', [id(20), id(31), 'Coverage change']);
  await db.exec(`SET test.actor = '${id(2)}'`);
  assert.equal((await db.query('SELECT content FROM public.booking_messages')).rows.length, 0);
});

test('guide reassignment transaction hands off only within the booking trailhead', async () => {
  await db.exec(`SET test.actor = '${id(2)}'`);
  await assert.rejects(
    db.query('SELECT public.guide_reassign_hike_assignment($1,$2,$3) AS result', [id(40), id(32), 'Wrong location']),
    /active guide with an account at this booking trailhead/,
  );
  const result = await db.query('SELECT public.guide_reassign_hike_assignment($1,$2,$3) AS result', [id(40), id(31), 'Medical emergency']);
  assert.equal(result.rows[0].result.replacementGuideUserId, id(4));
  assert.equal((await db.query('SELECT status FROM booking_assignments WHERE guide_id=$1', [id(30)])).rows[0].status, 'declined');
  assert.equal((await db.query('SELECT status FROM booking_assignments WHERE guide_id=$1', [id(31)])).rows[0].status, 'pending');
});
