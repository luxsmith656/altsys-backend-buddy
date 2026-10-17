-- Central booking capacity and hike schedule control.
-- This supersedes the earlier hard-coded start-time guard without deleting or
-- moving existing bookings. Existing rows are flagged when a new rule would
-- make them invalid, and remain visible to staff for review.

CREATE TABLE IF NOT EXISTS public.booking_capacity_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  capacity_mode text NOT NULL DEFAULT 'shared'
    CHECK (capacity_mode IN ('shared', 'per_trailhead')),
  shared_max_groups integer NOT NULL DEFAULT 3
    CHECK (shared_max_groups BETWEEN 1 AND 50),
  max_people_per_group integer NOT NULL DEFAULT 30
    CHECK (max_people_per_group BETWEEN 1 AND 500),
  max_people_per_slot integer
    CHECK (max_people_per_slot IS NULL OR max_people_per_slot BETWEEN 1 AND 5000),
  hold_pending boolean NOT NULL DEFAULT false,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.booking_capacity_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.booking_capacity_trailhead_overrides (
  location_id uuid PRIMARY KEY REFERENCES public.locations(id) ON DELETE CASCADE,
  max_groups integer NOT NULL DEFAULT 3 CHECK (max_groups BETWEEN 1 AND 50),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.booking_schedule_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid REFERENCES public.locations(id) ON DELETE CASCADE,
  schedule jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS booking_schedule_settings_global_key
  ON public.booking_schedule_settings (location_id) NULLS NOT DISTINCT;

CREATE TABLE IF NOT EXISTS public.booking_capacity_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  old_config jsonb NOT NULL,
  new_config jsonb NOT NULL,
  flagged_booking_count integer NOT NULL DEFAULT 0,
  flagged_summary jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS capacity_status text NOT NULL DEFAULT 'ok',
  ADD COLUMN IF NOT EXISTS capacity_flag_reason text,
  ADD COLUMN IF NOT EXISTS capacity_flagged_at timestamptz;

ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_capacity_status_check;
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_capacity_status_check
  CHECK (capacity_status IN ('ok', 'flagged'));

CREATE INDEX IF NOT EXISTS bookings_capacity_status_idx
  ON public.bookings (capacity_status, booking_date);

ALTER TABLE public.booking_capacity_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_capacity_trailhead_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_schedule_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_capacity_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS booking_capacity_settings_read ON public.booking_capacity_settings;
CREATE POLICY booking_capacity_settings_read ON public.booking_capacity_settings
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS booking_capacity_trailhead_read ON public.booking_capacity_trailhead_overrides;
CREATE POLICY booking_capacity_trailhead_read ON public.booking_capacity_trailhead_overrides
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS booking_schedule_settings_read ON public.booking_schedule_settings;
CREATE POLICY booking_schedule_settings_read ON public.booking_schedule_settings
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS booking_capacity_audit_central_read ON public.booking_capacity_audit;
CREATE POLICY booking_capacity_audit_central_read ON public.booking_capacity_audit
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));

-- The public booking form needs a schedule even when the locations table is
-- still being provisioned. This is the existing published schedule.
INSERT INTO public.booking_schedule_settings (id, location_id, schedule)
VALUES (
  gen_random_uuid(),
  NULL,
  jsonb_build_object(
    'mode', 'interval',
    'intervalMinutes', 60,
    'windows', jsonb_build_object(
      'morning', jsonb_build_object('start', '02:00 AM', 'end', '10:00 AM'),
      'night', jsonb_build_object('start', '02:00 PM', 'end', '04:00 PM'),
      'overnight', jsonb_build_object('start', '02:00 PM', 'end', '04:00 PM')
    ),
    'slots', jsonb_build_object(
      'morning', jsonb_build_array('02:00 AM', '03:00 AM', '04:00 AM', '05:00 AM', '06:00 AM', '07:00 AM', '08:00 AM', '09:00 AM', '10:00 AM'),
      'night', jsonb_build_array('02:00 PM', '03:00 PM', '04:00 PM'),
      'overnight', jsonb_build_array('02:00 PM', '03:00 PM', '04:00 PM')
    )
  )
)
  ON CONFLICT (location_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.booking_normalize_time(p_time text)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  SELECT upper(regexp_replace(trim(coalesce(p_time, '')), '\s+', ' ', 'g'));
$$;

CREATE OR REPLACE FUNCTION public.booking_effective_date(p_booking public.bookings)
RETURNS date
LANGUAGE sql STABLE
AS $$
  SELECT CASE
    WHEN p_booking.status = 'adjustment_pending' AND p_booking.requested_new_date IS NOT NULL
      THEN p_booking.requested_new_date
    ELSE p_booking.booking_date
  END;
$$;

CREATE OR REPLACE FUNCTION public.booking_effective_meta(p_booking public.bookings)
RETURNS jsonb
LANGUAGE plpgsql STABLE
SET search_path = public
AS $$
DECLARE
  meta jsonb := '{}'::jsonb;
BEGIN
  BEGIN
    meta := COALESCE(NULLIF(p_booking.notes, '')::jsonb, '{}'::jsonb);
    IF jsonb_typeof(meta) <> 'object' THEN meta := '{}'::jsonb; END IF;
  EXCEPTION WHEN others THEN
    meta := '{}'::jsonb;
  END;
  IF p_booking.status = 'adjustment_pending' AND NULLIF(meta->>'adjustedDate', '') IS NOT NULL THEN
    meta := meta || jsonb_build_object('effectiveDate', meta->>'adjustedDate');
  ELSIF p_booking.status = 'adjustment_pending' AND p_booking.requested_new_date IS NOT NULL THEN
    meta := meta || jsonb_build_object('effectiveDate', p_booking.requested_new_date::text);
  ELSE
    meta := meta || jsonb_build_object('effectiveDate', p_booking.booking_date::text);
  END IF;
  meta := meta || jsonb_build_object(
    'effectiveTime', coalesce(nullif(meta->>'adjustedTime', ''), nullif(meta->>'hikeTime', '')),
    'effectiveType', lower(coalesce(nullif(meta->>'hikeType', ''), 'morning'))
  );
  RETURN meta;
END;
$$;

CREATE OR REPLACE FUNCTION public.booking_schedule_for_location(p_location_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT s.schedule FROM public.booking_schedule_settings s WHERE s.location_id = p_location_id),
    (SELECT s.schedule FROM public.booking_schedule_settings s WHERE s.location_id IS NULL),
    '{}'::jsonb
  );
$$;

CREATE OR REPLACE FUNCTION public.booking_slot_is_scheduled(
  p_location_id uuid,
  p_hike_type text,
  p_hike_time text
)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(
      COALESCE(public.booking_schedule_for_location(p_location_id)->'slots'->lower(coalesce(p_hike_type, 'morning')), '[]'::jsonb)
    ) AS item
    WHERE public.booking_normalize_time(item #>> '{}') = public.booking_normalize_time(p_hike_time)
  );
$$;

CREATE OR REPLACE FUNCTION public.booking_capacity_holds(p_status text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_status IN ('confirmed', 'accepted', 'active', 'adjustment_pending')
    OR (p_status = 'pending' AND coalesce((SELECT hold_pending FROM public.booking_capacity_settings WHERE id = 1), false));
$$;

CREATE OR REPLACE FUNCTION public.booking_capacity_group_limit(p_location_id uuid)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN s.capacity_mode = 'per_trailhead'
      THEN coalesce(o.max_groups, s.shared_max_groups)
    ELSE s.shared_max_groups
  END
  FROM public.booking_capacity_settings s
  LEFT JOIN public.booking_capacity_trailhead_overrides o ON o.location_id = p_location_id
  WHERE s.id = 1;
$$;

CREATE OR REPLACE FUNCTION public.booking_capacity_issue(p_booking public.bookings, p_ignore_id uuid DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  settings public.booking_capacity_settings%ROWTYPE;
  meta jsonb := public.booking_effective_meta(p_booking);
  target_date date := NULLIF(meta->>'effectiveDate', '')::date;
  target_time text := public.booking_normalize_time(meta->>'effectiveTime');
  target_type text := lower(coalesce(meta->>'effectiveType', 'morning'));
  max_groups integer;
  max_people_group integer;
  max_people_slot integer;
  used_groups integer;
  used_people integer;
  daily_max integer;
  daily_people integer;
  schedule jsonb;
BEGIN
  SELECT * INTO settings FROM public.booking_capacity_settings WHERE id = 1;
  IF NOT FOUND THEN RETURN 'Capacity control is not configured.'; END IF;
  IF p_booking.group_size < 1 OR p_booking.group_size > settings.max_people_per_group THEN
    RETURN format('Group size %s exceeds the configured maximum of %s people.', p_booking.group_size, settings.max_people_per_group);
  END IF;
  IF target_date IS NULL OR target_time IS NULL OR target_time = '' THEN
    RETURN 'A scheduled hike date and start time are required.';
  END IF;
  IF target_time !~ '^(0?[1-9]|1[0-2]):[0-5][0-9] (AM|PM)$' THEN
    RETURN 'Start time is not a valid 12-hour time.';
  END IF;
  IF NOT public.booking_slot_is_scheduled(p_booking.location_id, target_type, target_time) THEN
    RETURN format('%s is no longer in the published %s schedule.', target_time, target_type);
  END IF;

  max_groups := public.booking_capacity_group_limit(p_booking.location_id);
  max_people_group := settings.max_people_per_group;
  max_people_slot := settings.max_people_per_slot;
  schedule := public.booking_schedule_for_location(p_booking.location_id);

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'kalisungan-capacity:' ||
    CASE WHEN settings.capacity_mode = 'shared' THEN 'shared' ELSE coalesce(p_booking.location_id::text, 'none') END ||
    ':' || target_date::text || ':' || target_time, 0));

  SELECT count(*)::integer, coalesce(sum(b.group_size), 0)::integer
  INTO used_groups, used_people
  FROM public.bookings b
  CROSS JOIN LATERAL public.booking_effective_meta(b) other_meta
  WHERE b.id IS DISTINCT FROM coalesce(p_ignore_id, p_booking.id)
    AND public.booking_capacity_holds(b.status)
    AND public.booking_effective_date(b) = target_date
    AND public.booking_normalize_time(other_meta->>'effectiveTime') = target_time
    AND (settings.capacity_mode = 'shared' OR b.location_id IS NOT DISTINCT FROM p_booking.location_id);

  IF used_groups + 1 > max_groups THEN
    RETURN format('This %s time slot is full: %s of %s groups are already reserved.', target_time, used_groups, max_groups);
  END IF;
  IF max_people_slot IS NOT NULL AND used_people + p_booking.group_size > max_people_slot THEN
    RETURN format('This %s time slot is full: %s of %s people are already reserved.', target_time, used_people, max_people_slot);
  END IF;

  SELECT COALESCE(local_limit.max_capacity, global_limit.max_capacity) INTO daily_max
  FROM (SELECT max_capacity FROM public.daily_capacity WHERE location_id = p_booking.location_id AND date = target_date LIMIT 1) local_limit
  FULL JOIN (SELECT max_capacity FROM public.daily_capacity WHERE location_id IS NULL AND date = target_date LIMIT 1) global_limit ON true;
  IF daily_max IS NOT NULL THEN
    SELECT coalesce(sum(b.group_size), 0)::integer INTO daily_people
    FROM public.bookings b
    WHERE public.booking_capacity_holds(b.status)
      AND b.id IS DISTINCT FROM coalesce(p_ignore_id, p_booking.id)
      AND public.booking_effective_date(b) = target_date
      AND (EXISTS (SELECT 1 FROM public.daily_capacity dc WHERE dc.location_id = p_booking.location_id AND dc.date = target_date)
        AND b.location_id IS NOT DISTINCT FROM p_booking.location_id
        OR NOT EXISTS (SELECT 1 FROM public.daily_capacity dc WHERE dc.location_id = p_booking.location_id AND dc.date = target_date));
    IF daily_people + p_booking.group_size > daily_max THEN
      RETURN format('The daily people limit is full: %s of %s people are already reserved.', daily_people, daily_max);
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

-- Replace the old hard-coded five-group trigger. This checks creation,
-- confirmation, and an adjustment proposal in one transaction.
DROP TRIGGER IF EXISTS trg_enforce_booking_start_capacity ON public.bookings;
CREATE OR REPLACE FUNCTION public.enforce_booking_capacity_control()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  issue text;
BEGIN
  IF NEW.status NOT IN ('cancelled', 'declined', 'rejected', 'completed') THEN
    issue := public.booking_capacity_issue(NEW, NEW.id);
    IF issue IS NOT NULL THEN
      RAISE EXCEPTION '%', issue USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_booking_capacity_control ON public.bookings;
CREATE TRIGGER trg_enforce_booking_capacity_control
BEFORE INSERT OR UPDATE OF booking_date, requested_new_date, notes, status, group_size, location_id
ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.enforce_booking_capacity_control();

-- Keep daily_capacity counters aligned with the same pending-hold policy.
CREATE OR REPLACE FUNCTION public.sync_daily_capacity_from_booking()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  old_meta jsonb;
  new_meta jsonb;
BEGIN
  IF TG_OP <> 'INSERT' AND public.booking_capacity_holds(OLD.status) THEN
    old_meta := public.booking_effective_meta(OLD);
    PERFORM public.adjust_daily_capacity_for_booking(OLD.location_id, public.booking_effective_date(OLD), OLD.group_size, old_meta->>'effectiveType', -1);
  END IF;
  IF TG_OP <> 'DELETE' AND public.booking_capacity_holds(NEW.status) THEN
    new_meta := public.booking_effective_meta(NEW);
    PERFORM public.adjust_daily_capacity_for_booking(NEW.location_id, public.booking_effective_date(NEW), NEW.group_size, new_meta->>'effectiveType', 1);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_daily_capacity_from_booking ON public.bookings;
CREATE TRIGGER trg_sync_daily_capacity_from_booking
AFTER INSERT OR UPDATE OF status, booking_date, requested_new_date, group_size, location_id, notes OR DELETE
ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.sync_daily_capacity_from_booking();

CREATE OR REPLACE FUNCTION public.get_booking_capacity_control()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'capacity', jsonb_build_object(
      'mode', c.capacity_mode,
      'sharedMaxGroups', c.shared_max_groups,
      'maxPeoplePerGroup', c.max_people_per_group,
      'maxPeoplePerSlot', c.max_people_per_slot,
      'holdPending', c.hold_pending,
      'perTrailhead', coalesce((SELECT jsonb_agg(jsonb_build_object('locationId', o.location_id, 'maxGroups', o.max_groups) ORDER BY o.location_id) FROM public.booking_capacity_trailhead_overrides o), '[]'::jsonb)
    ),
    'schedule', coalesce((SELECT s.schedule FROM public.booking_schedule_settings s WHERE s.location_id IS NULL), '{}'::jsonb),
    'scheduleOverrides', coalesce((SELECT jsonb_agg(jsonb_build_object('locationId', s.location_id, 'schedule', s.schedule) ORDER BY s.location_id) FROM public.booking_schedule_settings s WHERE s.location_id IS NOT NULL), '[]'::jsonb)
  )
  FROM public.booking_capacity_settings c
  WHERE c.id = 1
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_booking_slot_availability(
  p_start_date date,
  p_end_date date,
  p_location_id uuid DEFAULT NULL
)
RETURNS TABLE (
  booking_date date,
  hike_type text,
  hike_time text,
  location_id uuid,
  group_count bigint,
  people_count bigint,
  max_groups integer,
  max_people integer,
  available_groups integer,
  available_people integer,
  using_trailheads text[]
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH settings AS (SELECT * FROM public.booking_capacity_settings WHERE id = 1),
  locations_scope AS (
    SELECT l.id FROM public.locations l WHERE l.status = 'active' AND (p_location_id IS NULL OR l.id = p_location_id)
    UNION ALL SELECT p_location_id WHERE p_location_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.locations WHERE id = p_location_id)
  ),
  schedule_scope AS (
    SELECT ls.id AS location_id,
      coalesce(overridden.schedule, global.schedule, '{}'::jsonb) AS schedule
    FROM locations_scope ls
    LEFT JOIN public.booking_schedule_settings overridden ON overridden.location_id = ls.id
    LEFT JOIN public.booking_schedule_settings global ON global.location_id IS NULL
  ),
  slot_defs AS (
    SELECT NULL::uuid AS location_id, key AS hike_type, jsonb_array_elements_text(value) AS hike_time
    FROM public.booking_schedule_settings s, jsonb_each(s.schedule->'slots')
    WHERE s.location_id IS NULL AND p_location_id IS NULL AND (SELECT capacity_mode FROM settings) = 'shared'
    UNION ALL
    SELECT ss.location_id, key, jsonb_array_elements_text(value)
    FROM schedule_scope ss, jsonb_each(ss.schedule->'slots')
    WHERE p_location_id IS NOT NULL OR (SELECT capacity_mode FROM settings) = 'per_trailhead'
  ),
  dates AS (
    SELECT generate_series(p_start_date, p_end_date, interval '1 day')::date AS booking_date
  ),
  used AS (
    SELECT public.booking_effective_date(b) AS booking_date,
      lower(coalesce(m->>'effectiveType', 'morning')) AS hike_type,
      public.booking_normalize_time(m->>'effectiveTime') AS hike_time,
      b.location_id,
      count(*) AS group_count,
      sum(b.group_size)::bigint AS people_count
    FROM public.bookings b
    CROSS JOIN LATERAL public.booking_effective_meta(b) m
    WHERE public.booking_capacity_holds(b.status)
      AND public.booking_effective_date(b) BETWEEN p_start_date AND p_end_date
    GROUP BY public.booking_effective_date(b), lower(coalesce(m->>'effectiveType', 'morning')), public.booking_normalize_time(m->>'effectiveTime'), b.location_id
  )
  SELECT d.booking_date, sd.hike_type, public.booking_normalize_time(sd.hike_time), sd.location_id,
    CASE WHEN s.capacity_mode = 'shared' THEN coalesce((SELECT sum(u.group_count) FROM used u WHERE u.booking_date = d.booking_date AND u.hike_type = sd.hike_type AND u.hike_time = public.booking_normalize_time(sd.hike_time)), 0)
      ELSE coalesce((SELECT u.group_count FROM used u WHERE u.booking_date = d.booking_date AND u.hike_type = sd.hike_type AND u.hike_time = public.booking_normalize_time(sd.hike_time) AND u.location_id IS NOT DISTINCT FROM sd.location_id), 0) END,
    CASE WHEN s.capacity_mode = 'shared' THEN coalesce((SELECT sum(u.people_count) FROM used u WHERE u.booking_date = d.booking_date AND u.hike_type = sd.hike_type AND u.hike_time = public.booking_normalize_time(sd.hike_time)), 0)
      ELSE coalesce((SELECT u.people_count FROM used u WHERE u.booking_date = d.booking_date AND u.hike_type = sd.hike_type AND u.hike_time = public.booking_normalize_time(sd.hike_time) AND u.location_id IS NOT DISTINCT FROM sd.location_id), 0) END,
    CASE WHEN s.capacity_mode = 'shared' THEN s.shared_max_groups ELSE public.booking_capacity_group_limit(sd.location_id) END,
    coalesce(s.max_people_per_slot, 2147483647),
    greatest(0, (CASE WHEN s.capacity_mode = 'shared' THEN s.shared_max_groups ELSE public.booking_capacity_group_limit(sd.location_id) END) -
      (CASE WHEN s.capacity_mode = 'shared' THEN coalesce((SELECT sum(u.group_count) FROM used u WHERE u.booking_date = d.booking_date AND u.hike_type = sd.hike_type AND u.hike_time = public.booking_normalize_time(sd.hike_time)), 0) ELSE coalesce((SELECT u.group_count FROM used u WHERE u.booking_date = d.booking_date AND u.hike_type = sd.hike_type AND u.hike_time = public.booking_normalize_time(sd.hike_time) AND u.location_id IS NOT DISTINCT FROM sd.location_id), 0) END)::integer),
    CASE WHEN s.max_people_per_slot IS NULL THEN 2147483647 ELSE greatest(0, s.max_people_per_slot - (CASE WHEN s.capacity_mode = 'shared' THEN coalesce((SELECT sum(u.people_count) FROM used u WHERE u.booking_date = d.booking_date AND u.hike_type = sd.hike_type AND u.hike_time = public.booking_normalize_time(sd.hike_time)), 0) ELSE coalesce((SELECT u.people_count FROM used u WHERE u.booking_date = d.booking_date AND u.hike_type = sd.hike_type AND u.hike_time = public.booking_normalize_time(sd.hike_time) AND u.location_id IS NOT DISTINCT FROM sd.location_id), 0) END)) END,
    ARRAY(SELECT l.name FROM public.locations l WHERE l.status = 'active' AND EXISTS (SELECT 1 FROM used u WHERE u.location_id = l.id AND u.booking_date = d.booking_date AND u.hike_type = sd.hike_type AND u.hike_time = public.booking_normalize_time(sd.hike_time)))
  FROM dates d CROSS JOIN slot_defs sd CROSS JOIN settings s
  ORDER BY d.booking_date, sd.location_id NULLS FIRST, sd.hike_type, sd.hike_time;
$$;

CREATE OR REPLACE FUNCTION public.booking_validate_schedule(p_schedule jsonb)
RETURNS void
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  kind text;
  item text;
BEGIN
  IF jsonb_typeof(p_schedule->'slots') <> 'object' THEN
    RAISE EXCEPTION 'Schedule slots must be an object';
  END IF;
  FOREACH kind IN ARRAY ARRAY['morning', 'night', 'overnight'] LOOP
    IF jsonb_typeof(jsonb_extract_path(p_schedule, 'slots', kind)) <> 'array'
      OR jsonb_array_length(jsonb_extract_path(p_schedule, 'slots', kind)) = 0 THEN
      RAISE EXCEPTION '% schedule must contain at least one time', kind;
    END IF;
    FOR item IN SELECT jsonb_array_elements_text(jsonb_extract_path(p_schedule, 'slots', kind)) LOOP
      IF public.booking_normalize_time(item) !~ '^(0?[1-9]|1[0-2]):[0-5][0-9] (AM|PM)$' THEN
        RAISE EXCEPTION 'Invalid % schedule time: %', kind, item;
      END IF;
    END LOOP;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_booking_capacity_control(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  actor uuid := auth.uid();
  old_config jsonb := public.get_booking_capacity_control();
  new_capacity jsonb := coalesce(p_payload->'capacity', '{}'::jsonb);
  new_schedule jsonb := coalesce(p_payload->'schedule', '{}'::jsonb);
  new_mode text := coalesce(new_capacity->>'mode', 'shared');
  max_groups integer := greatest(1, least(50, coalesce((new_capacity->>'sharedMaxGroups')::integer, 3)));
  max_group_people integer := greatest(1, least(500, coalesce((new_capacity->>'maxPeoplePerGroup')::integer, 30)));
  max_slot_people integer := NULLIF(new_capacity->>'maxPeoplePerSlot', '')::integer;
  flagged_count integer := 0;
  flagged_summary jsonb := '[]'::jsonb;
  row_data record;
  built_schedule jsonb;
BEGIN
  IF actor IS NULL OR NOT public.has_role(actor, 'super_admin'::public.app_role) THEN
    RAISE EXCEPTION 'Only Central Admin may change booking capacity and hike schedule' USING ERRCODE = '42501';
  END IF;
  IF new_mode NOT IN ('shared', 'per_trailhead') THEN RAISE EXCEPTION 'Capacity mode must be shared or per_trailhead'; END IF;
  IF max_slot_people IS NOT NULL AND (max_slot_people < 1 OR max_slot_people > 5000) THEN RAISE EXCEPTION 'Maximum people per slot must be between 1 and 5000'; END IF;

  -- Build and validate the schedule once on the server. The client may preview
  -- generated slots, but it cannot publish a schedule the server rejects.
  IF coalesce(new_schedule->>'mode', 'interval') = 'interval' THEN
    IF coalesce((new_schedule->>'intervalMinutes')::integer, 60) NOT BETWEEN 15 AND 180 THEN RAISE EXCEPTION 'Schedule interval must be between 15 and 180 minutes'; END IF;
    built_schedule := new_schedule || jsonb_build_object('mode', 'interval', 'intervalMinutes', coalesce((new_schedule->>'intervalMinutes')::integer, 60));
    IF jsonb_typeof(built_schedule->'slots') <> 'object' THEN RAISE EXCEPTION 'Interval schedule must include generated slots'; END IF;
  ELSIF new_schedule->>'mode' = 'custom' THEN
    IF jsonb_typeof(new_schedule->'slots') <> 'object' THEN RAISE EXCEPTION 'Custom schedule must include slots'; END IF;
    built_schedule := new_schedule;
  ELSE
    RAISE EXCEPTION 'Schedule mode must be interval or custom';
  END IF;
  PERFORM public.booking_validate_schedule(built_schedule);
  FOR row_data IN SELECT * FROM jsonb_array_elements(coalesce(p_payload->'scheduleOverrides', '[]'::jsonb)) LOOP
    PERFORM public.booking_validate_schedule(coalesce(row_data.value->'schedule', built_schedule));
  END LOOP;

  PERFORM pg_advisory_xact_lock(hashtextextended('kalisungan-capacity-control', 0));
  INSERT INTO public.booking_capacity_settings(id, capacity_mode, shared_max_groups, max_people_per_group, max_people_per_slot, hold_pending, updated_by)
  VALUES (1, new_mode, max_groups, max_group_people, max_slot_people, coalesce((new_capacity->>'holdPending')::boolean, false), actor)
  ON CONFLICT (id) DO UPDATE SET capacity_mode = excluded.capacity_mode, shared_max_groups = excluded.shared_max_groups,
    max_people_per_group = excluded.max_people_per_group, max_people_per_slot = excluded.max_people_per_slot,
    hold_pending = excluded.hold_pending, updated_by = actor, updated_at = now();

  DELETE FROM public.booking_capacity_trailhead_overrides
  WHERE location_id IS NOT NULL;
  INSERT INTO public.booking_capacity_trailhead_overrides(location_id, max_groups, updated_by)
  SELECT (item->>'locationId')::uuid, greatest(1, least(50, (item->>'maxGroups')::integer)), actor
  FROM jsonb_array_elements(coalesce(new_capacity->'perTrailhead', '[]'::jsonb)) item
  WHERE NULLIF(item->>'locationId', '') IS NOT NULL;

  INSERT INTO public.booking_schedule_settings(location_id, schedule, updated_by)
  VALUES (NULL, built_schedule, actor)
  ON CONFLICT (location_id) DO UPDATE SET schedule = excluded.schedule, updated_by = actor, updated_at = now();
  DELETE FROM public.booking_schedule_settings WHERE location_id IS NOT NULL;
  INSERT INTO public.booking_schedule_settings(location_id, schedule, updated_by)
  SELECT (item->>'locationId')::uuid, coalesce(item->'schedule', built_schedule), actor
  FROM jsonb_array_elements(coalesce(p_payload->'scheduleOverrides', '[]'::jsonb)) item
  WHERE NULLIF(item->>'locationId', '') IS NOT NULL;

  IF old_config IS DISTINCT FROM public.get_booking_capacity_control() THEN
    UPDATE public.bookings b
    SET capacity_status = CASE WHEN public.booking_capacity_issue(b) IS NULL THEN 'ok' ELSE 'flagged' END,
        capacity_flag_reason = public.booking_capacity_issue(b),
        capacity_flagged_at = CASE WHEN public.booking_capacity_issue(b) IS NULL THEN NULL ELSE now() END
    WHERE b.status NOT IN ('cancelled', 'declined', 'rejected', 'completed');
    SELECT count(*)::integer INTO flagged_count
    FROM public.bookings b
    WHERE b.capacity_status = 'flagged' AND b.capacity_flagged_at >= now() - interval '5 seconds';
    SELECT coalesce(jsonb_agg(jsonb_build_object('bookingId', b.id, 'reason', b.capacity_flag_reason) ORDER BY b.booking_date), '[]'::jsonb)
      INTO flagged_summary
    FROM public.bookings b WHERE b.capacity_status = 'flagged' AND b.capacity_flagged_at >= now() - interval '5 seconds';
    INSERT INTO public.booking_capacity_audit(changed_by, old_config, new_config, flagged_booking_count, flagged_summary)
    VALUES (actor, old_config, public.get_booking_capacity_control(), flagged_count, flagged_summary);
    INSERT INTO public.app_notifications(user_id, sender_id, type, reference_id, title, body, category, link)
    SELECT DISTINCT ur.user_id, actor, 'capacity', NULL,
      'Booking capacity and schedule updated',
      format(
        'Before: %s groups per start time and %s hikers per group (%s hikers at once), %s. After: %s groups per start time and %s hikers per group (%s hikers at once), %s. %s existing booking(s) were flagged for review; existing bookings were not moved or cancelled.',
        coalesce(old_config #>> '{capacity,sharedMaxGroups}', '3'),
        coalesce(old_config #>> '{capacity,maxPeoplePerGroup}', '5'),
        (coalesce(old_config #>> '{capacity,sharedMaxGroups}', '3')::integer * coalesce(old_config #>> '{capacity,maxPeoplePerGroup}', '5')::integer),
        CASE WHEN old_config #>> '{capacity,mode}' = 'shared' THEN 'all trailheads shared the limit' ELSE 'each trailhead had its own limit' END,
        coalesce(new_capacity->>'sharedMaxGroups', max_groups::text),
        coalesce(new_capacity->>'maxPeoplePerGroup', max_group_people::text),
        (max_groups * max_group_people),
        CASE WHEN new_mode = 'shared' THEN 'all trailheads share the limit' ELSE 'each trailhead has its own limit' END,
        flagged_count
      ),
      'system', '/admin?tab=capacity'
    FROM public.user_roles ur
    WHERE ur.role IN ('admin'::public.app_role, 'guide'::public.app_role)
      AND ur.user_id IS DISTINCT FROM actor;
  END IF;
  RETURN jsonb_build_object('changed', old_config IS DISTINCT FROM public.get_booking_capacity_control(), 'flaggedBookingCount', flagged_count, 'config', public.get_booking_capacity_control());
END;
$$;

REVOKE ALL ON FUNCTION public.booking_normalize_time(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.booking_effective_date(public.bookings) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.booking_effective_meta(public.bookings) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.booking_schedule_for_location(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.booking_slot_is_scheduled(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.booking_capacity_holds(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.booking_capacity_group_limit(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.booking_capacity_issue(public.bookings, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.booking_validate_schedule(jsonb) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_booking_capacity_control() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_booking_slot_availability(date, date, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_booking_capacity_control(jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
