-- Let guides operate only on bookings assigned to them, including safe same-location handoff.
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

DROP POLICY IF EXISTS ba_guide_handover_select ON public.booking_assignments;
CREATE POLICY ba_guide_handover_select ON public.booking_assignments
  FOR SELECT TO authenticated
  USING (public.guide_can_manage_booking(booking_id));

DROP POLICY IF EXISTS ba_guide_handover_insert ON public.booking_assignments;
CREATE POLICY ba_guide_handover_insert ON public.booking_assignments
  FOR INSERT TO authenticated
  WITH CHECK (public.guide_can_handover_assignment(booking_id, guide_id, location_id));

DROP POLICY IF EXISTS ba_guide_handover_update ON public.booking_assignments;
CREATE POLICY ba_guide_handover_update ON public.booking_assignments
  FOR UPDATE TO authenticated
  USING (public.guide_can_handover_assignment(booking_id, guide_id, location_id))
  WITH CHECK (public.guide_can_handover_assignment(booking_id, guide_id, location_id));

DROP POLICY IF EXISTS bm_guide_insert ON public.booking_messages;
CREATE POLICY bm_guide_insert ON public.booking_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND public.guide_can_manage_booking(booking_id)
  );
