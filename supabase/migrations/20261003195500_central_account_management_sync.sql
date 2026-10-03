-- Migration: 20261003195500_central_account_management_sync.sql
-- Description: Synchronize Central Account Management edits to DB tables (profiles, user_locations, guides)
-- Ensures Super Admin (Central) and Local Admins have full permissions to update profile info, station assignment, and active status.

-- 1. Ensure profiles table has admin update and insert policies
DO $$
BEGIN
  -- Drop existing conflicting update policies if any
  IF EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
      AND tablename = 'profiles' 
      AND policyname = 'profiles_admin_update'
  ) THEN
    DROP POLICY "profiles_admin_update" ON public.profiles;
  END IF;

  -- Create permissive admin update policy
  CREATE POLICY "profiles_admin_update" ON public.profiles
    FOR UPDATE TO authenticated
    USING (
      public.has_role(auth.uid(), 'super_admin') 
      OR public.has_role(auth.uid(), 'admin')
    )
    WITH CHECK (
      public.has_role(auth.uid(), 'super_admin') 
      OR public.has_role(auth.uid(), 'admin')
    );

  -- Drop existing admin insert policy if any
  IF EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
      AND tablename = 'profiles' 
      AND policyname = 'profiles_admin_insert'
  ) THEN
    DROP POLICY "profiles_admin_insert" ON public.profiles;
  END IF;

  -- Create permissive admin insert policy
  CREATE POLICY "profiles_admin_insert" ON public.profiles
    FOR INSERT TO authenticated
    WITH CHECK (
      public.has_role(auth.uid(), 'super_admin') 
      OR public.has_role(auth.uid(), 'admin')
      OR auth.uid() = user_id
    );
END $$;

-- 2. Ensure user_locations can be managed by super_admin and admin
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
      AND tablename = 'user_locations' 
      AND policyname = 'ul_admin_manage'
  ) THEN
    CREATE POLICY "ul_admin_manage" ON public.user_locations
      FOR ALL TO authenticated
      USING (
        public.has_role(auth.uid(), 'super_admin') 
        OR public.has_role(auth.uid(), 'admin')
      )
      WITH CHECK (
        public.has_role(auth.uid(), 'super_admin') 
        OR public.has_role(auth.uid(), 'admin')
      );
  END IF;
END $$;

-- 3. Verify is_active column on profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- 4. Reload schema cache notification
NOTIFY pgrst, 'reload schema';
