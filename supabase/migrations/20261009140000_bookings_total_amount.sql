-- Walk-in and online receipts persist the quoted total on bookings.
-- Safe to rerun and compatible with older hosted projects.
ALTER TABLE IF EXISTS public.bookings
  ADD COLUMN IF NOT EXISTS total_amount numeric(12, 2);

NOTIFY pgrst, 'reload schema';
