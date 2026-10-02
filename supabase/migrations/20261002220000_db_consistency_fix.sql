-- ==============================================================================
-- MT. KALISUNGAN: DATABASE CONSISTENCY FIX
-- Run in Supabase SQL Editor. Idempotent — safe to run multiple times.
-- Adds all missing columns so DB matches the TypeScript type definitions.
-- ==============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. BOOKINGS: add contact columns and referral guide FK
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS contact_email text,
  ADD COLUMN IF NOT EXISTS contact_phone text,
  ADD COLUMN IF NOT EXISTS referral_guide_id uuid REFERENCES public.guides(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_bookings_contact_email ON public.bookings (contact_email);
CREATE INDEX IF NOT EXISTS idx_bookings_referral_guide ON public.bookings (referral_guide_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. GUIDES: add profile, social, and referral code columns
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.guides
  ADD COLUMN IF NOT EXISTS photo_url text,
  ADD COLUMN IF NOT EXISTS facebook_url text,
  ADD COLUMN IF NOT EXISTS sex text,
  ADD COLUMN IF NOT EXISTS age integer,
  ADD COLUMN IF NOT EXISTS referral_code text UNIQUE,
  ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz;

CREATE INDEX IF NOT EXISTS guides_referral_code_idx ON public.guides (referral_code);
CREATE INDEX IF NOT EXISTS guides_onboarding_idx ON public.guides (user_id, onboarding_completed_at);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. PROFILES: add is_active and consent columns
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS mdrrmo_consent_at timestamptz,
  ADD COLUMN IF NOT EXISTS mdrrmo_consent_version text;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. SYSTEM SETTINGS table (dynamic pricing, config)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.system_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "system_settings_public_read" ON public.system_settings;
CREATE POLICY "system_settings_public_read"
  ON public.system_settings FOR SELECT USING (true);

DROP POLICY IF EXISTS "system_settings_admin_write" ON public.system_settings;
CREATE POLICY "system_settings_admin_write"
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
-- 5. GUIDE REVIEWS table
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

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. EMAIL OTP CHALLENGES table
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
-- 7. BOOKING CONFIRMATION EMAILS outbox queue
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.booking_confirmation_emails (
  booking_id uuid PRIMARY KEY REFERENCES public.bookings(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'sent', 'needs_review', 'cancelled')),
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
      first_attempt_at = COALESCE(first_attempt_at, now()),
      lease_until = now() + interval '2 minutes'
  WHERE q.booking_id = _booking_id
    AND q.status IN ('pending', 'processing')
    AND q.next_attempt_at <= now()
    AND (q.lease_until IS NULL OR q.lease_until < now())
    AND EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = q.booking_id AND b.status = 'confirmed')
  RETURNING q.*;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_booking_confirmation_email(uuid) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. BOOKING CAPACITY ENFORCEMENT
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.safe_booking_meta(_notes text)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
BEGIN
  IF _notes IS NULL OR jsonb_typeof(_notes::jsonb) <> 'object' THEN RETURN '{}'::jsonb; END IF;
  RETURN _notes::jsonb;
EXCEPTION WHEN others THEN RETURN '{}'::jsonb;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_booking_slot_capacity(p_start_date date, p_end_date date)
RETURNS TABLE (
  booking_date date,
  hike_time text,
  hike_type text,
  summit_hour int,
  group_count bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    b.booking_date,
    upper(regexp_replace(trim(parsed.meta->>'hikeTime'), '\s+', ' ', 'g')) AS hike_time,
    lower(coalesce(parsed.meta->>'hikeType', 'morning')) AS hike_type,
    mod(
      CASE WHEN right(upper(parsed.meta->>'hikeTime'), 2) = 'PM'
        THEN (split_part(parsed.meta->>'hikeTime', ':', 1)::int % 12) + 12
        ELSE split_part(parsed.meta->>'hikeTime', ':', 1)::int % 12 END
      + CASE lower(coalesce(parsed.meta->>'hikeType', 'morning'))
          WHEN 'overnight' THEN 5 WHEN 'night' THEN 3 ELSE 4 END,
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
      CASE WHEN right(upper(parsed.meta->>'hikeTime'), 2) = 'PM'
        THEN (split_part(parsed.meta->>'hikeTime', ':', 1)::int % 12) + 12
        ELSE split_part(parsed.meta->>'hikeTime', ':', 1)::int % 12 END
      + CASE lower(coalesce(parsed.meta->>'hikeType', 'morning'))
          WHEN 'overnight' THEN 5 WHEN 'night' THEN 3 ELSE 4 END,
      24
    ) / 6;
$$;

REVOKE ALL ON FUNCTION public.get_booking_slot_capacity(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_booking_slot_capacity(date, date) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. MDRRMO EMERGENCY AUDIT LOGS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.mdrrmo_access_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mdrrmo_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  access_type text NOT NULL DEFAULT 'directory_view',
  accessed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.mdrrmo_access_logs ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_mdrrmo_access_logs_accessed_at ON public.mdrrmo_access_logs(accessed_at DESC);
CREATE INDEX IF NOT EXISTS idx_mdrrmo_access_logs_booking_id ON public.mdrrmo_access_logs(booking_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. GUIDE ASSIGNMENT SELF-MANAGEMENT POLICIES
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.guide_can_read_booking(_booking_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.booking_assignments ba
    JOIN public.guides g ON g.id = ba.guide_id
    WHERE ba.booking_id = _booking_id AND g.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.guide_can_manage_booking(_booking_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.booking_assignments ba
    JOIN public.guides g ON g.id = ba.guide_id
    WHERE ba.booking_id = _booking_id AND g.user_id = auth.uid()
      AND ba.status IN ('pending', 'accepted')
  );
$$;

CREATE OR REPLACE FUNCTION public.guide_can_handover_assignment(
  _booking_id uuid, _target_guide_id uuid, _location_id uuid
)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.booking_assignments ca
    JOIN public.guides cg ON cg.id = ca.guide_id
    JOIN public.guides tg ON tg.id = _target_guide_id
    WHERE ca.booking_id = _booking_id AND cg.user_id = auth.uid()
      AND ca.status IN ('pending', 'accepted')
      AND tg.is_active = true
      AND tg.location_id = cg.location_id
      AND (_location_id IS NULL OR _location_id = cg.location_id)
  );
$$;

GRANT EXECUTE ON FUNCTION public.guide_can_read_booking(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.guide_can_manage_booking(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.guide_can_handover_assignment(uuid, uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS bk_assigned_guide_select ON public.bookings;
CREATE POLICY bk_assigned_guide_select ON public.bookings
  FOR SELECT TO authenticated USING (public.guide_can_read_booking(id));

DROP POLICY IF EXISTS bk_assigned_guide_update ON public.bookings;
CREATE POLICY bk_assigned_guide_update ON public.bookings
  FOR UPDATE TO authenticated
  USING (public.guide_can_manage_booking(id))
  WITH CHECK (public.guide_can_manage_booking(id));

-- ─────────────────────────────────────────────────────────────────────────────
-- 11. RELOAD SCHEMA CACHE
-- ─────────────────────────────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
