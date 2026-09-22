-- Shared Mount Kalisungan booking capacity.
-- A start time is one-hour aligned and unique for the whole mountain. The
-- summit arrival window allows at most five active groups across all routes.
-- The six-hour window is deliberately conservative for slow/fast groups.
-- This is enforced in the database to protect against concurrent submissions.

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

  -- Keep legacy rows readable, but require the new metadata whenever a caller
  -- supplies a start time. New app bookings always include it.
  IF v_time = '' THEN
    RETURN NEW;
  END IF;
  IF v_time !~ '^(0?[1-9]|1[0-2]):00 (AM|PM)$' THEN
    RAISE EXCEPTION 'Start time must use a one-hour interval (for example 06:00 AM).';
  END IF;

  v_hour := split_part(v_time, ':', 1)::int;
  IF right(v_time, 2) = 'PM' AND v_hour < 12 THEN v_hour := v_hour + 12; END IF;
  IF right(v_time, 2) = 'AM' AND v_hour = 12 THEN v_hour := 0; END IF;

  v_type := lower(coalesce(v_meta->>'hikeType', 'morning'));
  v_duration := CASE v_type WHEN 'overnight' THEN 5 WHEN 'night' THEN 3 ELSE 4 END;
  v_peak_hour := floor(mod(v_hour + v_duration, 24) / 6);

  -- Serialize checks for a date so two concurrent submissions cannot both pass.
  PERFORM pg_advisory_xact_lock(hashtextextended('kalisungan-booking:' || NEW.booking_date::text, 0));

  SELECT count(*)
  INTO v_same_start
  FROM public.bookings b
  WHERE b.id IS DISTINCT FROM NEW.id
    AND b.booking_date = NEW.booking_date
    AND b.status IN ('pending', 'confirmed', 'accepted', 'active', 'adjustment_pending')
    AND upper(regexp_replace(trim(coalesce(public.safe_booking_meta(b.notes)->>'hikeTime', '')), '\s+', ' ', 'g')) = v_time;

  IF v_same_start > 0 THEN
    RAISE EXCEPTION 'That start time is already reserved. Choose the next available one-hour slot.';
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

-- Hikers must not receive another hiker's booking rows through RLS just to
-- render availability. This aggregate exposes only slot counts and no PII.
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
