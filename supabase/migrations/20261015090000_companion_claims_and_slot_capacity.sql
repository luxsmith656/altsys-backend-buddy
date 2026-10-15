-- Companion linking and local-trailhead slot capacity.
-- This migration is intentionally additive: existing booking notes and rows remain valid.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS companion_join_code text;

CREATE UNIQUE INDEX IF NOT EXISTS bookings_companion_join_code_key
  ON public.bookings (companion_join_code)
  WHERE companion_join_code IS NOT NULL;

CREATE OR REPLACE FUNCTION public.generate_companion_join_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(NEW.group_size, 1) > 1 AND NULLIF(trim(NEW.companion_join_code), '') IS NULL THEN
    NEW.companion_join_code := upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 10));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bookings_companion_join_code ON public.bookings;
CREATE TRIGGER bookings_companion_join_code
BEFORE INSERT OR UPDATE OF group_size ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.generate_companion_join_code();

UPDATE public.bookings
SET companion_join_code = upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 10))
WHERE COALESCE(group_size, 1) > 1
  AND NULLIF(trim(companion_join_code), '') IS NULL;

CREATE TABLE IF NOT EXISTS public.booking_companion_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  companion_index integer NOT NULL CHECK (companion_index >= 0),
  companion_name text NOT NULL,
  claimed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  claimed_device_id text,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (booking_id, companion_index)
);
ALTER TABLE public.booking_companion_claims ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS booking_companion_claims_booking_idx
  ON public.booking_companion_claims(booking_id);

CREATE OR REPLACE FUNCTION public.booking_companion_names(p_booking_id uuid)
RETURNS TABLE (companion_index integer, companion_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH source AS (
    SELECT public.safe_booking_meta(b.notes) AS meta
    FROM public.bookings b
    WHERE b.id = p_booking_id
  ), detailed AS (
    SELECT (row_number() OVER () - 1)::integer AS companion_index,
           NULLIF(trim(value->>'name'), '') AS companion_name
    FROM source, jsonb_array_elements(
      CASE WHEN jsonb_typeof(source.meta->'companionDetails') = 'array'
        THEN source.meta->'companionDetails' ELSE '[]'::jsonb END
    ) value
  ), simple AS (
    SELECT (row_number() OVER () - 1)::integer AS companion_index,
           NULLIF(trim(value), '') AS companion_name
    FROM source, jsonb_array_elements_text(
      CASE WHEN jsonb_typeof(source.meta->'companions') = 'array'
        THEN source.meta->'companions' ELSE '[]'::jsonb END
    ) value
  )
  SELECT companion_index, companion_name FROM detailed WHERE companion_name IS NOT NULL
  UNION ALL
  SELECT companion_index, companion_name FROM simple
  WHERE NOT EXISTS (SELECT 1 FROM detailed WHERE companion_name IS NOT NULL)
  ORDER BY companion_index;
$$;

CREATE OR REPLACE FUNCTION public.get_booking_companion_options(p_join_code text)
RETURNS TABLE (
  booking_id uuid,
  booking_date date,
  group_size integer,
  companion_index integer,
  companion_name text,
  claimed boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT b.id, b.booking_date, b.group_size, names.companion_index,
         names.companion_name, claims.id IS NOT NULL
  FROM public.bookings b
  JOIN LATERAL public.booking_companion_names(b.id) names ON true
  LEFT JOIN public.booking_companion_claims claims
    ON claims.booking_id = b.id AND claims.companion_index = names.companion_index
  WHERE b.companion_join_code = upper(trim(p_join_code))
    AND b.group_size > 1
    AND b.status IN ('pending', 'confirmed', 'accepted', 'checked_in', 'in_progress', 'active');
$$;

CREATE OR REPLACE FUNCTION public.claim_booking_companion(
  p_join_code text,
  p_companion_index integer,
  p_device_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b public.bookings%ROWTYPE;
  name_row record;
  existing public.booking_companion_claims%ROWTYPE;
  claimant uuid := auth.uid();
BEGIN
  IF NULLIF(trim(p_join_code), '') IS NULL OR p_companion_index IS NULL OR NULLIF(trim(p_device_id), '') IS NULL THEN
    RAISE EXCEPTION 'A valid companion link and companion selection are required' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO b FROM public.bookings
  WHERE companion_join_code = upper(trim(p_join_code))
    AND group_size > 1
    AND status IN ('pending', 'confirmed', 'accepted', 'checked_in', 'in_progress', 'active')
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'This companion link is invalid, expired, or no longer active'; END IF;
  SELECT * INTO name_row FROM public.booking_companion_names(b.id)
  WHERE companion_index = p_companion_index;
  IF NOT FOUND THEN RAISE EXCEPTION 'Choose a companion name from this booking'; END IF;
  SELECT * INTO existing FROM public.booking_companion_claims
  WHERE booking_id = b.id AND companion_index = p_companion_index FOR UPDATE;
  IF FOUND THEN
    IF existing.claimed_device_id = p_device_id OR (claimant IS NOT NULL AND existing.claimed_by = claimant) THEN
      RETURN jsonb_build_object('bookingId', b.id, 'companionIndex', existing.companion_index, 'companionName', existing.companion_name, 'alreadyClaimedByThisDevice', true);
    END IF;
    RAISE EXCEPTION 'That companion has already been claimed on another device';
  END IF;
  INSERT INTO public.booking_companion_claims (booking_id, companion_index, companion_name, claimed_by, claimed_device_id)
  VALUES (b.id, p_companion_index, name_row.companion_name, claimant, p_device_id);
  RETURN jsonb_build_object('bookingId', b.id, 'companionIndex', p_companion_index, 'companionName', name_row.companion_name, 'alreadyClaimedByThisDevice', false);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_booking_companion_options(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_booking_companion(text, integer, text) TO anon, authenticated;

CREATE TABLE IF NOT EXISTS public.trailhead_slot_capacity_settings (
  location_id uuid PRIMARY KEY REFERENCES public.locations(id) ON DELETE CASCADE,
  max_groups integer NOT NULL DEFAULT 1 CHECK (max_groups >= 1 AND max_groups <= 50),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.trailhead_slot_capacity_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Central admins can view slot capacity settings"
  ON public.trailhead_slot_capacity_settings FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));

CREATE TABLE IF NOT EXISTS public.trailhead_slot_capacity_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  old_max_groups integer,
  new_max_groups integer NOT NULL,
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.trailhead_slot_capacity_audit ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS trailhead_slot_capacity_audit_location_time_idx
  ON public.trailhead_slot_capacity_audit(location_id, changed_at DESC);
CREATE POLICY "Central admins can view slot capacity audit"
  ON public.trailhead_slot_capacity_audit FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));

CREATE OR REPLACE FUNCTION public.enforce_booking_start_capacity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_meta jsonb;
  v_time text;
  v_max_groups integer;
  v_same_start integer;
  v_type text;
  v_hour integer;
  v_duration integer;
  v_peak_hour integer;
  v_peak_groups integer;
BEGIN
  v_meta := public.safe_booking_meta(NEW.notes);
  v_time := upper(regexp_replace(trim(coalesce(v_meta->>'hikeTime', '')), '\s+', ' ', 'g'));
  IF NEW.status NOT IN ('pending', 'confirmed', 'accepted', 'active', 'adjustment_pending') OR v_time = '' THEN RETURN NEW; END IF;
  IF v_time !~ '^(0?[1-9]|1[0-2]):00 (AM|PM)$' THEN
    RAISE EXCEPTION 'Start time must use a one-hour interval (for example 06:00 AM).';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('kalisungan-booking:' || coalesce(NEW.location_id::text, 'all') || ':' || NEW.booking_date::text || ':' || v_time, 0));
  SELECT COALESCE((SELECT max_groups FROM public.trailhead_slot_capacity_settings WHERE location_id IS NOT DISTINCT FROM NEW.location_id), 1)
    INTO v_max_groups;
  SELECT count(*) INTO v_same_start
  FROM public.bookings b
  WHERE b.id IS DISTINCT FROM NEW.id
    AND b.location_id IS NOT DISTINCT FROM NEW.location_id
    AND b.booking_date = NEW.booking_date
    AND b.status IN ('pending', 'confirmed', 'accepted', 'active', 'adjustment_pending')
    AND upper(regexp_replace(trim(coalesce(public.safe_booking_meta(b.notes)->>'hikeTime', '')), '\s+', ' ', 'g')) = v_time;
  IF v_same_start >= v_max_groups THEN
    RAISE EXCEPTION 'This trailhead time slot is full. Choose another available one-hour slot.' USING ERRCODE = 'P0001';
  END IF;

  -- Preserve the existing mountain-wide summit-arrival guard in addition to
  -- the local trailhead slot limit.
  v_type := lower(coalesce(v_meta->>'hikeType', 'morning'));
  v_hour := split_part(v_time, ':', 1)::integer;
  IF right(v_time, 2) = 'PM' AND v_hour < 12 THEN v_hour := v_hour + 12; END IF;
  IF right(v_time, 2) = 'AM' AND v_hour = 12 THEN v_hour := 0; END IF;
  v_duration := CASE v_type WHEN 'overnight' THEN 5 WHEN 'night' THEN 3 ELSE 4 END;
  v_peak_hour := floor(mod(v_hour + v_duration, 24) / 6);
  SELECT count(*) INTO v_peak_groups
  FROM public.bookings b
  CROSS JOIN LATERAL (SELECT public.safe_booking_meta(b.notes) AS meta) parsed
  WHERE b.id IS DISTINCT FROM NEW.id
    AND b.booking_date = NEW.booking_date
    AND b.status IN ('pending', 'confirmed', 'accepted', 'active', 'adjustment_pending')
    AND (parsed.meta->>'hikeTime') ~ '^(0?[1-9]|1[0-2]):00 (AM|PM)$'
    AND mod(
      CASE WHEN right(upper(parsed.meta->>'hikeTime'), 2) = 'PM'
        THEN (split_part(parsed.meta->>'hikeTime', ':', 1)::integer % 12) + 12
        ELSE split_part(parsed.meta->>'hikeTime', ':', 1)::integer % 12 END
      + CASE lower(coalesce(parsed.meta->>'hikeType', 'morning'))
          WHEN 'overnight' THEN 5 WHEN 'night' THEN 3 ELSE 4 END,
      24
    ) / 6 = v_peak_hour;
  IF v_peak_groups >= 5 THEN
    RAISE EXCEPTION 'The summit arrival window already has five active groups. Choose another available start time.' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_booking_start_capacity ON public.bookings;
CREATE TRIGGER trg_enforce_booking_start_capacity
BEFORE INSERT OR UPDATE OF booking_date, notes, status, location_id ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.enforce_booking_start_capacity();

CREATE OR REPLACE FUNCTION public.set_trailhead_slot_capacity(p_location_id uuid, p_max_groups integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  old_value integer;
  actor uuid := auth.uid();
BEGIN
  IF actor IS NULL OR NOT public.has_role(actor, 'super_admin'::public.app_role) THEN RAISE EXCEPTION 'Only Central Admin may change slot capacity' USING ERRCODE = '42501'; END IF;
  IF p_location_id IS NULL OR p_max_groups IS NULL OR p_max_groups < 1 OR p_max_groups > 50 THEN RAISE EXCEPTION 'Capacity must be between 1 and 50 groups'; END IF;
  SELECT max_groups INTO old_value FROM public.trailhead_slot_capacity_settings WHERE location_id = p_location_id;
  INSERT INTO public.trailhead_slot_capacity_settings(location_id, max_groups, updated_by)
  VALUES (p_location_id, p_max_groups, actor)
  ON CONFLICT (location_id) DO UPDATE SET max_groups = excluded.max_groups, updated_by = excluded.updated_by, updated_at = now();
  IF old_value IS DISTINCT FROM p_max_groups THEN
    INSERT INTO public.trailhead_slot_capacity_audit(location_id, old_max_groups, new_max_groups, changed_by)
    VALUES (p_location_id, old_value, p_max_groups, actor);
    INSERT INTO public.app_notifications(user_id, sender_id, type, title, body, category, reference_id, target_type, target_id, link, route, read, is_read)
    SELECT ur.user_id, actor, 'capacity', 'Booking capacity updated',
      format('The trailhead slot capacity changed from %s to %s groups.', coalesce(old_value, 1), p_max_groups),
      'system', p_location_id, 'location', p_location_id, '/admin', '/admin', false, false
    FROM public.user_roles ur
    WHERE ur.role IN ('admin'::public.app_role, 'super_admin'::public.app_role, 'guide'::public.app_role)
      AND (ur.role IN ('super_admin'::public.app_role, 'guide'::public.app_role)
        OR EXISTS (SELECT 1 FROM public.user_locations ul WHERE ul.user_id = ur.user_id AND ul.location_id = p_location_id));
  END IF;
  RETURN jsonb_build_object('locationId', p_location_id, 'oldMaxGroups', coalesce(old_value, 1), 'maxGroups', p_max_groups);
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_trailhead_slot_capacity(uuid, integer) TO authenticated;
