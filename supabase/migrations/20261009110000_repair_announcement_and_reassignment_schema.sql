-- Repair migration for hosted projects where the earlier workflow migrations
-- were committed but not applied. Every statement is safe to rerun.

ALTER TABLE IF EXISTS public.announcements
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejection_reason text;

DO $$
BEGIN
  IF to_regclass('public.announcements') IS NOT NULL THEN
    UPDATE public.announcements
    SET approval_status = CASE WHEN location_id IS NULL THEN 'approved' ELSE 'pending' END
    WHERE approval_status IS NULL;
    CREATE INDEX IF NOT EXISTS announcements_approval_created_idx
      ON public.announcements (approval_status, created_at DESC);
  END IF;
END $$;

ALTER TABLE IF EXISTS public.booking_assignments
  ADD COLUMN IF NOT EXISTS reassignment_reason text,
  ADD COLUMN IF NOT EXISTS replaced_by uuid,
  ADD COLUMN IF NOT EXISTS replaces uuid;

ALTER TABLE IF EXISTS public.booking_messages
  ADD COLUMN IF NOT EXISTS recipient_role text;

DO $$
BEGIN
  IF to_regclass('public.booking_messages') IS NOT NULL THEN
    ALTER TABLE public.booking_messages
      DROP CONSTRAINT IF EXISTS booking_messages_recipient_role_check;
    ALTER TABLE public.booking_messages
      ADD CONSTRAINT booking_messages_recipient_role_check
      CHECK (recipient_role IS NULL OR recipient_role IN ('hiker', 'guide', 'admin'));
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
