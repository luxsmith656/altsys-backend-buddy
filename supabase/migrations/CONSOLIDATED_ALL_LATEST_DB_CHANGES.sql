-- ==============================================================================
-- MT. KALISUNGAN ECO-TOURISM SYSTEM: CONSOLIDATED LATEST DATABASE MIGRATION
-- Run this entire script in your Supabase SQL Editor.
-- It is designed to be idempotent (safe to rerun multiple times).
-- ==============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 1: SYSTEM ROLES & ENUMS
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'app_role' AND e.enumlabel = 'mdrrmo'
  ) THEN
    ALTER TYPE public.app_role ADD VALUE 'mdrrmo';
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 2: LOCATIONS (Ensure Sto. Tomas Trailhead exists)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.locations (
  slug, name, lgu, region, address, center_lat, center_lng, status,
  entry_fee, default_guide_fee, description
)
VALUES (
  'sto-tomas', 'Sto. Tomas Trailhead', 'Calauan', 'Laguna',
  'Sto. Tomas, Calauan, Laguna, Philippines', 14.1505, 121.3490, 'active',
  50, 500, 'Sto. Tomas entry point to Mt. Kalisungan'
)
ON CONFLICT (slug) DO UPDATE SET
  status = 'active',
  description = EXCLUDED.description;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 3: PROFILES TABLE ENHANCEMENTS
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS mdrrmo_consent_at timestamptz,
  ADD COLUMN IF NOT EXISTS mdrrmo_consent_version text,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 4: GUIDES TABLE PROFILE, ONBOARDING & SOCIAL FIELDS
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.guides
  ADD COLUMN IF NOT EXISTS photo_url text,
  ADD COLUMN IF NOT EXISTS facebook_url text,
  ADD COLUMN IF NOT EXISTS sex text,
  ADD COLUMN IF NOT EXISTS age integer,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz;

CREATE INDEX IF NOT EXISTS guides_onboarding_idx
  ON public.guides (user_id, onboarding_completed_at);

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 5: SYSTEM SETTINGS & DYNAMIC PRICING CONFIGURATION
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.system_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read on system_settings" ON public.system_settings;
CREATE POLICY "Allow public read on system_settings"
  ON public.system_settings FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Allow admins to modify system_settings" ON public.system_settings;
CREATE POLICY "Allow admins to modify system_settings"
  ON public.system_settings FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role IN ('super_admin', 'admin')
    )
  );

INSERT INTO public.system_settings (key, value, updated_at)
VALUES (
  'pricing_config',
  '{
    "entryFee": 30,
    "envFee": 20,
    "guideFeeMorning": 800,
    "guideFeeNight": 1000,
    "guideFeeOvernight": 1600,
    "peakExtensionFeePerHour": 100,
    "horseEmergencyFee": 500,
    "horseHighStationFee": 1000
  }'::jsonb,
  now()
)
ON CONFLICT (key) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 6: FAST SIGNUP EMAIL OTP CHALLENGES
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.email_otp_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS email_otp_challenges_email_idx
  ON public.email_otp_challenges (email, created_at DESC);

ALTER TABLE public.email_otp_challenges ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 7: GUIDE REVIEWS & RATINGS SCHEMA
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.guide_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guide_id uuid NOT NULL REFERENCES public.guides(id) ON DELETE CASCADE,
  booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  reviewer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reviewer_name text NOT NULL DEFAULT '',
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment text NOT NULL DEFAULT '',
  is_approved boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (booking_id, reviewer_id, guide_id)
);

ALTER TABLE public.guide_reviews ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS guide_reviews_guide_created_idx
  ON public.guide_reviews (guide_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.can_moderate_guide_review(_booking_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND (
    public.has_role(auth.uid(), 'super_admin')
    OR (public.has_role(auth.uid(), 'admin') AND EXISTS (
      SELECT 1 FROM public.bookings b
      JOIN public.user_locations ul ON ul.location_id = b.location_id
      WHERE b.id = _booking_id AND ul.user_id = auth.uid()
    ))
  );
$$;

CREATE OR REPLACE FUNCTION public.can_submit_guide_review(_booking_id uuid, _guide_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.bookings b
    JOIN public.booking_assignments ba ON ba.booking_id = b.id
    WHERE b.id = _booking_id
      AND b.status = 'completed'
      AND ba.guide_id = _guide_id
      AND ba.status IN ('accepted', 'completed')
      AND (b.user_id = auth.uid() OR public.can_moderate_guide_review(b.id))
  );
$$;

REVOKE ALL ON FUNCTION public.can_moderate_guide_review(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_submit_guide_review(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_moderate_guide_review(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_submit_guide_review(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS guide_reviews_public_read ON public.guide_reviews;
CREATE POLICY guide_reviews_public_read ON public.guide_reviews
  FOR SELECT TO anon, authenticated USING (is_approved = true);

DROP POLICY IF EXISTS guide_reviews_owner_read ON public.guide_reviews;
CREATE POLICY guide_reviews_owner_read ON public.guide_reviews
  FOR SELECT TO authenticated USING (reviewer_id = auth.uid());

DROP POLICY IF EXISTS guide_reviews_owner_insert ON public.guide_reviews;
CREATE POLICY guide_reviews_owner_insert ON public.guide_reviews
  FOR INSERT TO authenticated WITH CHECK (
    reviewer_id = auth.uid() AND public.can_submit_guide_review(booking_id, guide_id)
  );

DROP POLICY IF EXISTS guide_reviews_admin_all ON public.guide_reviews;
CREATE POLICY guide_reviews_admin_all ON public.guide_reviews
  FOR ALL TO authenticated
  USING (public.can_moderate_guide_review(booking_id))
  WITH CHECK (public.can_moderate_guide_review(booking_id));

GRANT SELECT ON public.guide_reviews TO anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.guide_reviews FROM anon;
GRANT INSERT, DELETE ON public.guide_reviews TO authenticated;
REVOKE UPDATE ON public.guide_reviews FROM authenticated;
GRANT UPDATE (is_approved) ON public.guide_reviews TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 8: SAFE BOOKING METADATA PARSER & START CAPACITY ENFORCEMENT
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.safe_booking_meta(_notes text)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  IF _notes IS NULL OR jsonb_typeof(_notes::jsonb) <> 'object' THEN
    RETURN '{}'::jsonb;
  END IF;
  RETURN _notes::jsonb;
EXCEPTION WHEN others THEN
  RETURN '{}'::jsonb;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_booking_start_capacity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_meta jsonb;
  v_time text;
  v_type text;
  v_hour int;
  v_duration int;
  v_peak_hour int;
  v_same_start int;
  v_peak_groups int;
BEGIN
  IF NEW.status NOT IN ('pending', 'confirmed', 'accepted', 'active', 'adjustment_pending') THEN
    RETURN NEW;
  END IF;

  v_meta := public.safe_booking_meta(NEW.notes);
  v_time := upper(regexp_replace(trim(coalesce(v_meta->>'hikeTime', '')), '\s+', ' ', 'g'));

  IF v_time = '' THEN
    RETURN NEW;
  END IF;
  IF v_time !~ '^(0?[1-9]|1[0-2]):00 (AM|PM)$' THEN
    RAISE EXCEPTION 'Start time must use an aligned hourly interval (for example 06:00 AM).';
  END IF;

  v_hour := split_part(v_time, ':', 1)::int;
  IF right(v_time, 2) = 'PM' AND v_hour < 12 THEN v_hour := v_hour + 12; END IF;
  IF right(v_time, 2) = 'AM' AND v_hour = 12 THEN v_hour := 0; END IF;

  v_type := lower(coalesce(v_meta->>'hikeType', 'morning'));
  v_duration := CASE v_type WHEN 'overnight' THEN 5 WHEN 'night' THEN 3 ELSE 4 END;
  v_peak_hour := floor(mod(v_hour + v_duration, 24) / 6);

  -- Advisory lock serializes submissions per date to prevent race conditions
  PERFORM pg_advisory_xact_lock(hashtextextended('kalisungan-booking:' || NEW.booking_date::text, 0));

  SELECT count(*)
  INTO v_same_start
  FROM public.bookings b
  WHERE b.id IS DISTINCT FROM NEW.id
    AND b.booking_date = NEW.booking_date
    AND b.status IN ('pending', 'confirmed', 'accepted', 'active', 'adjustment_pending')
    AND upper(regexp_replace(trim(coalesce(public.safe_booking_meta(b.notes)->>'hikeTime', '')), '\s+', ' ', 'g')) = v_time;

  IF v_same_start > 0 THEN
    RAISE EXCEPTION 'That start time is already reserved. Choose the next available start slot.';
  END IF;

  SELECT count(*)
  INTO v_peak_groups
  FROM public.bookings b
  CROSS JOIN LATERAL (
    SELECT public.safe_booking_meta(b.notes) AS meta
  ) parsed
  WHERE b.id IS DISTINCT FROM NEW.id
    AND b.booking_date = NEW.booking_date
    AND b.status IN ('pending', 'confirmed', 'accepted', 'active', 'adjustment_pending')
    AND (parsed.meta->>'hikeTime') ~ '^(0?[1-9]|1[0-2]):00 (AM|PM)$'
    AND mod(
      CASE
        WHEN right(upper(parsed.meta->>'hikeTime'), 2) = 'PM'
          THEN (split_part(parsed.meta->>'hikeTime', ':', 1)::int % 12) + 12
        ELSE split_part(parsed.meta->>'hikeTime', ':', 1)::int % 12
      END
      + CASE lower(coalesce(parsed.meta->>'hikeType', 'morning')) WHEN 'overnight' THEN 5 WHEN 'night' THEN 3 ELSE 4 END,
      24
    ) / 6 = v_peak_hour;

  IF v_peak_groups >= 5 THEN
    RAISE EXCEPTION 'The summit arrival window already has five active groups. Choose another available start time.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_booking_start_capacity ON public.bookings;
CREATE TRIGGER trg_enforce_booking_start_capacity
BEFORE INSERT OR UPDATE OF booking_date, notes, status ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.enforce_booking_start_capacity();

-- Aggregate start capacity RPC (never exposes other hikers PII to anonymous/regular users)
CREATE OR REPLACE FUNCTION public.get_booking_slot_capacity(
  p_start_date date,
  p_end_date date
)
RETURNS TABLE (
  booking_date date,
  hike_time text,
  hike_type text,
  summit_hour int,
  group_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    b.booking_date,
    upper(regexp_replace(trim(parsed.meta->>'hikeTime'), '\s+', ' ', 'g')) AS hike_time,
    lower(coalesce(parsed.meta->>'hikeType', 'morning')) AS hike_type,
    mod(
      CASE
        WHEN right(upper(parsed.meta->>'hikeTime'), 2) = 'PM'
          THEN (split_part(parsed.meta->>'hikeTime', ':', 1)::int % 12) + 12
        ELSE split_part(parsed.meta->>'hikeTime', ':', 1)::int % 12
      END
      + CASE lower(coalesce(parsed.meta->>'hikeType', 'morning')) WHEN 'overnight' THEN 5 WHEN 'night' THEN 3 ELSE 4 END,
      24
    )::int / 6 AS summit_hour,
    count(*) AS group_count
  FROM public.bookings b
  CROSS JOIN LATERAL (SELECT public.safe_booking_meta(b.notes) AS meta) parsed
  WHERE b.booking_date BETWEEN p_start_date AND p_end_date
    AND b.status IN ('pending', 'confirmed', 'accepted', 'active', 'adjustment_pending')
    AND (parsed.meta->>'hikeTime') ~ '^(0?[1-9]|1[0-2]):00 (AM|PM)$'
  GROUP BY b.booking_date,
    upper(regexp_replace(trim(parsed.meta->>'hikeTime'), '\s+', ' ', 'g')),
    lower(coalesce(parsed.meta->>'hikeType', 'morning')),
    mod(
      CASE
        WHEN right(upper(parsed.meta->>'hikeTime'), 2) = 'PM'
          THEN (split_part(parsed.meta->>'hikeTime', ':', 1)::int % 12) + 12
        ELSE split_part(parsed.meta->>'hikeTime', ':', 1)::int % 12
      END
      + CASE lower(coalesce(parsed.meta->>'hikeType', 'morning')) WHEN 'overnight' THEN 5 WHEN 'night' THEN 3 ELSE 4 END,
      24
    ) / 6;
$$;

REVOKE ALL ON FUNCTION public.get_booking_slot_capacity(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_booking_slot_capacity(date, date) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 9: BOOKING CONFIRMATION EMAIL OUTBOX QUEUE
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.booking_confirmation_emails (
  booking_id uuid PRIMARY KEY REFERENCES public.bookings(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'needs_review', 'cancelled')),
  attempts integer NOT NULL DEFAULT 0,
  payload jsonb,
  provider_id text,
  last_error text,
  first_attempt_at timestamptz,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  lease_until timestamptz,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.booking_confirmation_emails ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.booking_confirmation_emails FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.booking_confirmation_emails TO service_role;

CREATE INDEX IF NOT EXISTS booking_confirmation_due
  ON public.booking_confirmation_emails (next_attempt_at)
  WHERE status IN ('pending', 'processing');

CREATE OR REPLACE FUNCTION public.queue_booking_confirmation_email()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'confirmed' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    INSERT INTO public.booking_confirmation_emails (booking_id) VALUES (NEW.id)
    ON CONFLICT (booking_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.queue_booking_confirmation_email() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS booking_confirmation_email_queue ON public.bookings;
CREATE TRIGGER booking_confirmation_email_queue
AFTER INSERT OR UPDATE OF status ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.queue_booking_confirmation_email();

CREATE OR REPLACE FUNCTION public.claim_booking_confirmation_email(_booking_id uuid)
RETURNS SETOF public.booking_confirmation_emails
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.booking_confirmation_emails
  SET status = 'needs_review', last_error = 'Retry window expired; verify before retrying.'
  WHERE booking_id = _booking_id AND status IN ('pending', 'processing')
    AND (first_attempt_at < now() - interval '23 hours' OR attempts >= 8)
    AND (lease_until IS NULL OR lease_until < now());

  RETURN QUERY
  UPDATE public.booking_confirmation_emails q
  SET status = 'processing', attempts = attempts + 1,
      first_attempt_at = COALESCE(first_attempt_at, now()), lease_until = now() + interval '2 minutes'
  WHERE q.booking_id = _booking_id
    AND q.status IN ('pending', 'processing') AND q.next_attempt_at <= now()
    AND (q.lease_until IS NULL OR q.lease_until < now())
    AND EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = q.booking_id AND b.status = 'confirmed')
  RETURNING q.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_booking_confirmation_email(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_booking_confirmation_email(uuid) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 10: MDRRMO EMERGENCY AUDIT LOGS & DISPATCH DIRECTORY
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.mdrrmo_access_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mdrrmo_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  access_type text NOT NULL DEFAULT 'directory_view',
  accessed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mdrrmo_access_logs_accessed_at
  ON public.mdrrmo_access_logs(accessed_at DESC);

CREATE INDEX IF NOT EXISTS idx_mdrrmo_access_logs_booking_id
  ON public.mdrrmo_access_logs(booking_id);

ALTER TABLE public.mdrrmo_access_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mdrrmo_access_logs_select ON public.mdrrmo_access_logs;
CREATE POLICY mdrrmo_access_logs_select ON public.mdrrmo_access_logs
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR mdrrmo_user_id = auth.uid()
  );

DROP POLICY IF EXISTS mdrrmo_access_logs_insert ON public.mdrrmo_access_logs;
CREATE POLICY mdrrmo_access_logs_insert ON public.mdrrmo_access_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    mdrrmo_user_id = auth.uid()
    AND public.has_role(auth.uid(), 'mdrrmo'::public.app_role)
  );

CREATE OR REPLACE FUNCTION public.admin_can_access_location(_location_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN _location_id IS NULL THEN false
    WHEN public.has_role(auth.uid(), 'super_admin'::public.app_role) THEN true
    WHEN public.has_role(auth.uid(), 'mdrrmo'::public.app_role) THEN true
    WHEN public.has_role(auth.uid(), 'admin'::public.app_role) THEN EXISTS (
      SELECT 1
      FROM public.user_locations ul
      WHERE ul.user_id = auth.uid()
        AND ul.location_id = _location_id
    )
    ELSE false
  END;
$$;

REVOKE ALL ON FUNCTION public.admin_can_access_location(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_can_access_location(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.mdrrmo_daily_booking_directory(
  p_date date DEFAULT (now() AT TIME ZONE 'Asia/Manila')::date,
  p_location_id uuid DEFAULT NULL
)
RETURNS TABLE (
  booking_id uuid,
  location_id uuid,
  location_name text,
  booking_date date,
  group_size integer,
  lead_name text,
  contact_number text,
  age text,
  sex text,
  medical_notes text,
  people jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'mdrrmo'::public.app_role) THEN
    RAISE EXCEPTION 'MDRRMO access required';
  END IF;

  RETURN QUERY
  WITH source_rows AS (
    SELECT
      b.id,
      b.location_id,
      l.name AS location_name,
      b.booking_date,
      b.group_size,
      b.emergency_contact_name,
      b.emergency_contact_phone,
      public.safe_booking_meta(b.notes) AS meta
    FROM public.bookings b
    LEFT JOIN public.locations l ON l.id = b.location_id
    WHERE b.booking_date = p_date
      AND b.status <> 'cancelled'
      AND (p_location_id IS NULL OR b.location_id = p_location_id)
  )
  SELECT
    s.id,
    s.location_id,
    COALESCE(s.location_name, 'Unassigned location'),
    s.booking_date,
    COALESCE(s.group_size, 1),
    COALESCE(NULLIF(s.meta->>'fullName', ''), s.emergency_contact_name, 'Unnamed hiker'),
    COALESCE(NULLIF(s.meta->>'phoneNumber', ''), s.emergency_contact_phone, 'Not provided'),
    COALESCE(NULLIF(s.meta->>'age', ''), 'Not provided'),
    COALESCE(NULLIF(s.meta->>'sex', ''), 'Not provided'),
    COALESCE(NULLIF(s.meta->>'medicalNotes', ''), 'None recorded'),
    jsonb_build_array(jsonb_build_object(
      'name', COALESCE(NULLIF(s.meta->>'fullName', ''), s.emergency_contact_name, 'Unnamed hiker'),
      'age', COALESCE(NULLIF(s.meta->>'age', ''), 'Not provided'),
      'sex', COALESCE(NULLIF(s.meta->>'sex', ''), 'Not provided'),
      'medicalNotes', COALESCE(NULLIF(s.meta->>'medicalNotes', ''), 'None recorded')
    )) || COALESCE(
      (
        SELECT jsonb_agg(jsonb_build_object(
          'name', COALESCE(NULLIF(companion->>'name', ''), 'Companion'),
          'age', COALESCE(NULLIF(companion->>'age', ''), 'Not provided'),
          'sex', COALESCE(NULLIF(companion->>'sex', ''), 'Not provided'),
          'medicalNotes', COALESCE(NULLIF(companion->>'medicalNotes', ''), 'None recorded')
        ))
        FROM jsonb_array_elements(
          CASE
            WHEN jsonb_typeof(s.meta->'companionDetails') = 'array' THEN s.meta->'companionDetails'
            ELSE '[]'::jsonb
          END
        ) companion
      ),
      '[]'::jsonb
    )
  FROM source_rows s
  ORDER BY s.location_name, s.id;
END;
$$;

REVOKE ALL ON FUNCTION public.mdrrmo_daily_booking_directory(date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mdrrmo_daily_booking_directory(date, uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 11: ASSIGNED GUIDE SELF-MANAGEMENT & ROTATION HANDOVER POLICIES
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.guide_can_read_booking(_booking_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.booking_assignments ba
    JOIN public.guides g ON g.id = ba.guide_id
    WHERE ba.booking_id = _booking_id
      AND g.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.guide_can_manage_booking(_booking_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.booking_assignments ba
    JOIN public.guides g ON g.id = ba.guide_id
    WHERE ba.booking_id = _booking_id
      AND g.user_id = auth.uid()
      AND ba.status IN ('pending', 'accepted')
  );
$$;

CREATE OR REPLACE FUNCTION public.guide_can_handover_assignment(
  _booking_id uuid,
  _target_guide_id uuid,
  _location_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.booking_assignments current_assignment
    JOIN public.guides current_guide ON current_guide.id = current_assignment.guide_id
    JOIN public.guides target_guide ON target_guide.id = _target_guide_id
    WHERE current_assignment.booking_id = _booking_id
      AND current_guide.user_id = auth.uid()
      AND current_assignment.status IN ('pending', 'accepted')
      AND target_guide.is_active = true
      AND target_guide.location_id = current_guide.location_id
      AND (_location_id IS NULL OR _location_id = current_guide.location_id)
  );
$$;

REVOKE ALL ON FUNCTION public.guide_can_read_booking(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guide_can_manage_booking(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guide_can_handover_assignment(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.guide_can_read_booking(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.guide_can_manage_booking(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.guide_can_handover_assignment(uuid, uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS bk_assigned_guide_select ON public.bookings;
CREATE POLICY bk_assigned_guide_select ON public.bookings
  FOR SELECT TO authenticated
  USING (public.guide_can_read_booking(id));

DROP POLICY IF EXISTS bk_assigned_guide_update ON public.bookings;
CREATE POLICY bk_assigned_guide_update ON public.bookings
  FOR UPDATE TO authenticated
  USING (public.guide_can_manage_booking(id))
  WITH CHECK (public.guide_can_manage_booking(id));

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 12: SLOT CAPACITY PERMISSION FOR ANON & ACCOUNT SYNC
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'get_booking_slot_capacity'
  ) THEN
    GRANT EXECUTE ON FUNCTION public.get_booking_slot_capacity(date, date) TO anon, authenticated, service_role;
  END IF;
END $$;

DO $$
DECLARE
  v_central_id uuid;
BEGIN
  SELECT id INTO v_central_id
  FROM auth.users
  WHERE lower(email) = 'central@kalisungan.ph'
  LIMIT 1;

  IF v_central_id IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (v_central_id, 'super_admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 13: OFFICIAL PUBLISHED ROUTES FOR LAMOT 1 & STO. TOMAS (PRESERVING LAMOT 2)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_loc_lamot1 uuid;
  v_loc_stotomas uuid;
BEGIN
  -- Resolve Location IDs
  SELECT id INTO v_loc_lamot1
  FROM public.locations
  WHERE slug = 'lamot-1' OR slug = 'loc-lamot-1' OR lower(name) LIKE '%lamot 1%'
  LIMIT 1;

  SELECT id INTO v_loc_stotomas
  FROM public.locations
  WHERE slug = 'sto-tomas' OR slug = 'loc-sto-tomas' OR lower(name) LIKE '%tomas%'
  LIMIT 1;

  -- 1. Sitio Lamot 1: Publish Official Route
  IF v_loc_lamot1 IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.trail_zones
      WHERE location_id = v_loc_lamot1
        AND is_official = true
        AND status = 'active'
    ) THEN
      INSERT INTO public.trail_zones (
        location_id,
        name,
        description,
        difficulty,
        elevation_meters,
        max_capacity,
        status,
        is_official,
        review_status,
        source,
        coordinates_json,
        recording_metadata
      ) VALUES (
        v_loc_lamot1,
        'Lamot 1 Classic Summit Trail',
        'Official trail starting at Sitio Lamot 1 Jump-Off Terminal ascending through northern pine ridges and bamboo canopy to the 629m summit.',
        'moderate',
        629,
        50,
        'active',
        true,
        'approved',
        'official_mapping',
        '[
          {"lat": 14.1475, "lng": 121.3390},
          {"lat": 14.1472, "lng": 121.3402},
          {"lat": 14.1469, "lng": 121.3414},
          {"lat": 14.1471, "lng": 121.3425},
          {"lat": 14.1476, "lng": 121.3436},
          {"lat": 14.1482, "lng": 121.3445},
          {"lat": 14.1489, "lng": 121.3453},
          {"lat": 14.1495, "lng": 121.3462}
        ]'::jsonb,
        '{
          "stationNames": [
            "Sitio Lamot 1 Jump-Off (0 km)",
            "Station 1: Mango Orchard (0.5 km)",
            "Station 2: Bamboo Canopy (1.0 km)",
            "Station 3: North Ridge Marker (1.6 km)",
            "Station 4: Pine Forest View (2.1 km)",
            "Station 5: Upper North Junction (2.5 km)",
            "Peak: Mt. Kalisungan Summit (629m)"
          ],
          "stations": [
            {"id": "jump-off", "index": 1, "kind": "jump_off", "name": "Sitio Lamot 1 Jump-Off (0 km)", "lat": 14.1475, "lng": 121.3390, "distanceKm": 0},
            {"id": "station-1", "index": 2, "kind": "station", "name": "Station 1: Mango Orchard", "lat": 14.1472, "lng": 121.3402, "distanceKm": 0.5},
            {"id": "station-2", "index": 3, "kind": "station", "name": "Station 2: Bamboo Canopy", "lat": 14.1469, "lng": 121.3414, "distanceKm": 1.0},
            {"id": "station-3", "index": 4, "kind": "station", "name": "Station 3: North Ridge Marker", "lat": 14.1471, "lng": 121.3425, "distanceKm": 1.6},
            {"id": "station-4", "index": 5, "kind": "station", "name": "Station 4: Pine Forest View", "lat": 14.1476, "lng": 121.3436, "distanceKm": 2.1},
            {"id": "station-5", "index": 6, "kind": "station", "name": "Station 5: Upper North Junction", "lat": 14.1482, "lng": 121.3445, "distanceKm": 2.5},
            {"id": "peak", "index": 7, "kind": "peak", "name": "Mt. Kalisungan Summit (629m)", "lat": 14.1495, "lng": 121.3462, "distanceKm": 2.8}
          ]
        }'::jsonb
      );
    END IF;
  END IF;

  -- 2. Brgy. Sto. Tomas: Publish Official Route
  IF v_loc_stotomas IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.trail_zones
      WHERE location_id = v_loc_stotomas
        AND is_official = true
        AND status = 'active'
    ) THEN
      INSERT INTO public.trail_zones (
        location_id,
        name,
        description,
        difficulty,
        elevation_meters,
        max_capacity,
        status,
        is_official,
        review_status,
        source,
        coordinates_json,
        recording_metadata
      ) VALUES (
        v_loc_stotomas,
        'Sto. Tomas Southern Traverse Trail',
        'Official cross-country trail starting at Brgy. Sto. Tomas Jump-Off traversing southern coconut groves, rocky streams, and grasslands to Mt. Kalisungan summit.',
        'hard',
        629,
        40,
        'active',
        true,
        'approved',
        'official_mapping',
        '[
          {"lat": 14.1350, "lng": 121.3500},
          {"lat": 14.1368, "lng": 121.3492},
          {"lat": 14.1388, "lng": 121.3483},
          {"lat": 14.1408, "lng": 121.3475},
          {"lat": 14.1428, "lng": 121.3468},
          {"lat": 14.1448, "lng": 121.3465},
          {"lat": 14.1468, "lng": 121.3463},
          {"lat": 14.1485, "lng": 121.3462},
          {"lat": 14.1495, "lng": 121.3462}
        ]'::jsonb,
        '{
          "stationNames": [
            "Brgy. Sto. Tomas Jump-Off (0 km)",
            "Station 1: South Coconut Grove (0.7 km)",
            "Station 2: Rocky Stream Crossing (1.4 km)",
            "Station 3: Mahogany Forest Clearing (2.1 km)",
            "Station 4: South Ridge Rest Post (2.7 km)",
            "Station 5: Grassland Saddle Camp (3.3 km)",
            "Peak: Mt. Kalisungan Summit (629m)"
          ],
          "stations": [
            {"id": "jump-off", "index": 1, "kind": "jump_off", "name": "Brgy. Sto. Tomas Jump-Off (0 km)", "lat": 14.1350, "lng": 121.3500, "distanceKm": 0},
            {"id": "station-1", "index": 2, "kind": "station", "name": "Station 1: South Coconut Grove", "lat": 14.1368, "lng": 121.3492, "distanceKm": 0.7},
            {"id": "station-2", "index": 3, "kind": "station", "name": "Station 2: Rocky Stream Crossing", "lat": 14.1388, "lng": 121.3483, "distanceKm": 1.4},
            {"id": "station-3", "index": 4, "kind": "station", "name": "Station 3: Mahogany Forest Clearing", "lat": 14.1408, "lng": 121.3475, "distanceKm": 2.1},
            {"id": "station-4", "index": 5, "kind": "station", "name": "Station 4: South Ridge Rest Post", "lat": 14.1428, "lng": 121.3468, "distanceKm": 2.7},
            {"id": "station-5", "index": 6, "kind": "station", "name": "Station 5: Grassland Saddle Camp", "lat": 14.1448, "lng": 121.3465, "distanceKm": 3.3},
            {"id": "peak", "index": 7, "kind": "peak", "name": "Mt. Kalisungan Summit (629m)", "lat": 14.1495, "lng": 121.3462, "distanceKm": 3.8}
          ]
        }'::jsonb
      );
    END IF;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 14: RELOAD SUPABASE API SCHEMA CACHE
-- ─────────────────────────────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';


