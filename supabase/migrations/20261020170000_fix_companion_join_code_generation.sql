-- Keep booking inserts independent of the pgcrypto extension search path.
-- The previous trigger called gen_random_bytes(6) unqualified, which can fail
-- in hosted databases where pgcrypto is installed outside public.

CREATE OR REPLACE FUNCTION public.generate_companion_join_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(NEW.group_size, 1) > 1
     AND NULLIF(trim(NEW.companion_join_code), '') IS NULL THEN
    NEW.companion_join_code := upper(substr(
      md5(random()::text || clock_timestamp()::text || coalesce(NEW.id::text, '')),
      1,
      10
    ));
  END IF;
  RETURN NEW;
END;
$$;

-- Repair rows that were created before the trigger was corrected.
UPDATE public.bookings
SET companion_join_code = upper(substr(
  md5(random()::text || clock_timestamp()::text || id::text),
  1,
  10
))
WHERE COALESCE(group_size, 1) > 1
  AND NULLIF(trim(companion_join_code), '') IS NULL;
