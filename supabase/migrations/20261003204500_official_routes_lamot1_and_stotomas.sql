-- =============================================================================
-- Migration: 20261003204500_official_routes_lamot1_and_stotomas.sql
-- Description:
-- Publish official routes for Sitio Lamot 1 and Brgy. Sto. Tomas jump-offs
-- while preserving the published Lamot 2 route completely untouched.
-- =============================================================================

DO $$
DECLARE
  v_loc_lamot1 uuid;
  v_loc_stotomas uuid;
BEGIN
  -- Resolve Location IDs
  SELECT id INTO v_loc_lamot1
  FROM public.locations
  WHERE slug = 'lamot-1' OR slug = 'loc-lamot-1' OR lower(name) LIKE '%lamot 1%'
  LIMIT 1;

  SELECT id INTO v_loc_stotomas
  FROM public.locations
  WHERE slug = 'sto-tomas' OR slug = 'loc-sto-tomas' OR lower(name) LIKE '%tomas%'
  LIMIT 1;

  -- 1. Sitio Lamot 1: Publish Official Route
  IF v_loc_lamot1 IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.trail_zones
      WHERE location_id = v_loc_lamot1
        AND is_official = true
        AND status = 'active'
    ) THEN
      INSERT INTO public.trail_zones (
        location_id,
        name,
        description,
        difficulty,
        elevation_meters,
        max_capacity,
        status,
        is_official,
        review_status,
        source,
        coordinates_json,
        recording_metadata
      ) VALUES (
        v_loc_lamot1,
        'Lamot 1 Classic Summit Trail',
        'Official trail starting at Sitio Lamot 1 Jump-Off Terminal ascending through northern pine ridges and bamboo canopy to the 629m summit.',
        'moderate',
        629,
        50,
        'active',
        true,
        'approved',
        'official_mapping',
        '[
          {"lat": 14.1475, "lng": 121.3390},
          {"lat": 14.1472, "lng": 121.3402},
          {"lat": 14.1469, "lng": 121.3414},
          {"lat": 14.1471, "lng": 121.3425},
          {"lat": 14.1476, "lng": 121.3436},
          {"lat": 14.1482, "lng": 121.3445},
          {"lat": 14.1489, "lng": 121.3453},
          {"lat": 14.1495, "lng": 121.3462}
        ]'::jsonb,
        '{
          "stationNames": [
            "Sitio Lamot 1 Jump-Off (0 km)",
            "Station 1: Mango Orchard (0.5 km)",
            "Station 2: Bamboo Canopy (1.0 km)",
            "Station 3: North Ridge Marker (1.6 km)",
            "Station 4: Pine Forest View (2.1 km)",
            "Station 5: Upper North Junction (2.5 km)",
            "Peak: Mt. Kalisungan Summit (629m)"
          ],
          "stations": [
            {"id": "jump-off", "index": 1, "kind": "jump_off", "name": "Sitio Lamot 1 Jump-Off (0 km)", "lat": 14.1475, "lng": 121.3390, "distanceKm": 0},
            {"id": "station-1", "index": 2, "kind": "station", "name": "Station 1: Mango Orchard", "lat": 14.1472, "lng": 121.3402, "distanceKm": 0.5},
            {"id": "station-2", "index": 3, "kind": "station", "name": "Station 2: Bamboo Canopy", "lat": 14.1469, "lng": 121.3414, "distanceKm": 1.0},
            {"id": "station-3", "index": 4, "kind": "station", "name": "Station 3: North Ridge Marker", "lat": 14.1471, "lng": 121.3425, "distanceKm": 1.6},
            {"id": "station-4", "index": 5, "kind": "station", "name": "Station 4: Pine Forest View", "lat": 14.1476, "lng": 121.3436, "distanceKm": 2.1},
            {"id": "station-5", "index": 6, "kind": "station", "name": "Station 5: Upper North Junction", "lat": 14.1482, "lng": 121.3445, "distanceKm": 2.5},
            {"id": "peak", "index": 7, "kind": "peak", "name": "Mt. Kalisungan Summit (629m)", "lat": 14.1495, "lng": 121.3462, "distanceKm": 2.8}
          ]
        }'::jsonb
      );
    END IF;
  END IF;

  -- 2. Brgy. Sto. Tomas: Publish Official Route
  IF v_loc_stotomas IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.trail_zones
      WHERE location_id = v_loc_stotomas
        AND is_official = true
        AND status = 'active'
    ) THEN
      INSERT INTO public.trail_zones (
        location_id,
        name,
        description,
        difficulty,
        elevation_meters,
        max_capacity,
        status,
        is_official,
        review_status,
        source,
        coordinates_json,
        recording_metadata
      ) VALUES (
        v_loc_stotomas,
        'Sto. Tomas Southern Traverse Trail',
        'Official cross-country trail starting at Brgy. Sto. Tomas Jump-Off traversing southern coconut groves, rocky streams, and grasslands to Mt. Kalisungan summit.',
        'hard',
        629,
        40,
        'active',
        true,
        'approved',
        'official_mapping',
        '[
          {"lat": 14.1350, "lng": 121.3500},
          {"lat": 14.1368, "lng": 121.3492},
          {"lat": 14.1388, "lng": 121.3483},
          {"lat": 14.1408, "lng": 121.3475},
          {"lat": 14.1428, "lng": 121.3468},
          {"lat": 14.1448, "lng": 121.3465},
          {"lat": 14.1468, "lng": 121.3463},
          {"lat": 14.1485, "lng": 121.3462},
          {"lat": 14.1495, "lng": 121.3462}
        ]'::jsonb,
        '{
          "stationNames": [
            "Brgy. Sto. Tomas Jump-Off (0 km)",
            "Station 1: South Coconut Grove (0.7 km)",
            "Station 2: Rocky Stream Crossing (1.4 km)",
            "Station 3: Mahogany Forest Clearing (2.1 km)",
            "Station 4: South Ridge Rest Post (2.7 km)",
            "Station 5: Grassland Saddle Camp (3.3 km)",
            "Peak: Mt. Kalisungan Summit (629m)"
          ],
          "stations": [
            {"id": "jump-off", "index": 1, "kind": "jump_off", "name": "Brgy. Sto. Tomas Jump-Off (0 km)", "lat": 14.1350, "lng": 121.3500, "distanceKm": 0},
            {"id": "station-1", "index": 2, "kind": "station", "name": "Station 1: South Coconut Grove", "lat": 14.1368, "lng": 121.3492, "distanceKm": 0.7},
            {"id": "station-2", "index": 3, "kind": "station", "name": "Station 2: Rocky Stream Crossing", "lat": 14.1388, "lng": 121.3483, "distanceKm": 1.4},
            {"id": "station-3", "index": 4, "kind": "station", "name": "Station 3: Mahogany Forest Clearing", "lat": 14.1408, "lng": 121.3475, "distanceKm": 2.1},
            {"id": "station-4", "index": 5, "kind": "station", "name": "Station 4: South Ridge Rest Post", "lat": 14.1428, "lng": 121.3468, "distanceKm": 2.7},
            {"id": "station-5", "index": 6, "kind": "station", "name": "Station 5: Grassland Saddle Camp", "lat": 14.1448, "lng": 121.3465, "distanceKm": 3.3},
            {"id": "peak", "index": 7, "kind": "peak", "name": "Mt. Kalisungan Summit (629m)", "lat": 14.1495, "lng": 121.3462, "distanceKm": 3.8}
          ]
        }'::jsonb
      );
    END IF;
  END IF;
END $$;
