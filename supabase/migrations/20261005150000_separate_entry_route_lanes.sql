-- Separate Lamot 1 and Sto. Tomas from the Lamot 2 GPS line while retaining
-- its jagged shape and exact summit endpoint. Lamot 2 is read but never updated.
DO $$
DECLARE
  v_lamot1 uuid;
  v_lamot2 uuid;
  v_sto_tomas uuid;
  v_reference_path jsonb;
  v_path_count integer;
  v_peak_lat double precision;
  v_peak_lng double precision;
  v_lamot1_path jsonb := '[]'::jsonb;
  v_sto_tomas_path jsonb := '[]'::jsonb;
  v_point record;
  v_progress double precision;
  v_taper double precision;
  v_lane_taper double precision;
  v_delta_east double precision;
  v_delta_north double precision;
  v_tangent_length double precision;
  v_lat double precision;
  v_lng double precision;
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
    RAISE EXCEPTION 'Cannot separate routes: no published Lamot 2 GPS route was found.';
  END IF;

  v_path_count := jsonb_array_length(v_reference_path);
  v_peak_lat := (v_reference_path -> (v_path_count - 1) ->> 'lat')::double precision;
  v_peak_lng := (v_reference_path -> (v_path_count - 1) ->> 'lng')::double precision;

  IF v_peak_lat IS NULL OR v_peak_lng IS NULL THEN
    RAISE EXCEPTION 'Cannot separate routes: Lamot 2 route has no valid summit endpoint.';
  END IF;

  FOR v_point IN
    SELECT
      p.ordinality,
      (p.value ->> 'lat')::double precision AS lat,
      (p.value ->> 'lng')::double precision AS lng,
      lag((p.value ->> 'lat')::double precision) OVER (ORDER BY p.ordinality) AS prev_lat,
      lag((p.value ->> 'lng')::double precision) OVER (ORDER BY p.ordinality) AS prev_lng,
      lead((p.value ->> 'lat')::double precision) OVER (ORDER BY p.ordinality) AS next_lat,
      lead((p.value ->> 'lng')::double precision) OVER (ORDER BY p.ordinality) AS next_lng
    FROM jsonb_array_elements(v_reference_path) WITH ORDINALITY AS p(value, ordinality)
  LOOP
    v_progress := (v_point.ordinality - 1)::double precision / (v_path_count - 1);
    v_taper := 1 - v_progress;
    v_lane_taper := least(1, v_taper * 10);
    v_delta_east := (COALESCE(v_point.next_lng, v_point.lng) - COALESCE(v_point.prev_lng, v_point.lng))
      * 111320 * cos(radians(v_point.lat));
    v_delta_north := (COALESCE(v_point.next_lat, v_point.lat) - COALESCE(v_point.prev_lat, v_point.lat)) * 111320;
    v_tangent_length := greatest(sqrt(v_delta_east * v_delta_east + v_delta_north * v_delta_north), 1);

    IF v_point.ordinality = 1 THEN
      v_lat := 14.147385047365747;
      v_lng := 121.32372794241525;
    ELSIF v_point.ordinality = v_path_count THEN
      v_lat := v_peak_lat;
      v_lng := v_peak_lng;
    ELSE
      v_lat := v_point.lat
        + (14.147385047365747 - (v_reference_path -> 0 ->> 'lat')::double precision) * v_taper
        - (v_delta_east / v_tangent_length) * 70 * v_lane_taper / 111320
        + sin(v_point.ordinality * 1.7 + 0.6) * 0.000045 * v_taper;
      v_lng := v_point.lng
        + (121.32372794241525 - (v_reference_path -> 0 ->> 'lng')::double precision) * v_taper
        + (v_delta_north / v_tangent_length) * 70 * v_lane_taper / (111320 * cos(radians(v_point.lat)))
        + cos(v_point.ordinality * 1.3 + 0.6) * 0.000045 * v_taper;
    END IF;
    v_lamot1_path := v_lamot1_path || jsonb_build_array(jsonb_build_object('lat', v_lat, 'lng', v_lng));

    IF v_point.ordinality = 1 THEN
      v_lat := 14.166631;
      v_lng := 121.339746;
    ELSIF v_point.ordinality = v_path_count THEN
      v_lat := v_peak_lat;
      v_lng := v_peak_lng;
    ELSE
      v_lat := v_point.lat
        + (14.166631 - (v_reference_path -> 0 ->> 'lat')::double precision) * v_taper
        + (v_delta_east / v_tangent_length) * 70 * v_lane_taper / 111320
        + sin(v_point.ordinality * 1.7 + 2.2) * 0.000045 * v_taper;
      v_lng := v_point.lng
        + (121.339746 - (v_reference_path -> 0 ->> 'lng')::double precision) * v_taper
        - (v_delta_north / v_tangent_length) * 70 * v_lane_taper / (111320 * cos(radians(v_point.lat)))
        + cos(v_point.ordinality * 1.3 + 2.2) * 0.000045 * v_taper;
    END IF;
    v_sto_tomas_path := v_sto_tomas_path || jsonb_build_array(jsonb_build_object('lat', v_lat, 'lng', v_lng));
  END LOOP;

  IF v_lamot1 IS NOT NULL THEN
    UPDATE public.trail_zones
    SET coordinates_json = v_lamot1_path,
        recording_metadata = jsonb_set(COALESCE(recording_metadata, '{}'::jsonb), '{stations}', 'null'::jsonb, true)
    WHERE location_id = v_lamot1 AND status = 'active' AND is_official = true;
  END IF;

  IF v_sto_tomas IS NOT NULL THEN
    UPDATE public.trail_zones
    SET coordinates_json = v_sto_tomas_path,
        recording_metadata = jsonb_set(COALESCE(recording_metadata, '{}'::jsonb), '{stations}', 'null'::jsonb, true)
    WHERE location_id = v_sto_tomas AND status = 'active' AND is_official = true;
  END IF;
END $$;
