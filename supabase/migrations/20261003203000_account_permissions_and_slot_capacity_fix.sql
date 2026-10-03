-- =============================================================================
-- Migration: 20261003203000_account_permissions_and_slot_capacity_fix.sql
-- Description:
-- 1. Grant execute on public.get_booking_slot_capacity to anon, authenticated, service_role
--    so guest hikers can view live start-time capacity without getting blocked.
-- 2. Ensure super_admin role for central administrator account.
-- 3. Ensure profiles and user_locations allow management by central/local admins.
-- =============================================================================

-- 1. Grant execute on slot capacity aggregator to anon and authenticated
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'get_booking_slot_capacity'
  ) THEN
    GRANT EXECUTE ON FUNCTION public.get_booking_slot_capacity(date, date) TO anon, authenticated, service_role;
  END IF;
END $$;

-- 2. Ensure central admin user has super_admin role in user_roles
DO $$
DECLARE
  v_central_id uuid;
BEGIN
  SELECT id INTO v_central_id
  FROM auth.users
  WHERE lower(email) = 'central@kalisungan.ph'
  LIMIT 1;

  IF v_central_id IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (v_central_id, 'super_admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
END $$;

-- 3. Ensure profiles policies allow admin and super_admin upserts
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'profiles_admin_all'
  ) THEN
    CREATE POLICY profiles_admin_all ON public.profiles
      FOR ALL
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = auth.uid()
            AND ur.role IN ('super_admin', 'admin')
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = auth.uid()
            AND ur.role IN ('super_admin', 'admin')
        )
      );
  END IF;
END $$;

-- 4. Ensure user_locations policies allow admin and super_admin management
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_locations' AND policyname = 'user_locations_admin_all'
  ) THEN
    CREATE POLICY user_locations_admin_all ON public.user_locations
      FOR ALL
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = auth.uid()
            AND ur.role IN ('super_admin', 'admin')
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = auth.uid()
            AND ur.role IN ('super_admin', 'admin')
        )
      );
  END IF;
END $$;
