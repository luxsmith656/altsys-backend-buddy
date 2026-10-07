-- Operational support: durable SOS alerts, guide duty requests, and scoped
-- reschedule decisions. Apply after the booking-message audience migrations.

CREATE TABLE IF NOT EXISTS public.emergency_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  session_id uuid REFERENCES public.hiker_sessions(id) ON DELETE SET NULL,
  user_id uuid NOT NULL,
  reporter_role text NOT NULL DEFAULT 'hiker',
  location_id uuid,
  latitude double precision,
  longitude double precision,
  message text NOT NULL DEFAULT 'Emergency assistance requested',
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'resolved', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz,
  acknowledged_by uuid,
  resolved_at timestamptz,
  resolved_by uuid
);

CREATE INDEX IF NOT EXISTS emergency_alerts_location_status_idx
  ON public.emergency_alerts(location_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS emergency_alerts_user_created_idx
  ON public.emergency_alerts(user_id, created_at DESC);
ALTER TABLE public.emergency_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS emergency_alerts_reporter_insert ON public.emergency_alerts;
CREATE POLICY emergency_alerts_reporter_insert ON public.emergency_alerts
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS emergency_alerts_reporter_select ON public.emergency_alerts;
CREATE POLICY emergency_alerts_reporter_select ON public.emergency_alerts
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR public.has_role(auth.uid(), 'mdrrmo'::public.app_role)
    OR public.has_role(auth.uid(), 'ranger'::public.app_role)
    OR (public.has_role(auth.uid(), 'admin'::public.app_role)
      AND (location_id IS NULL OR public.admin_can_access_location(location_id)))
  );

DROP POLICY IF EXISTS emergency_alerts_dispatch_update ON public.emergency_alerts;
CREATE POLICY emergency_alerts_dispatch_update ON public.emergency_alerts
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR public.has_role(auth.uid(), 'mdrrmo'::public.app_role)
    OR public.has_role(auth.uid(), 'ranger'::public.app_role)
    OR (public.has_role(auth.uid(), 'admin'::public.app_role)
      AND (location_id IS NULL OR public.admin_can_access_location(location_id)))
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR public.has_role(auth.uid(), 'mdrrmo'::public.app_role)
    OR public.has_role(auth.uid(), 'ranger'::public.app_role)
    OR (public.has_role(auth.uid(), 'admin'::public.app_role)
      AND (location_id IS NULL OR public.admin_can_access_location(location_id)))
  );

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.emergency_alerts;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END $$;

ALTER TABLE public.guide_off_duty_requests
  ADD COLUMN IF NOT EXISTS request_type text NOT NULL DEFAULT 'off_duty';
ALTER TABLE public.guide_off_duty_requests
  ADD COLUMN IF NOT EXISTS review_note text;
ALTER TABLE public.guide_off_duty_requests
  DROP CONSTRAINT IF EXISTS guide_off_duty_requests_type_check;
ALTER TABLE public.guide_off_duty_requests
  ADD CONSTRAINT guide_off_duty_requests_type_check
  CHECK (request_type IN ('off_duty', 'return_to_duty'));

DROP POLICY IF EXISTS god_admin_all ON public.guide_off_duty_requests;
CREATE POLICY god_admin_all ON public.guide_off_duty_requests
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR (public.has_role(auth.uid(), 'admin'::public.app_role) AND EXISTS (
      SELECT 1 FROM public.guides duty_guide
      WHERE duty_guide.id = guide_off_duty_requests.guide_id
        AND public.admin_can_access_location(duty_guide.location_id)
    ))
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR (public.has_role(auth.uid(), 'admin'::public.app_role) AND EXISTS (
      SELECT 1 FROM public.guides duty_guide
      WHERE duty_guide.id = guide_off_duty_requests.guide_id
        AND public.admin_can_access_location(duty_guide.location_id)
    ))
  );

-- Keep guide status correct when an approved period ends, and support an
-- approved early-return request without allowing guides to self-promote.
CREATE OR REPLACE FUNCTION public.sync_guide_off_duty() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'approved' AND NEW.request_type = 'off_duty'
     AND CURRENT_DATE BETWEEN NEW.start_date AND NEW.end_date THEN
    UPDATE public.guides SET status = 'off_duty', updated_at = now()
    WHERE id = NEW.guide_id;
  ELSIF NEW.status = 'approved' AND NEW.request_type = 'return_to_duty' THEN
    UPDATE public.guides SET status = 'available', updated_at = now()
    WHERE id = NEW.guide_id AND status IN ('off_duty', 'off-duty');
  ELSIF NEW.status = 'rejected' AND OLD.status = 'approved'
        AND NEW.request_type = 'off_duty' THEN
    UPDATE public.guides SET status = 'available', updated_at = now()
    WHERE id = NEW.guide_id AND status IN ('off_duty', 'off-duty');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sync_guide_off_duty ON public.guide_off_duty_requests;
CREATE TRIGGER trg_sync_guide_off_duty AFTER INSERT OR UPDATE ON public.guide_off_duty_requests
  FOR EACH ROW EXECUTE FUNCTION public.sync_guide_off_duty();

CREATE OR REPLACE FUNCTION public.refresh_guide_duty_status(p_guide_id uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  current_status text;
  active_request public.guide_off_duty_requests%ROWTYPE;
BEGIN
  SELECT status INTO current_status FROM public.guides WHERE id = p_guide_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Guide not found'; END IF;
  IF NOT (
    EXISTS (SELECT 1 FROM public.guides WHERE id = p_guide_id AND user_id = auth.uid())
    OR (public.has_role(auth.uid(), 'admin'::public.app_role) AND EXISTS (
      SELECT 1 FROM public.guides duty_guide
      WHERE duty_guide.id = p_guide_id AND public.admin_can_access_location(duty_guide.location_id)
    ))
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Not allowed to refresh this guide';
  END IF;

  SELECT * INTO active_request
  FROM public.guide_off_duty_requests
  WHERE guide_id = p_guide_id AND status = 'approved' AND request_type = 'off_duty'
  ORDER BY end_date DESC, created_at DESC LIMIT 1;

  IF active_request.id IS NOT NULL AND CURRENT_DATE BETWEEN active_request.start_date AND active_request.end_date THEN
    IF current_status NOT IN ('off_duty', 'off-duty') THEN
      UPDATE public.guides SET status = 'off_duty', updated_at = now() WHERE id = p_guide_id;
      RETURN 'off_duty';
    END IF;
    RETURN current_status;
  END IF;

  IF current_status IN ('off_duty', 'off-duty') THEN
    UPDATE public.guides SET status = 'available', updated_at = now() WHERE id = p_guide_id;
    RETURN 'available';
  END IF;
  RETURN current_status;
END $$;
REVOKE ALL ON FUNCTION public.refresh_guide_duty_status(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refresh_guide_duty_status(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_approve_booking_reschedule(
  p_booking_id uuid,
  p_approved boolean,
  p_reason text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  b public.bookings%ROWTYPE;
  meta jsonb;
  target_date date;
  guide_user_ids uuid[];
  clean_reason text := NULLIF(trim(COALESCE(p_reason, '')), '');
BEGIN
  IF auth.uid() IS NULL OR NOT (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Only an administrator may decide a reschedule' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO b FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found'; END IF;
  IF NOT public.admin_can_access_location(b.location_id) THEN
    RAISE EXCEPTION 'Booking belongs to another trailhead' USING ERRCODE = '42501';
  END IF;
  IF b.status <> 'adjustment_pending' OR b.requested_new_date IS NULL THEN
    RAISE EXCEPTION 'There is no pending reschedule request';
  END IF;
  target_date := b.requested_new_date;

  BEGIN
    meta := COALESCE(NULLIF(b.notes, '')::jsonb, '{}'::jsonb);
    IF jsonb_typeof(meta) <> 'object' THEN meta := jsonb_build_object('userNotes', b.notes); END IF;
  EXCEPTION WHEN invalid_text_representation THEN
    meta := jsonb_build_object('userNotes', b.notes);
  END;

  SELECT COALESCE(array_agg(g.user_id) FILTER (WHERE g.user_id IS NOT NULL), ARRAY[]::uuid[])
    INTO guide_user_ids
  FROM public.booking_assignments ba JOIN public.guides g ON g.id = ba.guide_id
  WHERE ba.booking_id = b.id AND ba.status IN ('pending', 'accepted');

  IF p_approved THEN
    meta := meta || jsonb_build_object('rescheduleApprovedAt', now(), 'rescheduleApprovedBy', auth.uid());
    UPDATE public.bookings SET booking_date = target_date, status = 'confirmed',
      requested_new_date = NULL, requested_at = NULL, notes = meta::text WHERE id = b.id;
  ELSE
    meta := meta || jsonb_build_object('rescheduleRejectedAt', now(), 'rescheduleRejectedBy', auth.uid(),
      'rescheduleRejectionReason', COALESCE(clean_reason, 'The requested date is unavailable.'));
    UPDATE public.bookings SET status = 'confirmed', requested_new_date = NULL,
      requested_at = NULL, notes = meta::text WHERE id = b.id;
  END IF;

  INSERT INTO public.booking_messages (booking_id, sender_id, sender_role, recipient_role, kind, content)
  VALUES (b.id, auth.uid(), 'admin', 'hiker', 'reschedule_decision',
    CASE WHEN p_approved THEN 'Reschedule approved. New hike date: ' || target_date::text
      ELSE 'Reschedule request declined. Reason: ' || COALESCE(clean_reason, 'The requested date is unavailable.') END);
  IF array_length(guide_user_ids, 1) IS NOT NULL THEN
    INSERT INTO public.booking_messages (booking_id, sender_id, sender_role, recipient_role, kind, content)
    VALUES (b.id, auth.uid(), 'admin', 'guide', 'reschedule_decision',
      CASE WHEN p_approved THEN 'The booking reschedule was approved. New hike date: ' || target_date::text
        ELSE 'The hiker reschedule request was declined. Reason: ' || COALESCE(clean_reason, 'The requested date is unavailable.') END);
  END IF;
  RETURN jsonb_build_object('bookingId', b.id, 'hikerUserId', b.user_id,
    'guideUserIds', guide_user_ids, 'newDate', CASE WHEN p_approved THEN target_date::text ELSE b.booking_date::text END,
    'approved', p_approved);
END $$;
REVOKE ALL ON FUNCTION public.admin_approve_booking_reschedule(uuid, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_approve_booking_reschedule(uuid, boolean, text) TO authenticated;

-- Allow the location admin's reschedule decision to reach the assigned guide
-- without exposing the hiker-to-admin conversation to unrelated guides.
DROP POLICY IF EXISTS bm_guide_recipient_select ON public.booking_messages;
CREATE POLICY bm_guide_recipient_select ON public.booking_messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.booking_assignments ba
      JOIN public.guides assigned_guide ON assigned_guide.id = ba.guide_id
      WHERE ba.booking_id = booking_messages.booking_id
        AND ba.status IN ('pending', 'accepted')
        AND assigned_guide.user_id = auth.uid()
    )
    AND (
      (sender_id = auth.uid() AND sender_role = 'guide')
      OR (sender_role = 'hiker' AND recipient_role = 'guide')
      OR (sender_role = 'guide' AND recipient_role = 'hiker')
      OR (sender_role = 'admin' AND recipient_role = 'guide')
    )
  );

NOTIFY pgrst, 'reload schema';
