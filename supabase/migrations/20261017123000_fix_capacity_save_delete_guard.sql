-- Keep capacity saves compatible with environments that reject unqualified
-- DELETE statements. This is a repair migration for databases that already
-- applied 20261017100000 or 20261017113000.

CREATE OR REPLACE FUNCTION public.save_booking_capacity_control(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  actor uuid := auth.uid();
  old_config jsonb;
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
  new_config jsonb;
  config_changed boolean := false;
BEGIN
  IF actor IS NULL OR NOT public.has_role(actor, 'super_admin'::public.app_role) THEN
    RAISE EXCEPTION 'Only Central Admin may change booking capacity and hike schedule' USING ERRCODE = '42501';
  END IF;
  IF new_mode NOT IN ('shared', 'per_trailhead') THEN
    RAISE EXCEPTION 'Capacity mode must be shared or per_trailhead';
  END IF;
  IF max_slot_people IS NOT NULL AND (max_slot_people < 1 OR max_slot_people > 5000) THEN
    RAISE EXCEPTION 'Maximum people per slot must be between 1 and 5000';
  END IF;

  IF coalesce(new_schedule->>'mode', 'interval') = 'interval' THEN
    IF coalesce((new_schedule->>'intervalMinutes')::integer, 60) NOT BETWEEN 15 AND 180 THEN
      RAISE EXCEPTION 'Schedule interval must be between 15 and 180 minutes';
    END IF;
    built_schedule := new_schedule || jsonb_build_object(
      'mode', 'interval',
      'intervalMinutes', coalesce((new_schedule->>'intervalMinutes')::integer, 60)
    );
    IF jsonb_typeof(built_schedule->'slots') <> 'object' THEN
      RAISE EXCEPTION 'Interval schedule must include generated slots';
    END IF;
  ELSIF new_schedule->>'mode' = 'custom' THEN
    IF jsonb_typeof(new_schedule->'slots') <> 'object' THEN
      RAISE EXCEPTION 'Custom schedule must include slots';
    END IF;
    built_schedule := new_schedule;
  ELSE
    RAISE EXCEPTION 'Schedule mode must be interval or custom';
  END IF;

  PERFORM public.booking_validate_schedule(built_schedule);
  FOR row_data IN SELECT * FROM jsonb_array_elements(coalesce(p_payload->'scheduleOverrides', '[]'::jsonb)) LOOP
    PERFORM public.booking_validate_schedule(coalesce(row_data.value->'schedule', built_schedule));
  END LOOP;

  PERFORM pg_advisory_xact_lock(hashtextextended('kalisungan-capacity-control', 0));
  old_config := public.get_booking_capacity_control();

  INSERT INTO public.booking_capacity_settings(
    id, capacity_mode, shared_max_groups, max_people_per_group,
    max_people_per_slot, hold_pending, updated_by
  )
  VALUES (
    1, new_mode, max_groups, max_group_people, max_slot_people,
    coalesce((new_capacity->>'holdPending')::boolean, false), actor
  )
  ON CONFLICT (id) DO UPDATE SET
    capacity_mode = excluded.capacity_mode,
    shared_max_groups = excluded.shared_max_groups,
    max_people_per_group = excluded.max_people_per_group,
    max_people_per_slot = excluded.max_people_per_slot,
    hold_pending = excluded.hold_pending,
    updated_by = actor,
    updated_at = now();

  DELETE FROM public.booking_capacity_trailhead_overrides
  WHERE location_id IS NOT NULL;
  INSERT INTO public.booking_capacity_trailhead_overrides(location_id, max_groups, updated_by)
  SELECT (item->>'locationId')::uuid,
         greatest(1, least(50, (item->>'maxGroups')::integer)),
         actor
  FROM jsonb_array_elements(coalesce(new_capacity->'perTrailhead', '[]'::jsonb)) item
  WHERE NULLIF(item->>'locationId', '') IS NOT NULL;

  INSERT INTO public.booking_schedule_settings(location_id, schedule, updated_by)
  VALUES (NULL, built_schedule, actor)
  ON CONFLICT (location_id) DO UPDATE SET
    schedule = excluded.schedule,
    updated_by = actor,
    updated_at = now();
  DELETE FROM public.booking_schedule_settings
  WHERE location_id IS NOT NULL;
  INSERT INTO public.booking_schedule_settings(location_id, schedule, updated_by)
  SELECT (item->>'locationId')::uuid,
         coalesce(item->'schedule', built_schedule),
         actor
  FROM jsonb_array_elements(coalesce(p_payload->'scheduleOverrides', '[]'::jsonb)) item
  WHERE NULLIF(item->>'locationId', '') IS NOT NULL;

  new_config := public.get_booking_capacity_control();
  config_changed := old_config IS DISTINCT FROM new_config;

  IF config_changed THEN
    UPDATE public.bookings b
    SET capacity_status = CASE WHEN public.booking_capacity_issue(b) IS NULL THEN 'ok' ELSE 'flagged' END,
        capacity_flag_reason = public.booking_capacity_issue(b),
        capacity_flagged_at = CASE WHEN public.booking_capacity_issue(b) IS NULL THEN NULL ELSE now() END
    WHERE b.status NOT IN ('cancelled', 'declined', 'rejected', 'completed');

    SELECT count(*)::integer INTO flagged_count
    FROM public.bookings b
    WHERE b.capacity_status = 'flagged'
      AND b.capacity_flagged_at >= now() - interval '5 seconds';
    SELECT coalesce(
      jsonb_agg(
        jsonb_build_object('bookingId', b.id, 'reason', b.capacity_flag_reason)
        ORDER BY b.booking_date
      ),
      '[]'::jsonb
    ) INTO flagged_summary
    FROM public.bookings b
    WHERE b.capacity_status = 'flagged'
      AND b.capacity_flagged_at >= now() - interval '5 seconds';

    INSERT INTO public.booking_capacity_audit(
      changed_by, old_config, new_config, flagged_booking_count, flagged_summary
    )
    VALUES (actor, old_config, new_config, flagged_count, flagged_summary);

    PERFORM public.create_staff_change_announcement(
      'Booking schedule and capacity updated',
      format(
        'The Central Tourism Office updated booking operations. Capacity changed from %s groups per start time and %s hikers per group to %s groups per start time and %s hikers per group. The start-time setting changed from %s minute interval to %s minute interval. The published schedule and trailhead windows are now effective across Lamot 1, Lamot 2, and Sto. Tomas. %s existing booking(s) were flagged for staff review; existing bookings were not moved or cancelled.',
        coalesce(old_config #>> '{capacity,sharedMaxGroups}', '3'),
        coalesce(old_config #>> '{capacity,maxPeoplePerGroup}', '5'),
        coalesce(new_config #>> '{capacity,sharedMaxGroups}', max_groups::text),
        coalesce(new_config #>> '{capacity,maxPeoplePerGroup}', max_group_people::text),
        coalesce(old_config #>> '{schedule,intervalMinutes}', 'custom'),
        coalesce(new_config #>> '{schedule,intervalMinutes}', coalesce(new_schedule->>'intervalMinutes', 'custom')),
        flagged_count
      ),
      actor
    );
  END IF;

  RETURN jsonb_build_object(
    'changed', config_changed,
    'flaggedBookingCount', flagged_count,
    'config', new_config
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_booking_capacity_control(jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
