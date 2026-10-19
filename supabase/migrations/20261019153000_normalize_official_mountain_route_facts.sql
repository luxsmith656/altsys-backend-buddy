-- Normalize the published route records after the official mountain facts update.
-- Route elevation_meters remains terrain/DEM data; it is intentionally not changed
-- to the mountain-wide 760 MASL summit fact.

DO $$
DECLARE
  v_lamot1 uuid;
  v_lamot2 uuid;
  v_sto_tomas uuid;
BEGIN
  SELECT id INTO v_lamot1 FROM public.locations
  WHERE slug IN ('lamot-1', 'loc-lamot-1') OR lower(name) = 'lamot 1'
  ORDER BY CASE WHEN slug = 'lamot-1' THEN 0 ELSE 1 END LIMIT 1;

  SELECT id INTO v_lamot2 FROM public.locations
  WHERE slug IN ('lamot-2', 'loc-lamot-2', 'mt-kalisungan') OR lower(name) LIKE '%lamot 2%'
  ORDER BY CASE WHEN slug = 'lamot-2' THEN 0 WHEN slug = 'mt-kalisungan' THEN 1 ELSE 2 END LIMIT 1;

  SELECT id INTO v_sto_tomas FROM public.locations
  WHERE slug IN ('sto-tomas', 'loc-sto-tomas') OR lower(name) LIKE '%sto%tomas%'
  ORDER BY CASE WHEN slug = 'sto-tomas' THEN 0 ELSE 1 END LIMIT 1;

  IF v_lamot1 IS NOT NULL THEN
    UPDATE public.trail_zones
    SET name = 'Lamot 1 Trail',
        description = regexp_replace(description, '\m(622|629)m\M', 'the mountain summit', 'gi'),
        recording_metadata = replace(recording_metadata::text, 'Mt. Kalisungan Summit (629m)', 'Mt. Kalisungan Summit')::jsonb
    WHERE location_id = v_lamot1 AND is_official = true;
  END IF;

  IF v_lamot2 IS NOT NULL THEN
    UPDATE public.trail_zones
    SET name = 'Lamot 2 Trail',
        description = regexp_replace(description, '\m(622|629)m\M', 'the mountain summit', 'gi'),
        recording_metadata = replace(recording_metadata::text, 'Mt. Kalisungan Summit (629m)', 'Mt. Kalisungan Summit')::jsonb
    WHERE location_id = v_lamot2 AND is_official = true;
  END IF;

  IF v_sto_tomas IS NOT NULL THEN
    UPDATE public.trail_zones
    SET name = 'Sto. Tomas Trail',
        description = regexp_replace(description, '\m(622|629)m\M', 'the mountain summit', 'gi'),
        recording_metadata = replace(recording_metadata::text, 'Mt. Kalisungan Summit (629m)', 'Mt. Kalisungan Summit')::jsonb
    WHERE location_id = v_sto_tomas AND is_official = true;
  END IF;

  UPDATE public.locations
  SET description = regexp_replace(description, '\m622m\M|\m629m\M', '760 MASL', 'gi')
  WHERE slug IN ('lamot-1', 'lamot-2', 'loc-lamot-1', 'loc-lamot-2', 'sto-tomas', 'loc-sto-tomas', 'mt-kalisungan');
END $$;
