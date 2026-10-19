-- Keep guide referral links usable for every guide, including guides created
-- after the original backfill migration ran.

CREATE OR REPLACE FUNCTION public.ensure_guide_referral_code()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  candidate text;
BEGIN
  IF NEW.referral_code IS NULL OR btrim(NEW.referral_code) = '' THEN
    candidate := 'KALI-' || upper(left(replace(NEW.id::text, '-', ''), 8));
    NEW.referral_code := candidate;
  ELSE
    NEW.referral_code := upper(btrim(NEW.referral_code));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ensure_guide_referral_code_before_write ON public.guides;
CREATE TRIGGER ensure_guide_referral_code_before_write
BEFORE INSERT OR UPDATE OF referral_code ON public.guides
FOR EACH ROW
EXECUTE FUNCTION public.ensure_guide_referral_code();

-- Repair rows created before the trigger existed. The conditional update is
-- deliberately idempotent and does not overwrite an existing custom code.
UPDATE public.guides
SET referral_code = 'KALI-' || upper(left(replace(id::text, '-', ''), 8))
WHERE referral_code IS NULL OR btrim(referral_code) = '';

CREATE UNIQUE INDEX IF NOT EXISTS guides_referral_code_unique_idx
  ON public.guides (referral_code)
  WHERE referral_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS bookings_referral_guide_id_idx
  ON public.bookings (referral_guide_id);
