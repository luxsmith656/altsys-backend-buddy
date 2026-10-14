-- Unified durable notification payload and chat delivery.
-- The client reads only app_notifications; booking_messages remains the
-- conversation source and this trigger creates its durable inbox entry.

ALTER TABLE public.app_notifications
  ADD COLUMN IF NOT EXISTS sender_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'system',
  ADD COLUMN IF NOT EXISTS reference_id uuid;

CREATE INDEX IF NOT EXISTS app_notifications_user_read_created_idx
  ON public.app_notifications(user_id, read, created_at DESC);
CREATE INDEX IF NOT EXISTS app_notifications_reference_idx
  ON public.app_notifications(reference_id);

CREATE OR REPLACE FUNCTION public.normalize_app_notification_type()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.type = 'system' AND NEW.category <> 'system' THEN
    NEW.type := NEW.category;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS app_notifications_normalize_type ON public.app_notifications;
CREATE TRIGGER app_notifications_normalize_type
  BEFORE INSERT ON public.app_notifications
  FOR EACH ROW EXECUTE FUNCTION public.normalize_app_notification_type();

CREATE OR REPLACE FUNCTION public.create_app_notification(
  p_user_id uuid,
  p_title text,
  p_body text DEFAULT '',
  p_category text DEFAULT 'system',
  p_link text DEFAULT NULL,
  p_booking_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_id uuid := auth.uid();
  notification_id uuid;
BEGIN
  IF caller_id IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  IF p_user_id IS NULL OR nullif(trim(p_title), '') IS NULL THEN RAISE EXCEPTION 'Notification recipient and title are required' USING ERRCODE = '22023'; END IF;
  IF p_category NOT IN ('announcement', 'booking', 'system', 'alert') THEN RAISE EXCEPTION 'Invalid notification category' USING ERRCODE = '22023'; END IF;
  IF caller_id <> p_user_id AND NOT EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.id = p_booking_id AND (
      public.has_role(caller_id, 'super_admin'::public.app_role)
      OR b.user_id = caller_id
      OR EXISTS (SELECT 1 FROM public.user_locations ul WHERE ul.user_id = caller_id AND ul.location_id = b.location_id)
      OR EXISTS (SELECT 1 FROM public.booking_assignments ba JOIN public.guides g ON g.id = ba.guide_id WHERE ba.booking_id = b.id AND g.user_id = caller_id)
      OR EXISTS (SELECT 1 FROM public.booking_messages bm WHERE bm.booking_id = b.id AND bm.sender_id = caller_id AND bm.created_at > now() - interval '10 minutes')
    )
  ) THEN RAISE EXCEPTION 'Notification is not authorized for this booking' USING ERRCODE = '42501'; END IF;

  INSERT INTO public.app_notifications(user_id, sender_id, type, reference_id, title, body, category, link)
  VALUES (p_user_id, caller_id, p_category, p_booking_id, trim(p_title), coalesce(p_body, ''), p_category, p_link)
  RETURNING id INTO notification_id;
  RETURN notification_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_booking_message_recipient()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  booking_row public.bookings%ROWTYPE;
  notification_title text := CASE
    WHEN NEW.kind = 'reschedule_request' THEN 'Booking reschedule request'
    WHEN NEW.kind = 'reassignment_request' THEN 'Guide reassignment request'
    ELSE 'New message from ' || initcap(coalesce(NEW.sender_role, 'user'))
  END;
  notification_body text := left(coalesce(nullif(trim(NEW.content), ''), 'You have a new message about a booking.'), 240);
BEGIN
  IF NEW.recipient_role IS NULL OR (NEW.kind = 'system' AND NEW.sender_role IN ('guide', 'system')) THEN RETURN NEW; END IF;
  SELECT * INTO booking_row FROM public.bookings WHERE id = NEW.booking_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  IF NEW.recipient_role = 'hiker' AND booking_row.user_id IS DISTINCT FROM NEW.sender_id THEN
    INSERT INTO public.app_notifications(user_id, sender_id, type, reference_id, title, body, category, link)
    VALUES (booking_row.user_id, NEW.sender_id, 'chat', NEW.id, notification_title, notification_body, 'booking', '/hiker?bookingId=' || NEW.booking_id::text);
  ELSIF NEW.recipient_role = 'guide' THEN
    INSERT INTO public.app_notifications(user_id, sender_id, type, reference_id, title, body, category, link)
    SELECT DISTINCT guide.user_id, NEW.sender_id, 'chat', NEW.id, notification_title, notification_body, 'booking', '/guide?bookingId=' || NEW.booking_id::text
    FROM public.booking_assignments assignment JOIN public.guides guide ON guide.id = assignment.guide_id
    WHERE assignment.booking_id = NEW.booking_id AND assignment.status IN ('pending', 'accepted') AND guide.user_id IS NOT NULL AND guide.user_id IS DISTINCT FROM NEW.sender_id;
  ELSIF NEW.recipient_role = 'admin' THEN
    INSERT INTO public.app_notifications(user_id, sender_id, type, reference_id, title, body, category, link)
    SELECT DISTINCT user_role.user_id, NEW.sender_id, 'chat', NEW.id, notification_title, notification_body, 'booking', '/admin?tab=requests&bookingId=' || NEW.booking_id::text
    FROM public.user_roles user_role LEFT JOIN public.user_locations user_location ON user_location.user_id = user_role.user_id
    WHERE user_role.user_id IS DISTINCT FROM NEW.sender_id
      AND (user_role.role = 'super_admin' OR (user_role.role = 'admin' AND user_location.location_id = booking_row.location_id));
  ELSIF NEW.recipient_role = 'ranger' THEN
    INSERT INTO public.app_notifications(user_id, sender_id, type, reference_id, title, body, category, link)
    SELECT DISTINCT user_role.user_id, NEW.sender_id, 'chat', NEW.id, notification_title, notification_body, 'booking', '/ranger?bookingId=' || NEW.booking_id::text
    FROM public.user_roles user_role
    LEFT JOIN public.user_locations user_location ON user_location.user_id = user_role.user_id
    WHERE user_role.role = 'ranger'
      AND user_role.user_id IS DISTINCT FROM NEW.sender_id
      AND user_location.location_id = booking_row.location_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS booking_message_notification_after_insert ON public.booking_messages;
CREATE TRIGGER booking_message_notification_after_insert
  AFTER INSERT ON public.booking_messages
  FOR EACH ROW EXECUTE FUNCTION public.notify_booking_message_recipient();

-- A new booking is an actionable dispatch item for the responsible local
-- administrators and central dispatch. This is intentionally a separate
-- trigger so the hiker's own booking list is not treated as a notification.
CREATE OR REPLACE FUNCTION public.notify_new_booking_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.app_notifications(user_id, sender_id, type, reference_id, title, body, category, link)
  SELECT DISTINCT user_role.user_id, NEW.user_id, 'booking', NEW.id,
    'New booking request',
    'A new hike booking for ' || to_char(NEW.booking_date, 'Mon DD, YYYY') || ' needs guide assignment.',
    'booking', '/admin?tab=requests&bookingId=' || NEW.id::text
  FROM public.user_roles user_role
  LEFT JOIN public.user_locations user_location ON user_location.user_id = user_role.user_id
  WHERE user_role.user_id IS DISTINCT FROM NEW.user_id
    AND (user_role.role = 'super_admin' OR (user_role.role = 'admin' AND user_location.location_id = NEW.location_id));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS booking_request_notification_after_insert ON public.bookings;
CREATE TRIGGER booking_request_notification_after_insert
  AFTER INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.notify_new_booking_request();

-- Support the ranger audience for installations that use Ranger as a booking
-- participant. Existing clients remain compatible with the wider constraint.
ALTER TABLE public.booking_messages DROP CONSTRAINT IF EXISTS booking_messages_recipient_role_check;
ALTER TABLE public.booking_messages ADD CONSTRAINT booking_messages_recipient_role_check
  CHECK (recipient_role IS NULL OR recipient_role IN ('hiker', 'guide', 'admin', 'ranger'));

DROP POLICY IF EXISTS bm_ranger_recipient_select ON public.booking_messages;
CREATE POLICY bm_ranger_recipient_select ON public.booking_messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.bookings b ON b.id = booking_messages.booking_id
      WHERE ur.user_id = auth.uid() AND ur.role = 'ranger'
        AND EXISTS (SELECT 1 FROM public.user_locations ul WHERE ul.user_id = auth.uid() AND ul.location_id = b.location_id)
    )
    AND (sender_id = auth.uid() OR recipient_role = 'ranger' OR (sender_role = 'ranger' AND recipient_role = 'hiker'))
  );

DROP POLICY IF EXISTS bm_ranger_insert ON public.booking_messages;
CREATE POLICY bm_ranger_insert ON public.booking_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid() AND sender_role = 'ranger' AND recipient_role IN ('hiker', 'admin')
    AND EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = booking_messages.booking_id
        AND EXISTS (SELECT 1 FROM public.user_locations ul WHERE ul.user_id = auth.uid() AND ul.location_id = b.location_id)
    )
  );
