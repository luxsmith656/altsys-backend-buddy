-- Complete the day/night carrying-capacity fields already used by the admin UI.
ALTER TABLE public.announcements
  ADD COLUMN IF NOT EXISTS source text;

ALTER TABLE public.daily_capacity
  ADD COLUMN IF NOT EXISTS day_max_capacity integer,
  ADD COLUMN IF NOT EXISTS night_max_capacity integer,
  ADD COLUMN IF NOT EXISTS day_current_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS night_current_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.daily_capacity
  DROP CONSTRAINT IF EXISTS daily_capacity_day_max_nonnegative,
  ADD CONSTRAINT daily_capacity_day_max_nonnegative
    CHECK (day_max_capacity IS NULL OR day_max_capacity >= 0),
  DROP CONSTRAINT IF EXISTS daily_capacity_night_max_nonnegative,
  ADD CONSTRAINT daily_capacity_night_max_nonnegative
    CHECK (night_max_capacity IS NULL OR night_max_capacity >= 0),
  DROP CONSTRAINT IF EXISTS daily_capacity_day_night_within_total,
  ADD CONSTRAINT daily_capacity_day_night_within_total
    CHECK (
      day_max_capacity IS NULL OR night_max_capacity IS NULL
      OR day_max_capacity + night_max_capacity <= max_capacity
    );

-- PostgreSQL's ordinary UNIQUE(location_id, date) permits duplicate rows when
-- location_id is NULL. Central Admin uses NULL for mountain-wide limits, so
-- consolidate any legacy duplicates and use NULLS NOT DISTINCT for upserts.
WITH global_limits AS (
  SELECT
    date,
    min(id::text)::uuid AS keep_id,
    max(max_capacity) AS max_capacity,
    max(day_max_capacity) AS day_max_capacity,
    max(night_max_capacity) AS night_max_capacity
  FROM public.daily_capacity
  WHERE location_id IS NULL
  GROUP BY date
  HAVING count(*) > 1
)
UPDATE public.daily_capacity dc
SET
  max_capacity = limits.max_capacity,
  day_max_capacity = limits.day_max_capacity,
  night_max_capacity = limits.night_max_capacity
FROM global_limits limits
WHERE dc.id = limits.keep_id;

WITH global_limits AS (
  SELECT date, min(id::text)::uuid AS keep_id
  FROM public.daily_capacity
  WHERE location_id IS NULL
  GROUP BY date
  HAVING count(*) > 1
)
DELETE FROM public.daily_capacity dc
USING global_limits limits
WHERE dc.location_id IS NULL
  AND dc.date = limits.date
  AND dc.id <> limits.keep_id;

ALTER TABLE public.daily_capacity
  DROP CONSTRAINT IF EXISTS daily_capacity_location_id_date_key;
CREATE UNIQUE INDEX IF NOT EXISTS daily_capacity_location_date_nullsafe_key
  ON public.daily_capacity (location_id, date) NULLS NOT DISTINCT;

-- Reconcile stored counters from active reservations so the calendar and
-- carrying-capacity guard start from the same booking records.
WITH booking_counts AS (
  SELECT
    b.booking_date AS date,
    b.location_id,
    sum(CASE
      WHEN lower(coalesce(meta.value->>'hikeType', 'morning')) IN ('night', 'overnight') THEN 0
      ELSE b.group_size
    END)::integer AS day_count,
    sum(CASE
      WHEN lower(coalesce(meta.value->>'hikeType', 'morning')) IN ('night', 'overnight') THEN b.group_size
      ELSE 0
    END)::integer AS night_count
  FROM public.bookings b
  CROSS JOIN LATERAL (SELECT public.safe_booking_meta(b.notes) AS value) meta
  WHERE b.status IN ('pending', 'confirmed', 'accepted', 'active', 'adjustment_pending')
  GROUP BY b.booking_date, b.location_id
), capacity_counts AS (
  SELECT
    dc.id,
    coalesce(sum(bc.day_count), 0)::integer AS day_count,
    coalesce(sum(bc.night_count), 0)::integer AS night_count
  FROM public.daily_capacity dc
  LEFT JOIN booking_counts bc
    ON bc.date = dc.date
    AND (dc.location_id IS NULL OR bc.location_id = dc.location_id)
  GROUP BY dc.id
)
UPDATE public.daily_capacity dc
SET
  day_current_count = counts.day_count,
  night_current_count = counts.night_count,
  current_count = counts.day_count + counts.night_count
FROM capacity_counts counts
WHERE counts.id = dc.id;

CREATE OR REPLACE FUNCTION public.adjust_daily_capacity_for_booking(
  p_location_id uuid,
  p_booking_date date,
  p_group_size integer,
  p_hike_type text,
  p_delta integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_location_id IS NULL OR p_booking_date IS NULL OR p_group_size IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.daily_capacity (
    location_id, date, max_capacity, day_max_capacity, night_max_capacity
  ) VALUES (p_location_id, p_booking_date, 100, 65, 35)
  ON CONFLICT (location_id, date) DO NOTHING;

  UPDATE public.daily_capacity
  SET
    current_count = greatest(0, current_count + p_delta * p_group_size),
    day_current_count = greatest(0, day_current_count + CASE
      WHEN lower(coalesce(p_hike_type, 'morning')) IN ('night', 'overnight') THEN 0
      ELSE p_delta * p_group_size
    END),
    night_current_count = greatest(0, night_current_count + CASE
      WHEN lower(coalesce(p_hike_type, 'morning')) IN ('night', 'overnight') THEN p_delta * p_group_size
      ELSE 0
    END)
  WHERE location_id = p_location_id AND date = p_booking_date;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_daily_capacity_from_booking()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_holding boolean := false;
  v_new_holding boolean := false;
  v_old_meta jsonb;
  v_new_meta jsonb;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    v_old_holding := OLD.status IN ('pending', 'confirmed', 'accepted', 'active', 'adjustment_pending');
    IF v_old_holding THEN
      v_old_meta := public.safe_booking_meta(OLD.notes);
      PERFORM public.adjust_daily_capacity_for_booking(
        OLD.location_id, OLD.booking_date, OLD.group_size,
        coalesce(v_old_meta->>'hikeType', 'morning'), -1
      );
    END IF;
  END IF;

  IF TG_OP <> 'DELETE' THEN
    v_new_holding := NEW.status IN ('pending', 'confirmed', 'accepted', 'active', 'adjustment_pending');
    IF v_new_holding THEN
      v_new_meta := public.safe_booking_meta(NEW.notes);
      PERFORM public.adjust_daily_capacity_for_booking(
        NEW.location_id, NEW.booking_date, NEW.group_size,
        coalesce(v_new_meta->>'hikeType', 'morning'), 1
      );
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_daily_capacity_from_booking ON public.bookings;
CREATE TRIGGER trg_sync_daily_capacity_from_booking
AFTER INSERT OR UPDATE OF status, booking_date, group_size, location_id, notes OR DELETE
ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.sync_daily_capacity_from_booking();

REVOKE ALL ON FUNCTION public.adjust_daily_capacity_for_booking(uuid, date, integer, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_daily_capacity_from_booking() FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
