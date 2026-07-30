-- A participant may update an authorized session while recording, but only
-- trail staff may create or add the authorization token that starts tracking.
CREATE OR REPLACE FUNCTION public.protect_admin_checkin_token()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  token_was_added boolean;
  caller_is_staff boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    token_was_added := NEW.client_session_id LIKE 'admin-checkin:%';
  ELSE
    token_was_added :=
      NEW.client_session_id LIKE 'admin-checkin:%'
      AND OLD.client_session_id IS DISTINCT FROM NEW.client_session_id;
  END IF;

  IF NOT token_was_added THEN
    RETURN NEW;
  END IF;

  caller_is_staff :=
    public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'ranger');

  IF NOT caller_is_staff THEN
    RAISE EXCEPTION 'Only trail staff can authorize a live tracking session';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_admin_checkin_token_trigger
  ON public.hiker_sessions;

CREATE TRIGGER protect_admin_checkin_token_trigger
BEFORE INSERT OR UPDATE OF client_session_id
ON public.hiker_sessions
FOR EACH ROW
EXECUTE FUNCTION public.protect_admin_checkin_token();
