-- Keep the three jump-off markers and published route starts aligned with the
-- coordinates used by the map and booking location selector.
UPDATE public.locations
SET center_lat = 14.147385047365747,
    center_lng = 121.32372794241525
WHERE slug = 'lamot-1' OR slug = 'loc-lamot-1' OR lower(name) LIKE '%lamot 1%';

UPDATE public.locations
SET center_lat = 14.166631,
    center_lng = 121.339746
WHERE slug = 'sto-tomas' OR slug = 'loc-sto-tomas' OR lower(name) LIKE '%sto%tomas%';

ALTER TABLE public.announcements
  ADD COLUMN IF NOT EXISTS source text;

-- Existing notices were issued by the central tourism office unless a newer
-- notice supplies a more specific issuer.
UPDATE public.announcements
SET source = 'Calauan Municipal Tourism Office'
WHERE source IS NULL;

DO $$
DECLARE
  v_lamot1 uuid;
  v_sto_tomas uuid;
  v_peak_lat numeric := 14.1495;
  v_peak_lng numeric := 121.3462;
BEGIN
  SELECT id INTO v_lamot1 FROM public.locations
    WHERE slug IN ('lamot-1', 'loc-lamot-1') OR lower(name) LIKE '%lamot 1%' LIMIT 1;
  SELECT id INTO v_sto_tomas FROM public.locations
    WHERE slug IN ('sto-tomas', 'loc-sto-tomas') OR lower(name) LIKE '%sto%tomas%' LIMIT 1;

  -- Correct existing approved routes in place. The JSON structure is shared by
  -- the map, booking preview, stations, and offline route cache.
  IF v_lamot1 IS NOT NULL THEN
    UPDATE public.trail_zones
    SET coordinates_json = jsonb_build_array(
      jsonb_build_object('lat', 14.147385047365747, 'lng', 121.32372794241525),
      jsonb_build_object('lat', 14.1471, 'lng', 121.3265),
      jsonb_build_object('lat', 14.1468, 'lng', 121.3295),
      jsonb_build_object('lat', 14.1469, 'lng', 121.3325),
      jsonb_build_object('lat', 14.1471, 'lng', 121.3355),
      jsonb_build_object('lat', 14.1472, 'lng', 121.3380),
      jsonb_build_object('lat', 14.1472, 'lng', 121.3402),
      jsonb_build_object('lat', 14.1469, 'lng', 121.3414),
      jsonb_build_object('lat', 14.1471, 'lng', 121.3425),
      jsonb_build_object('lat', 14.1476, 'lng', 121.3436),
      jsonb_build_object('lat', 14.1482, 'lng', 121.3445),
      jsonb_build_object('lat', 14.1489, 'lng', 121.3453),
      jsonb_build_object('lat', v_peak_lat, 'lng', v_peak_lng)
    ),
    recording_metadata = jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(recording_metadata, '{stations,0,lat}', to_jsonb(14.147385047365747::numeric), true),
          '{stations,0,lng}', to_jsonb(121.32372794241525::numeric), true
        ),
        '{stations,6,lat}', to_jsonb(v_peak_lat), true
      ),
      '{stations,6,lng}', to_jsonb(v_peak_lng), true
    )
    WHERE location_id = v_lamot1 AND status = 'active' AND is_official = true;
  END IF;

  IF v_sto_tomas IS NOT NULL THEN
    UPDATE public.trail_zones
    SET coordinates_json = jsonb_build_array(
      jsonb_build_object('lat', 14.166631, 'lng', 121.339746),
      jsonb_build_object('lat', 14.1660, 'lng', 121.3415),
      jsonb_build_object('lat', 14.1640, 'lng', 121.3438),
      jsonb_build_object('lat', 14.1610, 'lng', 121.3455),
      jsonb_build_object('lat', 14.1580, 'lng', 121.3468),
      jsonb_build_object('lat', 14.1540, 'lng', 121.3475),
      jsonb_build_object('lat', 14.1515, 'lng', 121.3470),
      jsonb_build_object('lat', v_peak_lat, 'lng', v_peak_lng)
    ),
    recording_metadata = jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(recording_metadata, '{stations,0,lat}', to_jsonb(14.166631::numeric), true),
          '{stations,0,lng}', to_jsonb(121.339746::numeric), true
        ),
        '{stations,6,lat}', to_jsonb(v_peak_lat), true
      ),
      '{stations,6,lng}', to_jsonb(v_peak_lng), true
    )
    WHERE location_id = v_sto_tomas AND status = 'active' AND is_official = true;
  END IF;
END $$;
