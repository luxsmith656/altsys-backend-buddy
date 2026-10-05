-- Shape Lamot 1 and Sto. Tomas from the active Lamot 2 GPS reference and use
-- its exact final GPS point as the shared summit. Lamot 2 is read-only here.
DO $$
DECLARE
  v_lamot1 uuid;
  v_lamot2 uuid;
  v_sto_tomas uuid;
  v_reference_path jsonb;
  v_reference_start_lat double precision;
  v_reference_start_lng double precision;
  v_peak_lat double precision;
  v_peak_lng double precision;
  v_path_count integer;
  v_lamot1_path jsonb;
  v_sto_tomas_path jsonb;
BEGIN
  SELECT id INTO v_lamot1 FROM public.locations
  WHERE slug IN ('lamot-1', 'loc-lamot-1') OR lower(name) LIKE '%lamot 1%'
  LIMIT 1;

  SELECT id INTO v_lamot2 FROM public.locations
  WHERE slug IN ('lamot-2', 'loc-lamot-2') OR lower(name) LIKE '%lamot 2%'
  LIMIT 1;

  SELECT id INTO v_sto_tomas FROM public.locations
  WHERE slug IN ('sto-tomas', 'loc-sto-tomas') OR lower(name) LIKE '%sto%tomas%'
  LIMIT 1;

  SELECT tz.coordinates_json INTO v_reference_path
  FROM public.trail_zones tz
  WHERE tz.location_id = v_lamot2
    AND tz.status = 'active'
    AND tz.is_official = true
    AND tz.review_status = 'approved'
    AND jsonb_typeof(tz.coordinates_json) = 'array'
    AND jsonb_array_length(tz.coordinates_json) >= 2
  ORDER BY jsonb_array_length(tz.coordinates_json) DESC, tz.created_at DESC
  LIMIT 1;

  IF v_reference_path IS NULL THEN
    RAISE EXCEPTION 'Cannot update entry routes: no active published Lamot 2 route with GPS points was found.';
  END IF;

  v_path_count := jsonb_array_length(v_reference_path);
  v_reference_start_lat := (v_reference_path -> 0 ->> 'lat')::double precision;
  v_reference_start_lng := (v_reference_path -> 0 ->> 'lng')::double precision;
  v_peak_lat := (v_reference_path -> (v_path_count - 1) ->> 'lat')::double precision;
  v_peak_lng := (v_reference_path -> (v_path_count - 1) ->> 'lng')::double precision;

  IF v_reference_start_lat IS NULL OR v_reference_start_lng IS NULL
    OR v_peak_lat IS NULL OR v_peak_lng IS NULL THEN
    RAISE EXCEPTION 'Cannot update entry routes: Lamot 2 route is missing valid start or summit coordinates.';
  END IF;

  IF v_lamot1 IS NOT NULL THEN
    SELECT jsonb_agg(
      CASE
        WHEN point.ordinality = 1 THEN jsonb_build_object('lat', 14.147385047365747, 'lng', 121.32372794241525)
        WHEN point.ordinality = v_path_count THEN jsonb_build_object('lat', v_peak_lat, 'lng', v_peak_lng)
        ELSE jsonb_build_object(
          'lat', (point.value ->> 'lat')::double precision
            + (14.147385047365747 - v_reference_start_lat) * (1 - (point.ordinality - 1)::double precision / (v_path_count - 1))
            + sin(point.ordinality * 1.7 + 0.6) * 0.000045 * (1 - (point.ordinality - 1)::double precision / (v_path_count - 1)),
          'lng', (point.value ->> 'lng')::double precision
            + (121.32372794241525 - v_reference_start_lng) * (1 - (point.ordinality - 1)::double precision / (v_path_count - 1))
            + cos(point.ordinality * 1.3 + 0.6) * 0.000045 * (1 - (point.ordinality - 1)::double precision / (v_path_count - 1))
        )
      END ORDER BY point.ordinality
    ) INTO v_lamot1_path
    FROM jsonb_array_elements(v_reference_path) WITH ORDINALITY AS point(value, ordinality);

    UPDATE public.trail_zones
    SET coordinates_json = v_lamot1_path,
        recording_metadata = jsonb_set(COALESCE(recording_metadata, '{}'::jsonb), '{stations}', 'null'::jsonb, true)
    WHERE location_id = v_lamot1 AND status = 'active' AND is_official = true;
  END IF;

  IF v_sto_tomas IS NOT NULL THEN
    SELECT jsonb_agg(
      CASE
        WHEN point.ordinality = 1 THEN jsonb_build_object('lat', 14.166631, 'lng', 121.339746)
        WHEN point.ordinality = v_path_count THEN jsonb_build_object('lat', v_peak_lat, 'lng', v_peak_lng)
        ELSE jsonb_build_object(
          'lat', (point.value ->> 'lat')::double precision
            + (14.166631 - v_reference_start_lat) * (1 - (point.ordinality - 1)::double precision / (v_path_count - 1))
            + sin(point.ordinality * 1.7 + 2.2) * 0.000045 * (1 - (point.ordinality - 1)::double precision / (v_path_count - 1)),
          'lng', (point.value ->> 'lng')::double precision
            + (121.339746 - v_reference_start_lng) * (1 - (point.ordinality - 1)::double precision / (v_path_count - 1))
            + cos(point.ordinality * 1.3 + 2.2) * 0.000045 * (1 - (point.ordinality - 1)::double precision / (v_path_count - 1))
        )
      END ORDER BY point.ordinality
    ) INTO v_sto_tomas_path
    FROM jsonb_array_elements(v_reference_path) WITH ORDINALITY AS point(value, ordinality);

    UPDATE public.trail_zones
    SET coordinates_json = v_sto_tomas_path,
        recording_metadata = jsonb_set(COALESCE(recording_metadata, '{}'::jsonb), '{stations}', 'null'::jsonb, true)
    WHERE location_id = v_sto_tomas AND status = 'active' AND is_official = true;
  END IF;
END $$;
