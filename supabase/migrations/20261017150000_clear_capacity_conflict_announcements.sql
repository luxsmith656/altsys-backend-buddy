-- Make central fare, capacity, and schedule notices actionable without
-- broadcasting private booking conflicts to unrelated trailheads.

CREATE OR REPLACE FUNCTION public.create_staff_change_announcement_for_location(
  p_title text,
  p_body text,
  p_actor uuid,
  p_location_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  announcement_id text := gen_random_uuid()::text;
BEGIN
  INSERT INTO public.announcements (
    id, title, body, source, type, target, location_id, is_important,
    created_at, created_by, approval_status, approved_by, approved_at,
    lifecycle_status
  ) VALUES (
    announcement_id,
    p_title,
    p_body,
    'Calauan Municipal Tourism Office',
    'warning',
    'staff',
    p_location_id,
    true,
    now(),
    p_actor,
    'approved',
    p_actor,
    now(),
    'active'
  );

  RETURN announcement_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_staff_change_announcement_for_location(text, text, uuid, uuid)
  FROM PUBLIC, anon, authenticated;

-- A fare update remains a normal staff announcement, but hikers with an
-- already-paid upcoming booking receive a direct booking notification so a
-- local admin can review the receipt instead of asking them to pay again.
CREATE OR REPLACE FUNCTION public.announce_pricing_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor uuid := coalesce(NEW.updated_by, auth.uid());
  old_values jsonb := coalesce(OLD.value, '{}'::jsonb) - 'updatedAt' - 'updatedBy';
  new_values jsonb := coalesce(NEW.value, '{}'::jsonb) - 'updatedAt' - 'updatedBy';
BEGIN
  IF NEW.key <> 'pricing_config'
     OR old_values IS NOT DISTINCT FROM new_values
     OR actor IS NULL
     OR NOT public.has_role(actor, 'super_admin'::public.app_role) THEN
    RETURN NEW;
  END IF;

  PERFORM public.create_staff_change_announcement(
    'Official fare schedule updated',
    format(
      'The Central Tourism Office updated the official fare board. Registration / entry: PHP %s to PHP %s; environmental fee: PHP %s to PHP %s; morning guide: PHP %s to PHP %s; night guide: PHP %s to PHP %s; overnight guide: PHP %s to PHP %s; peak extension: PHP %s to PHP %s; horse assistance: PHP %s / PHP %s to PHP %s / PHP %s; maximum hikers per guide: %s to %s. The updated rates apply to Lamot 1, Lamot 2, and Sto. Tomas. Local admins will review affected confirmed or paid bookings individually; no booking is changed automatically and hikers should not pay again until their local admin confirms the receipt.',
      coalesce(old_values->>'entryFee', '—'), coalesce(new_values->>'entryFee', '—'),
      coalesce(old_values->>'envFee', '—'), coalesce(new_values->>'envFee', '—'),
      coalesce(old_values->>'guideFeeMorning', '—'), coalesce(new_values->>'guideFeeMorning', '—'),
      coalesce(old_values->>'guideFeeNight', '—'), coalesce(new_values->>'guideFeeNight', '—'),
      coalesce(old_values->>'guideFeeOvernight', '—'), coalesce(new_values->>'guideFeeOvernight', '—'),
      coalesce(old_values->>'peakExtensionFeePerHour', '—'), coalesce(new_values->>'peakExtensionFeePerHour', '—'),
      coalesce(old_values->>'horseEmergencyFee', '—'), coalesce(old_values->>'horseHighStationFee', '—'),
      coalesce(new_values->>'horseEmergencyFee', '—'), coalesce(new_values->>'horseHighStationFee', '—'),
      coalesce(old_values->>'maxPaxPerGuide', '—'), coalesce(new_values->>'maxPaxPerGuide', '—')
    ),
    actor
  );

  INSERT INTO public.app_notifications(
    user_id, sender_id, type, reference_id, title, body, category, link
  )
  SELECT DISTINCT
    b.user_id,
    actor,
    'fare_update',
    b.id,
    'Fare update: your paid booking needs review',
    'Central updated the official fare board. Your recorded payment remains on this booking. Your local trailhead admin will review the receipt and contact you if an adjustment is needed; do not pay again until they confirm.',
    'booking',
    '/hiker?bookingId=' || b.id::text
  FROM public.bookings b
  CROSS JOIN LATERAL public.booking_effective_meta(b) meta
  WHERE b.status IN ('pending', 'accepted', 'confirmed', 'active', 'adjustment_pending')
    AND (
      meta->>'paymentStatus' = 'paid'
      OR (
        coalesce(b.total_amount, 0) > 0
        AND (meta->>'amountPaid') ~ '^[0-9]+(\.[0-9]+)?$'
        AND (meta->>'amountPaid')::numeric >= b.total_amount
      )
    );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS system_settings_pricing_change_announcement ON public.system_settings;
CREATE TRIGGER system_settings_pricing_change_announcement
  AFTER UPDATE OF value ON public.system_settings
  FOR EACH ROW
  WHEN (NEW.key = 'pricing_config')
  EXECUTE FUNCTION public.announce_pricing_change();

-- Capacity and schedule changes are evaluated after the new rules are stored.
-- If nothing is affected, everyone receives one plain-language staff notice.
-- If bookings are affected, only the corresponding local trailhead staff and
-- guides receive an action notice for that trailhead.
CREATE OR REPLACE FUNCTION public.save_booking_capacity_control(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
  location_row record;
  booking_row record;
  built_schedule jsonb;
  new_config jsonb;
  config_changed boolean := false;
  old_mode_label text;
  new_mode_label text;
  old_capacity_text text;
  new_capacity_text text;
  old_schedule_text text;
  new_schedule_text text;
  standard_body text;
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

  DELETE FROM public.booking_capacity_trailhead_overrides WHERE location_id IS NOT NULL;
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
  DELETE FROM public.booking_schedule_settings WHERE location_id IS NOT NULL;
  INSERT INTO public.booking_schedule_settings(location_id, schedule, updated_by)
  SELECT (item->>'locationId')::uuid, coalesce(item->'schedule', built_schedule), actor
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
      jsonb_agg(jsonb_build_object('bookingId', b.id, 'reason', b.capacity_flag_reason) ORDER BY b.booking_date),
      '[]'::jsonb
    ) INTO flagged_summary
    FROM public.bookings b
    WHERE b.capacity_status = 'flagged'
      AND b.capacity_flagged_at >= now() - interval '5 seconds';

    INSERT INTO public.booking_capacity_audit(
      changed_by, old_config, new_config, flagged_booking_count, flagged_summary
    ) VALUES (actor, old_config, new_config, flagged_count, flagged_summary);

    old_mode_label := CASE WHEN old_config #>> '{capacity,mode}' = 'shared'
      THEN 'one shared pool across Lamot 1, Lamot 2, and Sto. Tomas'
      ELSE 'a separate limit for each trailhead' END;
    new_mode_label := CASE WHEN new_config #>> '{capacity,mode}' = 'shared'
      THEN 'one shared pool across Lamot 1, Lamot 2, and Sto. Tomas'
      ELSE 'a separate limit for each trailhead' END;
    old_capacity_text := format(
      '%s groups per start time, up to %s hikers per group (%s hikers per start)',
      coalesce(old_config #>> '{capacity,sharedMaxGroups}', '3'),
      coalesce(old_config #>> '{capacity,maxPeoplePerGroup}', '5'),
      (coalesce(old_config #>> '{capacity,sharedMaxGroups}', '3')::integer * coalesce(old_config #>> '{capacity,maxPeoplePerGroup}', '5')::integer)
    );
    new_capacity_text := format(
      '%s groups per start time, up to %s hikers per group (%s hikers per start)',
      coalesce(new_config #>> '{capacity,sharedMaxGroups}', max_groups::text),
      coalesce(new_config #>> '{capacity,maxPeoplePerGroup}', max_group_people::text),
      (coalesce(new_config #>> '{capacity,sharedMaxGroups}', max_groups::text)::integer * coalesce(new_config #>> '{capacity,maxPeoplePerGroup}', max_group_people::text)::integer)
    );
    old_schedule_text := coalesce(old_config #>> '{schedule,intervalMinutes}', 'custom published times') || ' minute interval';
    new_schedule_text := coalesce(new_config #>> '{schedule,intervalMinutes}', 'custom published times') || ' minute interval';
    standard_body := format(
      'Central Tourism Office updated booking rules. Capacity uses %s. New limit: %s. Start times use a %s. Published trailhead windows apply to Lamot 1, Lamot 2, and Sto. Tomas. No existing booking was affected, so no reschedule is required.',
      new_mode_label,
      new_capacity_text,
      new_schedule_text
    );

    IF flagged_count = 0 THEN
      PERFORM public.create_staff_change_announcement(
        'Booking capacity and schedule updated',
        standard_body || format(' Previous setting: %s with %s and %s.', old_mode_label, old_capacity_text, old_schedule_text),
        actor
      );
    ELSE
      FOR location_row IN
        SELECT b.location_id,
               coalesce(l.name, 'the affected trailhead') AS location_name,
               count(*)::integer AS affected_count,
               string_agg(DISTINCT b.capacity_flag_reason, '; ') AS reasons
        FROM public.bookings b
        LEFT JOIN public.locations l ON l.id = b.location_id
        WHERE b.capacity_status = 'flagged'
          AND b.capacity_flagged_at >= now() - interval '5 seconds'
        GROUP BY b.location_id, l.name
      LOOP
        IF location_row.location_id IS NULL THEN
          PERFORM public.create_staff_change_announcement(
            'Action required: booking capacity conflict',
            format('Central Tourism Office changed the booking rules to %s with %s and %s. %s booking(s) no longer fit the published schedule or capacity. Local Admin should review only those affected bookings and resolve them through the normal booking operation, such as rescheduling. Existing bookings were not moved or cancelled. Details: %s.', new_mode_label, new_capacity_text, new_schedule_text, location_row.affected_count, coalesce(location_row.reasons, 'published capacity or start-time rule changed')),
            actor
          );
        ELSE
          PERFORM public.create_staff_change_announcement_for_location(
            format('Action required: %s booking conflict', location_row.location_name),
            format('Central Tourism Office changed the booking rules to %s with %s and %s. %s booking(s) at %s no longer fit the published schedule or capacity. This notice is only for the %s Local Admin and assigned guides. Review affected bookings individually and resolve them through booking operations, such as rescheduling. Existing bookings were not moved or cancelled. Details: %s.', new_mode_label, new_capacity_text, new_schedule_text, location_row.affected_count, location_row.location_name, location_row.location_name, coalesce(location_row.reasons, 'published capacity or start-time rule changed')),
            actor,
            location_row.location_id
          );
        END IF;
      END LOOP;

      INSERT INTO public.app_notifications(
        user_id, sender_id, type, reference_id, title, body, category, link
      )
      SELECT DISTINCT
        b.user_id,
        actor,
        'capacity_conflict',
        b.id,
        'Your booking needs schedule review',
        'Central changed the published capacity or start-time rules. Your booking no longer fits the current rule, but it was not moved or cancelled. Your local trailhead admin will contact you about rescheduling or another approved solution.',
        'booking',
        '/hiker?bookingId=' || b.id::text
      FROM public.bookings b
      CROSS JOIN LATERAL public.booking_effective_meta(b) meta
      WHERE b.capacity_status = 'flagged'
        AND b.capacity_flagged_at >= now() - interval '5 seconds'
        AND (
          meta->>'paymentStatus' = 'paid'
          OR (
            coalesce(b.total_amount, 0) > 0
            AND (meta->>'amountPaid') ~ '^[0-9]+(\.[0-9]+)?$'
            AND (meta->>'amountPaid')::numeric >= b.total_amount
          )
        );
    END IF;
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
