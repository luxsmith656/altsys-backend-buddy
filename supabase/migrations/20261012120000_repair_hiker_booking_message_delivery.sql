-- Ensure hikers can receive admin booking messages even when an older client
-- wrote the row before recipient_role was introduced. New writes should still
-- set recipient_role explicitly; the legacy branch is limited to the hiker's
-- own booking by the owner check.
ALTER TABLE public.booking_messages
  ADD COLUMN IF NOT EXISTS recipient_role text;

DROP POLICY IF EXISTS bm_hiker_conversation_select ON public.booking_messages;
CREATE POLICY bm_hiker_conversation_select ON public.booking_messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.bookings b
      WHERE b.id = booking_messages.booking_id
        AND b.user_id = auth.uid()
    )
    AND (
      sender_id = auth.uid()
      OR recipient_role = 'hiker'
      OR (
        recipient_role IS NULL
        AND sender_role IN ('system', 'admin')
      )
    )
  );

NOTIFY pgrst, 'reload schema';
