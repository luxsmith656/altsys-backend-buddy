-- ==============================================================================
-- MT. KALISUNGAN TOURISM SYSTEM: CENTRAL UPGRADES & DATABASE CONSISTENCY
-- Migration: 20261003190000_central_announcements_and_guide_capacity.sql
-- Idempotent: safe to run multiple times.
-- ==============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. SYSTEM SETTINGS: PERSIST DYNAMIC PRICING & GUIDE CAPACITY RATIO (maxPaxPerGuide)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.system_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "system_settings_public_read" ON public.system_settings;
CREATE POLICY "system_settings_public_read"
  ON public.system_settings FOR SELECT USING (true);

DROP POLICY IF EXISTS "system_settings_admin_write" ON public.system_settings;
CREATE POLICY "system_settings_admin_write"
  ON public.system_settings FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role IN ('super_admin', 'admin')
    )
  );

-- Ensure default pricing configuration has maxPaxPerGuide: 5
INSERT INTO public.system_settings (key, value, updated_at)
VALUES (
  'pricing_config',
  '{
    "entryFee": 30,
    "envFee": 20,
    "guideFeeMorning": 800,
    "guideFeeNight": 1000,
    "guideFeeOvernight": 1600,
    "peakExtensionFeePerHour": 100,
    "horseEmergencyFee": 500,
    "horseHighStationFee": 1000,
    "maxPaxPerGuide": 5
  }'::jsonb,
  now()
)
ON CONFLICT (key) DO UPDATE
SET value = jsonb_set(
  public.system_settings.value,
  '{maxPaxPerGuide}',
  COALESCE(public.system_settings.value->'maxPaxPerGuide', '5'::jsonb),
  true
),
updated_at = now();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. PERSISTENT ANNOUNCEMENTS TABLE (CROSS-STATION BROADCAST)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.announcements (
  id text PRIMARY KEY,
  title text NOT NULL,
  body text NOT NULL,
  type text NOT NULL DEFAULT 'info' CHECK (type IN ('info', 'warning', 'closure')),
  target text NOT NULL DEFAULT 'all' CHECK (target IN ('all', 'admins', 'hikers', 'guides')),
  is_important boolean NOT NULL DEFAULT false,
  starts_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "announcements_public_read" ON public.announcements;
CREATE POLICY "announcements_public_read"
  ON public.announcements FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "announcements_admin_manage" ON public.announcements;
CREATE POLICY "announcements_admin_manage"
  ON public.announcements FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role IN ('super_admin', 'admin')
    )
  );

CREATE INDEX IF NOT EXISTS idx_announcements_target_created
  ON public.announcements (target, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. JUMP-OFF STATIONS DATABASE CONSISTENCY
-- Deactivate generic Mt. Kalisungan station so only real trailheads are active:
-- Lamot 2, Lamot 1, and Sto. Tomas
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE public.locations
SET status = 'inactive'
WHERE slug = 'mt-kalisungan' OR lower(name) = 'mount kalisungan';

-- Clean up any retired generic Mt. Kalisungan admin account roles
DELETE FROM public.user_roles
WHERE user_id IN (
  SELECT id FROM auth.users
  WHERE lower(email) = 'kalisungan@kalisungan.ph' OR lower(email) LIKE '%mtkalisungan%'
);
