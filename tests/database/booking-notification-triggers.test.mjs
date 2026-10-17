import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const hikerId = id(1);
const adminId = id(2);
const guideId = id(3);
const centralId = id(4);
const locationId = id(10);
const bookingId = id(20);
let db;

before(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE authenticated;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT nullif(current_setting('test.actor', true), '')::uuid
    $$;
    CREATE TABLE public.bookings (
      id uuid PRIMARY KEY,
      user_id uuid NOT NULL,
      location_id uuid,
      booking_date date NOT NULL,
      status text NOT NULL
    );
    CREATE TABLE public.booking_messages (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      booking_id uuid NOT NULL,
      sender_id uuid,
      sender_role text NOT NULL,
      recipient_role text,
      kind text NOT NULL DEFAULT 'chat',
      content text NOT NULL
    );
    CREATE TABLE public.guides (id uuid PRIMARY KEY, user_id uuid, location_id uuid);
    CREATE TABLE public.booking_assignments (booking_id uuid, guide_id uuid, status text NOT NULL);
    CREATE TABLE public.user_locations (user_id uuid, location_id uuid);
    CREATE TABLE public.user_roles (user_id uuid, role text NOT NULL);
    CREATE TABLE public.app_notifications (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES auth.users(id),
      sender_id uuid,
      type text NOT NULL DEFAULT 'system',
      reference_id uuid,
      target_type text,
      target_id uuid,
      route text,
      title text NOT NULL,
      body text NOT NULL,
      category text NOT NULL,
      link text,
      read boolean NOT NULL DEFAULT false,
      is_read boolean NOT NULL DEFAULT false
    );
  `);
  await db.exec(await readFile('supabase/migrations/20261013160000_booking_lifecycle_notifications.sql', 'utf8'));
  await db.exec(await readFile('supabase/migrations/20261017133000_local_admin_booking_notification_scope.sql', 'utf8'));
});

beforeEach(async () => {
  await db.exec(`
    TRUNCATE public.app_notifications, public.booking_messages, public.booking_assignments,
      public.guides, public.user_roles, public.user_locations, public.bookings, auth.users;
    INSERT INTO auth.users (id) VALUES ('${hikerId}'), ('${adminId}'), ('${guideId}'), ('${centralId}');
    INSERT INTO public.bookings (id, user_id, location_id, booking_date, status)
      VALUES ('${bookingId}', '${hikerId}', '${locationId}', '2026-10-20', 'pending');
    INSERT INTO public.guides (id, user_id, location_id) VALUES ('${id(30)}', '${guideId}', '${locationId}');
    INSERT INTO public.booking_assignments (booking_id, guide_id, status)
      VALUES ('${bookingId}', '${id(30)}', 'accepted');
    INSERT INTO public.user_locations (user_id, location_id) VALUES ('${adminId}', '${locationId}');
    INSERT INTO public.user_roles (user_id, role) VALUES ('${adminId}', 'admin'), ('${centralId}', 'super_admin');
    SELECT set_config('test.actor', '${hikerId}', false);
  `);
});

after(async () => { await db?.close(); });

test('recipient-addressed booking messages notify only the responsible local admin', async () => {
  await db.query(`INSERT INTO public.booking_messages
    (booking_id, sender_id, sender_role, recipient_role, kind, content)
    VALUES ($1, $2, 'hiker', 'admin', 'chat', 'Can we meet earlier?')`, [bookingId, hikerId]);
  const adminNotifications = await db.query('SELECT user_id, title, link FROM public.app_notifications');
  assert.deepEqual(adminNotifications.rows, [
    { user_id: adminId, title: 'New message from Hiker', link: `/admin?tab=requests&bookingId=${bookingId}` },
  ]);

  await db.query(`INSERT INTO public.booking_messages
    (booking_id, sender_id, sender_role, recipient_role, kind, content)
    VALUES ($1, $2, 'admin', 'guide', 'chat', 'Please confirm.')`, [bookingId, adminId]);
  assert.equal((await db.query(`SELECT count(*)::int AS n FROM public.app_notifications WHERE user_id=$1`, [guideId])).rows[0].n, 1);
});

test('booking lifecycle changes alert only the responsible local admin for hiker requests', async () => {
  await db.query(`UPDATE public.bookings SET status = 'adjustment_pending' WHERE id = $1`, [bookingId]);
  const notifications = await db.query('SELECT user_id, title, link FROM public.app_notifications ORDER BY user_id, title');
  assert.deepEqual(notifications.rows, [
    { user_id: adminId, title: 'Hiker reschedule request', link: `/admin?tab=requests&bookingId=${bookingId}` },
  ]);
});
