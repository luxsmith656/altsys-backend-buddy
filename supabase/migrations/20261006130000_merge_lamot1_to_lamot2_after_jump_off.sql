-- Join Lamot 1 onto the real Lamot 2 track shortly after the jump-off, at Station 1.
-- The Lamot 1 approach remains distinct; Lamot 2 and Sto. Tomas are never updated.
DO $$
DECLARE
  v_lamot1_location uuid;
  v_lamot2_location uuid;
  v_lamot1_route_id uuid;
  v_lamot2_route_id uuid;
  v_lamot1 jsonb;
  v_lamot2 jsonb;
  v_lamot1_metadata jsonb;
  v_lamot1_count integer;
  v_lamot2_count integer;
  v_start_index integer;
  v_join_index integer;
  v_ref_start_index integer;
  v_ref_join_index integer;
  v_index integer;
  v_ref_index integer;
  v_transition double precision;
  v_blend double precision;
  v_lat double precision;
  v_lng double precision;
  v_original jsonb;
  v_reference jsonb;
  v_updated_path jsonb := '[]'::jsonb;
BEGIN
  SELECT id INTO v_lamot1_location
  FROM public.locations
  WHERE slug IN ('lamot-1', 'loc-lamot-1') OR lower(name) LIKE '%lamot 1%'
  ORDER BY CASE WHEN slug = 'lamot-1' THEN 0 ELSE 1 END
  LIMIT 1;

  SELECT id INTO v_lamot2_location
  FROM public.locations
  WHERE slug IN ('lamot-2', 'loc-lamot-2') OR lower(name) LIKE '%lamot 2%'
  ORDER BY CASE WHEN slug = 'lamot-2' THEN 0 ELSE 1 END
  LIMIT 1;

  IF v_lamot1_location IS NULL OR v_lamot2_location IS NULL THEN
    RAISE EXCEPTION 'Cannot merge routes: Lamot 1 or Lamot 2 location was not found.';
  END IF;

  SELECT id, coordinates_json, COALESCE(recording_metadata, '{}'::jsonb)
  INTO v_lamot1_route_id, v_lamot1, v_lamot1_metadata
  FROM public.trail_zones
  WHERE location_id = v_lamot1_location
    AND status = 'active'
    AND is_official = true
    AND review_status = 'approved'
    AND CASE
      WHEN jsonb_typeof(coordinates_json) = 'array' THEN jsonb_array_length(coordinates_json) >= 20
      ELSE false
    END
  ORDER BY jsonb_array_length(coordinates_json) DESC, created_at DESC
  LIMIT 1;

  SELECT id, coordinates_json
  INTO v_lamot2_route_id, v_lamot2
  FROM public.trail_zones
  WHERE location_id = v_lamot2_location
    AND status = 'active'
    AND is_official = true
    AND review_status = 'approved'
    AND CASE
      WHEN jsonb_typeof(coordinates_json) = 'array' THEN jsonb_array_length(coordinates_json) >= 20
      ELSE false
    END
  ORDER BY jsonb_array_length(coordinates_json) DESC, created_at DESC
  LIMIT 1;

  IF v_lamot1_route_id IS NULL OR v_lamot2_route_id IS NULL THEN
    RAISE EXCEPTION 'Cannot merge routes: approved active Lamot 1 and Lamot 2 routes are required.';
  END IF;

  IF v_lamot1_metadata #>> '{sharedRouteSuffix,referenceRouteId}' = v_lamot2_route_id::text
     AND abs(COALESCE((v_lamot1_metadata #>> '{sharedRouteSuffix,joinProgress}')::double precision, 0) - (1.0 / 6.0)) < 0.01
     AND abs(COALESCE((v_lamot1_metadata #>> '{sharedRouteSuffix,transitionStartProgress}')::double precision, 0) - 0.05) < 0.01 THEN
    RAISE NOTICE 'Lamot 1 already shares the Lamot 2 suffix; no update needed.';
    RETURN;
  END IF;

  v_lamot1_count := jsonb_array_length(v_lamot1);
  v_lamot2_count := jsonb_array_length(v_lamot2);
  v_start_index := round((v_lamot1_count - 1) * 0.05)::integer;
  v_join_index := round((v_lamot1_count - 1) * (1.0 / 6.0))::integer;
  v_ref_start_index := round((v_lamot2_count - 1) * 0.05)::integer;
  v_ref_join_index := round((v_lamot2_count - 1) * (1.0 / 6.0))::integer;

  IF v_join_index <= v_start_index OR v_ref_join_index <= v_ref_start_index THEN
    RAISE EXCEPTION 'Cannot merge routes: route geometry is too short for a safe transition.';
  END IF;

  FOR v_index IN 0..v_join_index LOOP
    v_original := v_lamot1 -> v_index;

    IF v_index < v_start_index THEN
      v_updated_path := v_updated_path || jsonb_build_array(v_original);
      CONTINUE;
    END IF;

    v_transition := (v_index - v_start_index)::double precision / (v_join_index - v_start_index);
    v_blend := v_transition * v_transition * (3 - 2 * v_transition);
    v_ref_index := round(
      v_ref_start_index
      + v_transition * (v_ref_join_index - v_ref_start_index)
    );
    v_reference := v_lamot2 -> v_ref_index;

    IF v_index = v_join_index THEN
      v_updated_path := v_updated_path || jsonb_build_array(jsonb_build_object(
        'lat', (v_reference ->> 'lat')::double precision,
        'lng', (v_reference ->> 'lng')::double precision
      ));
    ELSE
      v_lat := (v_original ->> 'lat')::double precision
        + ((v_reference ->> 'lat')::double precision - (v_original ->> 'lat')::double precision) * v_blend;
      v_lng := (v_original ->> 'lng')::double precision
        + ((v_reference ->> 'lng')::double precision - (v_original ->> 'lng')::double precision) * v_blend;
      v_updated_path := v_updated_path || jsonb_build_array(jsonb_build_object('lat', v_lat, 'lng', v_lng));
    END IF;
  END LOOP;

  IF v_ref_join_index + 1 < v_lamot2_count THEN
    FOR v_index IN (v_ref_join_index + 1)..(v_lamot2_count - 1) LOOP
      v_reference := v_lamot2 -> v_index;
      v_updated_path := v_updated_path || jsonb_build_array(jsonb_build_object(
        'lat', (v_reference ->> 'lat')::double precision,
        'lng', (v_reference ->> 'lng')::double precision
      ));
    END LOOP;
  END IF;

  UPDATE public.trail_zones
  SET coordinates_json = v_updated_path,
      recording_metadata = jsonb_set(
        jsonb_set(COALESCE(recording_metadata, '{}'::jsonb), '{stations}', 'null'::jsonb, true),
        '{sharedRouteSuffix}',
        jsonb_build_object(
          'referenceRouteId', v_lamot2_route_id,
          'joinProgress', 1.0 / 6.0,
          'transitionStartProgress', 0.05,
          'method', 'smooth-merge-then-shared-gps-suffix'
        ),
        true
      )
  WHERE id = v_lamot1_route_id;
END $$;
