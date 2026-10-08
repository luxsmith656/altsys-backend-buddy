-- Local-admin announcements require Central Admin approval before public delivery.
ALTER TABLE public.announcements
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'approved'
    CHECK (approval_status IN ('pending', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejection_reason text;

-- Existing central/global notices remain published. Location-scoped notices are
-- held for review so old local notices cannot silently bypass the new workflow.
UPDATE public.announcements
SET approval_status = CASE WHEN location_id IS NULL THEN 'approved' ELSE 'pending' END
WHERE approval_status = 'approved';

CREATE INDEX IF NOT EXISTS announcements_approval_created_idx
  ON public.announcements (approval_status, created_at DESC);

DROP POLICY IF EXISTS "announcements_public_read" ON public.announcements;
CREATE POLICY "announcements_public_read"
  ON public.announcements FOR SELECT
  USING (
    approval_status = 'approved'
    OR EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = 'super_admin'
    )
  );
