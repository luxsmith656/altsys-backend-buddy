-- Durable announcement lifecycle and role/location-aware delivery.
-- Announcements remain queryable as history, but deleted rows are never
-- publicly visible and their inbox notifications are removed as well.

ALTER TABLE public.announcements
  ADD COLUMN IF NOT EXISTS lifecycle_status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

UPDATE public.announcements
SET lifecycle_status = CASE
  WHEN lifecycle_status IS NULL THEN 'active'
  ELSE lifecycle_status
END
WHERE lifecycle_status IS NULL;

ALTER TABLE public.announcements
  DROP CONSTRAINT IF EXISTS announcements_lifecycle_status_check;
ALTER TABLE public.announcements
  ADD CONSTRAINT announcements_lifecycle_status_check
  CHECK (lifecycle_status IN ('active', 'archived', 'deleted'));

CREATE INDEX IF NOT EXISTS announcements_lifecycle_created_idx
  ON public.announcements(lifecycle_status, created_at DESC);

DROP POLICY IF EXISTS "announcements_public_read" ON public.announcements;
CREATE POLICY "announcements_public_read"
  ON public.announcements FOR SELECT
  USING (
    lifecycle_status <> 'deleted'
    AND approval_status = 'approved'
  );

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

DROP TRIGGER IF EXISTS announcements_notify_recipients ON public.announcements;
CREATE TRIGGER announcements_notify_recipients
  AFTER INSERT OR UPDATE OF approval_status, lifecycle_status ON public.announcements
  FOR EACH ROW EXECUTE FUNCTION public.notify_announcement_recipients();

CREATE OR REPLACE FUNCTION public.remove_announcement_notifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.app_notifications
  WHERE type = 'announcement'
    AND link = '/notifications?announcementId=' || OLD.id::text;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS announcements_remove_notifications ON public.announcements;
CREATE TRIGGER announcements_remove_notifications
  AFTER DELETE ON public.announcements
  FOR EACH ROW
  EXECUTE FUNCTION public.remove_announcement_notifications();

DROP TRIGGER IF EXISTS announcements_remove_deleted_notifications ON public.announcements;
CREATE TRIGGER announcements_remove_deleted_notifications
  AFTER UPDATE OF lifecycle_status ON public.announcements
  FOR EACH ROW
  WHEN (NEW.lifecycle_status = 'deleted')
  EXECUTE FUNCTION public.remove_announcement_notifications();
