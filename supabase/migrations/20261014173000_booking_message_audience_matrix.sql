-- Complete the booking-chat audience matrix without changing the visible
-- conversation rows. Hiker/guide messages are also surfaced to dispatch so
-- local and central admins can act on booking communication in real time.

CREATE OR REPLACE FUNCTION public.notify_booking_message_dispatch_copy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  booking_row public.bookings%ROWTYPE;
  message_title text := 'New message from ' || initcap(coalesce(NEW.sender_role, 'user'));
  message_body text := left(coalesce(nullif(trim(NEW.content), ''), 'You have a new message about a booking.'), 240);
BEGIN
  IF NEW.recipient_role NOT IN ('guide', 'hiker') OR NEW.sender_role NOT IN ('hiker', 'guide') THEN
    RETURN NEW;
  END IF;

  SELECT * INTO booking_row FROM public.bookings WHERE id = NEW.booking_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  INSERT INTO public.app_notifications(user_id, sender_id, type, reference_id, title, body, category, link)
  SELECT DISTINCT
    user_role.user_id,
    NEW.sender_id,
    'chat',
    NEW.id,
    message_title,
    message_body,
    'booking',
    '/admin?tab=requests&bookingId=' || NEW.booking_id::text
  FROM public.user_roles user_role
  LEFT JOIN public.user_locations user_location ON user_location.user_id = user_role.user_id
  WHERE user_role.user_id IS DISTINCT FROM NEW.sender_id
    AND (user_role.role = 'super_admin'
      OR (user_role.role = 'admin' AND user_location.location_id = booking_row.location_id))
    AND NOT EXISTS (
      SELECT 1 FROM public.app_notifications existing
      WHERE existing.user_id = user_role.user_id
        AND existing.type = 'chat'
        AND existing.reference_id = NEW.id
    );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS booking_message_dispatch_copy_after_insert ON public.booking_messages;
CREATE TRIGGER booking_message_dispatch_copy_after_insert
  AFTER INSERT ON public.booking_messages
  FOR EACH ROW EXECUTE FUNCTION public.notify_booking_message_dispatch_copy();
