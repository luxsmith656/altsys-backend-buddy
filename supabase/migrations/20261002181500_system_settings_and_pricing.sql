-- System settings table to persist dynamic pricing, official fare schedule,
-- and global configuration across Mt. Kalisungan tourism system.

CREATE TABLE IF NOT EXISTS public.system_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- Public read access so hikers and all visitors can load active published pricing
CREATE POLICY "Allow public read on system_settings"
  ON public.system_settings FOR SELECT
  USING (true);

-- Admins and Super Admins can insert/update settings
CREATE POLICY "Allow admins to modify system_settings"
  ON public.system_settings FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role IN ('super_admin', 'admin')
    )
  );

-- Seed initial pricing config if not present
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
    "horseHighStationFee": 1000
  }'::jsonb,
  now()
)
ON CONFLICT (key) DO NOTHING;
