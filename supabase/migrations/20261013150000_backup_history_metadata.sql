-- Add queryable metadata for compact Central Admin backup history.
-- This is a forward-only upgrade for installations that already applied the
-- original role-scoped backup snapshot migration.
ALTER TABLE public.backup_snapshots
  ADD COLUMN IF NOT EXISTS exported_at timestamptz,
  ADD COLUMN IF NOT EXISTS payload_encoding text,
  ADD COLUMN IF NOT EXISTS payload_bytes integer;

UPDATE public.backup_snapshots
SET exported_at = COALESCE(exported_at, NULLIF(payload->>'exportedAt', '')::timestamptz, created_at),
    payload_encoding = COALESCE(payload_encoding, NULLIF(payload->>'encoding', ''), 'json'),
    payload_bytes = COALESCE(payload_bytes, length(COALESCE(payload->>'data', payload::text)))
WHERE exported_at IS NULL OR payload_encoding IS NULL OR payload_bytes IS NULL;

ALTER TABLE public.backup_snapshots
  ALTER COLUMN exported_at SET DEFAULT now(),
  ALTER COLUMN exported_at SET NOT NULL,
  ALTER COLUMN payload_encoding SET DEFAULT 'gzip+base64',
  ALTER COLUMN payload_encoding SET NOT NULL,
  ALTER COLUMN payload_bytes SET DEFAULT 0,
  ALTER COLUMN payload_bytes SET NOT NULL;

CREATE INDEX IF NOT EXISTS backup_snapshots_owner_exported_idx
  ON public.backup_snapshots(owner_id, exported_at DESC);
