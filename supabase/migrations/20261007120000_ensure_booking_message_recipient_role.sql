-- Repair installations where the conversation audience migration was skipped
-- or the database schema cache was not refreshed after the column was added.
ALTER TABLE public.booking_messages
  ADD COLUMN IF NOT EXISTS recipient_role text;

ALTER TABLE public.booking_messages
  DROP CONSTRAINT IF EXISTS booking_messages_recipient_role_check;
ALTER TABLE public.booking_messages
  ADD CONSTRAINT booking_messages_recipient_role_check
  CHECK (recipient_role IS NULL OR recipient_role IN ('hiker', 'guide', 'admin'));

DROP POLICY IF EXISTS bm_owner_select ON public.booking_messages;
DROP POLICY IF EXISTS bm_owner_insert ON public.booking_messages;
DROP POLICY IF EXISTS bm_guide_select ON public.booking_messages;
DROP POLICY IF EXISTS bm_guide_insert ON public.booking_messages;
DROP POLICY IF EXISTS bm_guide_recipient_select ON public.booking_messages;
DROP POLICY IF EXISTS bm_hiker_conversation_select ON public.booking_messages;
DROP POLICY IF EXISTS bm_hiker_conversation_insert ON public.booking_messages;

CREATE POLICY bm_hiker_conversation_select ON public.booking_messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = booking_messages.booking_id AND b.user_id = auth.uid()
    )
    AND (
      sender_id = auth.uid()
      OR recipient_role = 'hiker'
      OR (recipient_role IS NULL AND sender_role = 'system')
    )
  );

CREATE POLICY bm_hiker_conversation_insert ON public.booking_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND sender_role = 'hiker'
    AND recipient_role IN ('guide', 'admin')
    AND EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = booking_messages.booking_id AND b.user_id = auth.uid()
    )
  );

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
    )
  );

CREATE POLICY bm_guide_insert ON public.booking_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND sender_role = 'guide'
    AND recipient_role IN ('hiker', 'admin')
    AND public.guide_can_manage_booking(booking_id)
  );

NOTIFY pgrst, 'reload schema';
