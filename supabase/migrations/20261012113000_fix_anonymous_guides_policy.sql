-- Public guide cards are read by the landing page before login. The previous
-- policy called has_role(auth.uid(), ...) for anon, but has_role is intentionally
-- not executable by anon, so PostgREST returned 401 instead of guide rows.
-- Keep admin access on the authenticated policies and make this public policy
-- safe for anonymous requests without weakening the active-guide boundary.
CREATE OR REPLACE FUNCTION public.is_admin_account(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND ur.role IN ('admin'::public.app_role, 'super_admin'::public.app_role)
  );
$$;

REVOKE ALL ON FUNCTION public.is_admin_account(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin_account(uuid) TO anon, authenticated;

DROP POLICY IF EXISTS guides_public_read ON public.guides;
CREATE POLICY guides_public_read ON public.guides
  FOR SELECT
  USING (
    is_active = true
    AND NOT public.is_admin_account(auth.uid())
  );
