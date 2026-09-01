-- Store only hashed, short-lived email OTP challenges used by the signup flow.
CREATE TABLE IF NOT EXISTS public.email_otp_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS email_otp_challenges_email_idx
  ON public.email_otp_challenges (email, created_at DESC);

ALTER TABLE public.email_otp_challenges ENABLE ROW LEVEL SECURITY;
