REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO service_role;