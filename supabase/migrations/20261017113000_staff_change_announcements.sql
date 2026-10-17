-- Publish one formal staff-only announcement after central fare, schedule, or
-- capacity changes. The announcement delivery trigger is the only place that
-- creates recipient notifications, preventing duplicate inbox rows.

ALTER TABLE public.announcements
  DROP CONSTRAINT IF EXISTS announcements_target_check;

ALTER TABLE public.announcements
  ADD CONSTRAINT announcements_target_check
  CHECK (target IN ('all', 'admins', 'hikers', 'guides', 'staff'));

CREATE OR REPLACE FUNCTION public.notify_announcement_recipients()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  announcement_link text := '/notifications?announcementId=' || NEW.id::text;
  announcement_reference uuid := CASE
    WHEN NEW.id::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN NEW.id::uuid
    ELSE NULL
  END;
BEGIN
  IF NEW.lifecycle_status <> 'active' OR NEW.approval_status <> 'approved' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NOT (OLD.approval_status IS DISTINCT FROM NEW.approval_status
       OR OLD.lifecycle_status IS DISTINCT FROM NEW.lifecycle_status) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.app_notifications(
    user_id, sender_id, type, reference_id, title, body, category, link
  )
  SELECT DISTINCT
    recipient.user_id,
    NEW.created_by,
    'announcement',
    announcement_reference,
    NEW.title,
    left(NEW.body, 240),
    'announcement',
    announcement_link
  FROM public.user_roles recipient
  LEFT JOIN public.user_locations recipient_location
    ON recipient_location.user_id = recipient.user_id
  WHERE recipient.user_id IS DISTINCT FROM NEW.created_by
    AND (
      NEW.target = 'all'
      OR (NEW.target = 'admins' AND recipient.role IN ('admin', 'super_admin'))
      OR (NEW.target = 'guides' AND recipient.role = 'guide')
      OR (NEW.target = 'hikers' AND recipient.role = 'hiker')
      OR (NEW.target = 'staff' AND recipient.role IN ('admin', 'guide'))
    )
    AND (
      NEW.location_id IS NULL
      OR recipient_location.location_id = NEW.location_id
      OR (
        recipient.role = 'hiker'
        AND EXISTS (
          SELECT 1
          FROM public.bookings scoped_booking
          WHERE scoped_booking.user_id = recipient.user_id
            AND scoped_booking.location_id = NEW.location_id
            AND scoped_booking.status NOT IN ('cancelled', 'completed', 'ended', 'rejected', 'declined')
        )
      )
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.app_notifications existing
      WHERE existing.user_id = recipient.user_id
        AND existing.type = 'announcement'
        AND existing.link = announcement_link
    );

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_staff_change_announcement(
  p_title text,
  p_body text,
  p_actor uuid
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
    id, title, body, source, type, target, is_important,
    created_at, created_by, approval_status, approved_by, approved_at,
    lifecycle_status
  ) VALUES (
    announcement_id,
    p_title,
    p_body,
    'Calauan Municipal Tourism Office',
    'info',
    'staff',
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

REVOKE ALL ON FUNCTION public.create_staff_change_announcement(text, text, uuid) FROM PUBLIC, anon, authenticated;

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
      'The Central Tourism Office updated the official fare schedule. Registration / entry: PHP %s to PHP %s; environmental fee: PHP %s to PHP %s; morning guide: PHP %s to PHP %s; night guide: PHP %s to PHP %s; overnight guide: PHP %s to PHP %s; peak extension: PHP %s to PHP %s; horse assistance: PHP %s / PHP %s to PHP %s / PHP %s; maximum hikers per guide: %s to %s. The updated rates are effective across Lamot 1, Lamot 2, and Sto. Tomas.',
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

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS system_settings_pricing_change_announcement ON public.system_settings;
CREATE TRIGGER system_settings_pricing_change_announcement
  AFTER UPDATE OF value ON public.system_settings
  FOR EACH ROW
  WHEN (NEW.key = 'pricing_config')
  EXECUTE FUNCTION public.announce_pricing_change();

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
  IF new_mode NOT IN ('shared', 'per_trailhead') THEN RAISE EXCEPTION 'Capacity mode must be shared or per_trailhead'; END IF;
  IF max_slot_people IS NOT NULL AND (max_slot_people < 1 OR max_slot_people > 5000) THEN RAISE EXCEPTION 'Maximum people per slot must be between 1 and 5000'; END IF;

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
  -- Read after locking so concurrent saves of the same values cannot emit
  -- duplicate audit rows or staff announcements.
  old_config := public.get_booking_capacity_control();
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
    WHERE b.capacity_status = 'flagged' AND b.capacity_flagged_at >= now() - interval '5 seconds';
    SELECT coalesce(jsonb_agg(jsonb_build_object('bookingId', b.id, 'reason', b.capacity_flag_reason) ORDER BY b.booking_date), '[]'::jsonb)
      INTO flagged_summary
    FROM public.bookings b WHERE b.capacity_status = 'flagged' AND b.capacity_flagged_at >= now() - interval '5 seconds';
    INSERT INTO public.booking_capacity_audit(changed_by, old_config, new_config, flagged_booking_count, flagged_summary)
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

  RETURN jsonb_build_object('changed', config_changed, 'flaggedBookingCount', flagged_count, 'config', new_config);
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_booking_capacity_control(jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
