-- Durable in-app notifications backed by Supabase Realtime.
-- Firebase/Firestore is not required for booking, chat, SOS, or assignment alerts.

CREATE TABLE IF NOT EXISTS public.app_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (length(trim(title)) > 0),
  body text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'system' CHECK (category IN ('announcement', 'booking', 'system', 'alert')),
  link text,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS app_notifications_user_created_idx
  ON public.app_notifications(user_id, created_at DESC);

ALTER TABLE public.app_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS app_notifications_self_select ON public.app_notifications;
CREATE POLICY app_notifications_self_select ON public.app_notifications
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS app_notifications_self_update ON public.app_notifications;
CREATE POLICY app_notifications_self_update ON public.app_notifications
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS app_notifications_self_delete ON public.app_notifications;
CREATE POLICY app_notifications_self_delete ON public.app_notifications
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

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
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF p_user_id IS NULL OR nullif(trim(p_title), '') IS NULL THEN
    RAISE EXCEPTION 'Notification recipient and title are required' USING ERRCODE = '22023';
  END IF;

  IF p_category NOT IN ('announcement', 'booking', 'system', 'alert') THEN
    RAISE EXCEPTION 'Invalid notification category' USING ERRCODE = '22023';
  END IF;

  -- A user may always create a notification for their own account. Cross-user
  -- delivery must be tied to a booking the caller can legitimately operate.
  IF caller_id <> p_user_id AND NOT EXISTS (
    SELECT 1
    FROM public.bookings b
    WHERE b.id = p_booking_id
      AND (
        public.has_role(caller_id, 'super_admin'::public.app_role)
        OR b.user_id = caller_id
        OR EXISTS (
          SELECT 1
          FROM public.user_locations ul
          WHERE ul.user_id = caller_id
            AND ul.location_id = b.location_id
        )
        OR EXISTS (
          SELECT 1
          FROM public.booking_assignments ba
          JOIN public.guides g ON g.id = ba.guide_id
          WHERE ba.booking_id = b.id
            AND g.user_id = caller_id
        )
        OR EXISTS (
          SELECT 1
          FROM public.booking_messages bm
          WHERE bm.booking_id = b.id
            AND bm.sender_id = caller_id
            AND bm.created_at > now() - interval '10 minutes'
        )
      )
  ) THEN
    RAISE EXCEPTION 'Notification is not authorized for this booking' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.app_notifications(user_id, title, body, category, link)
  VALUES (p_user_id, trim(p_title), coalesce(p_body, ''), p_category, p_link)
  RETURNING id INTO notification_id;

  RETURN notification_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_app_notification(uuid, text, text, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_app_notification(uuid, text, text, text, text, uuid) TO authenticated;

DO $$
BEGIN
  IF to_regclass('public.app_notifications') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = 'app_notifications'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.app_notifications;
  END IF;
END;
$$;
