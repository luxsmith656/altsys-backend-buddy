-- Guide first-login profile completion. Photos remain in external storage;
-- guides.photo_url stores only the optimized public URL.
ALTER TABLE public.guides
  ADD COLUMN IF NOT EXISTS sex text,
  ADD COLUMN IF NOT EXISTS age integer,
  ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz;

CREATE INDEX IF NOT EXISTS guides_onboarding_idx
  ON public.guides (user_id, onboarding_completed_at);
