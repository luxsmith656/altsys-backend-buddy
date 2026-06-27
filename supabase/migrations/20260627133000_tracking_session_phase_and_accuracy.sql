-- Session-level route identity and hike phase.
ALTER TABLE public.hiker_sessions
  ADD COLUMN IF NOT EXISTS participant_role text NOT NULL DEFAULT 'hiker',
  ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tracking_phase text NOT NULL DEFAULT 'ascent',
  ADD COLUMN IF NOT EXISTS peak_reached_at timestamptz,
  ADD COLUMN IF NOT EXISTS descent_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_track_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_hiker_sessions_location_status
  ON public.hiker_sessions(location_id, status);

CREATE INDEX IF NOT EXISTS idx_hiker_sessions_trail_zone_status
  ON public.hiker_sessions(trail_zone_id, status);

-- Point-level GPS quality and movement metadata for offline-first sync.
ALTER TABLE public.hiker_locations
  ADD COLUMN IF NOT EXISTS accuracy numeric,
  ADD COLUMN IF NOT EXISTS speed_m_s numeric,
  ADD COLUMN IF NOT EXISTS heading numeric,
  ADD COLUMN IF NOT EXISTS segment text;

CREATE INDEX IF NOT EXISTS idx_hiker_locations_timestamp
  ON public.hiker_locations(timestamp);

-- Backfill location_id from bookings where possible so existing active sessions
-- become visible to location-scoped admin monitor views.
UPDATE public.hiker_sessions hs
SET location_id = b.location_id
FROM public.bookings b
WHERE hs.booking_id = b.id
  AND hs.location_id IS NULL;
