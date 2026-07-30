-- Keep participant tracking private while allowing staff to monitor only their assigned trailhead.
DROP POLICY IF EXISTS "hs_admin_all" ON public.hiker_sessions;
DROP POLICY IF EXISTS "hs_staff_scope_all" ON public.hiker_sessions;

CREATE POLICY "hs_staff_scope_all"
ON public.hiker_sessions
FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin')
  OR (
    (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'ranger'))
    AND EXISTS (
      SELECT 1
      FROM public.user_locations ul
      WHERE ul.user_id = auth.uid()
        AND ul.location_id = COALESCE(
          hiker_sessions.location_id,
          (SELECT b.location_id FROM public.bookings b WHERE b.id = hiker_sessions.booking_id)
        )
    )
  )
)
WITH CHECK (
  public.has_role(auth.uid(), 'super_admin')
  OR (
    (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'ranger'))
    AND EXISTS (
      SELECT 1
      FROM public.user_locations ul
      WHERE ul.user_id = auth.uid()
        AND ul.location_id = COALESCE(
          hiker_sessions.location_id,
          (SELECT b.location_id FROM public.bookings b WHERE b.id = hiker_sessions.booking_id)
        )
    )
  )
);

DROP POLICY IF EXISTS "hl_admin_select" ON public.hiker_locations;
DROP POLICY IF EXISTS "hl_staff_scope_select" ON public.hiker_locations;

CREATE POLICY "hl_staff_scope_select"
ON public.hiker_locations
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin')
  OR (
    (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'ranger'))
    AND EXISTS (
      SELECT 1
      FROM public.hiker_sessions hs
      JOIN public.user_locations ul
        ON ul.user_id = auth.uid()
       AND ul.location_id = COALESCE(
         hs.location_id,
         (SELECT b.location_id FROM public.bookings b WHERE b.id = hs.booking_id)
       )
      WHERE hs.id = hiker_locations.session_id
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_hiker_sessions_booking_status
  ON public.hiker_sessions(booking_id, status);
