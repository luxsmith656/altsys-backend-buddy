-- Booking conversations must stream immediately to open and closed chat views.
DO $$
BEGIN
  IF to_regclass('public.booking_messages') IS NOT NULL
     AND EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1
       FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = 'booking_messages'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.booking_messages;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
