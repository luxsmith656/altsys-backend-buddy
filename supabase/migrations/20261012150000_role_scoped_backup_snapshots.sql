-- Idempotent, role-owned operational backup snapshots.
-- The snapshot is an additional recovery copy; it never replaces live rows.
CREATE TABLE IF NOT EXISTS public.backup_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scope_role text NOT NULL CHECK (scope_role = 'super_admin'),
  location_ids uuid[] NOT NULL DEFAULT '{}',
  fingerprint text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, fingerprint)
);

ALTER TABLE public.backup_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS backup_snapshots_owner_select ON public.backup_snapshots;
CREATE POLICY backup_snapshots_owner_select ON public.backup_snapshots
  FOR SELECT TO authenticated
  USING (owner_id = auth.uid());

DROP POLICY IF EXISTS backup_snapshots_owner_insert ON public.backup_snapshots;
CREATE POLICY backup_snapshots_owner_insert ON public.backup_snapshots
  FOR INSERT TO authenticated
  WITH CHECK (
    owner_id = auth.uid()
    AND public.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

DROP POLICY IF EXISTS backup_snapshots_owner_update ON public.backup_snapshots;
CREATE POLICY backup_snapshots_owner_update ON public.backup_snapshots
  FOR UPDATE TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

ALTER TABLE public.backup_snapshots
  DROP CONSTRAINT IF EXISTS backup_snapshots_scope_role_check;
DELETE FROM public.backup_snapshots WHERE scope_role <> 'super_admin';
ALTER TABLE public.backup_snapshots
  ADD CONSTRAINT backup_snapshots_scope_role_check CHECK (scope_role = 'super_admin');

DROP POLICY IF EXISTS backup_snapshots_owner_delete ON public.backup_snapshots;
CREATE POLICY backup_snapshots_owner_delete ON public.backup_snapshots
  FOR DELETE TO authenticated
  USING (owner_id = auth.uid());

CREATE INDEX IF NOT EXISTS backup_snapshots_owner_updated_idx
  ON public.backup_snapshots(owner_id, updated_at DESC);

DROP TRIGGER IF EXISTS backup_snapshots_updated_at ON public.backup_snapshots;
CREATE TRIGGER backup_snapshots_updated_at
  BEFORE UPDATE ON public.backup_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
