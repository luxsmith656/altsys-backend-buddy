
-- ====== guide_off_duty_requests ======
CREATE TABLE IF NOT EXISTS public.guide_off_duty_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guide_id uuid NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  reason text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending',
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.guide_off_duty_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY god_admin_all ON public.guide_off_duty_requests
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));

CREATE POLICY god_guide_select ON public.guide_off_duty_requests
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.guides g WHERE g.id = guide_off_duty_requests.guide_id AND g.user_id = auth.uid()));

CREATE POLICY god_guide_insert ON public.guide_off_duty_requests
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.guides g WHERE g.id = guide_off_duty_requests.guide_id AND g.user_id = auth.uid()));

-- ====== booking_messages ======
CREATE TABLE IF NOT EXISTS public.booking_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL,
  sender_id uuid,
  sender_role text NOT NULL DEFAULT 'system',
  kind text NOT NULL DEFAULT 'chat',
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS booking_messages_booking_idx ON public.booking_messages(booking_id, created_at);
ALTER TABLE public.booking_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY bm_admin_all ON public.booking_messages
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));

CREATE POLICY bm_owner_select ON public.booking_messages
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = booking_messages.booking_id AND b.user_id = auth.uid()));

CREATE POLICY bm_owner_insert ON public.booking_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = booking_messages.booking_id AND b.user_id = auth.uid())
    AND sender_id = auth.uid()
  );

-- assigned guide can read the booking thread
CREATE POLICY bm_guide_select ON public.booking_messages
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.booking_assignments ba
    JOIN public.guides g ON g.id = ba.guide_id
    WHERE ba.booking_id = booking_messages.booking_id AND g.user_id = auth.uid()
  ));

-- ====== bookings additions ======
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS requested_new_date date;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS requested_at timestamptz;

-- ====== guide status auto-update trigger ======
CREATE OR REPLACE FUNCTION public.sync_guide_status_on_booking() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE g_id uuid;
BEGIN
  -- When booking becomes confirmed, mark assigned guide(s) as 'assigned'
  IF (TG_OP='UPDATE' AND NEW.status='confirmed' AND OLD.status<>'confirmed') THEN
    FOR g_id IN SELECT guide_id FROM public.booking_assignments WHERE booking_id = NEW.id LOOP
      UPDATE public.guides SET status='assigned', updated_at=now()
      WHERE id = g_id AND status NOT IN ('off_duty','on_duty');
    END LOOP;
  END IF;
  -- When confirmed booking is cancelled, free the guide(s) (only if not on_duty)
  IF (TG_OP='UPDATE' AND NEW.status='cancelled' AND OLD.status='confirmed') THEN
    FOR g_id IN SELECT guide_id FROM public.booking_assignments WHERE booking_id = NEW.id LOOP
      UPDATE public.guides SET status='available', updated_at=now()
      WHERE id = g_id AND status='assigned';
    END LOOP;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sync_guide_status ON public.bookings;
CREATE TRIGGER trg_sync_guide_status AFTER UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.sync_guide_status_on_booking();

-- ====== guide status when off-duty approved ======
CREATE OR REPLACE FUNCTION public.sync_guide_off_duty() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status='approved' AND CURRENT_DATE BETWEEN NEW.start_date AND NEW.end_date THEN
    UPDATE public.guides SET status='off_duty', updated_at=now() WHERE id=NEW.guide_id;
  END IF;
  IF NEW.status='rejected' AND OLD.status='approved' THEN
    UPDATE public.guides SET status='available', updated_at=now()
    WHERE id=NEW.guide_id AND status='off_duty';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sync_guide_off_duty ON public.guide_off_duty_requests;
CREATE TRIGGER trg_sync_guide_off_duty AFTER UPDATE ON public.guide_off_duty_requests
  FOR EACH ROW EXECUTE FUNCTION public.sync_guide_off_duty();
