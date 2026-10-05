-- Make the non-reference entry routes follow their natural, turning geometry.
-- Lamot 2 remains the approved reference route and is intentionally untouched.
DO $$
DECLARE
  v_lamot1 uuid;
  v_sto_tomas uuid;
  v_peak_lat numeric := 14.1495;
  v_peak_lng numeric := 121.3462;
BEGIN
  SELECT id INTO v_lamot1
  FROM public.locations
  WHERE slug IN ('lamot-1', 'loc-lamot-1') OR lower(name) LIKE '%lamot 1%'
  LIMIT 1;

  SELECT id INTO v_sto_tomas
  FROM public.locations
  WHERE slug IN ('sto-tomas', 'loc-sto-tomas') OR lower(name) LIKE '%sto%tomas%'
  LIMIT 1;

  IF v_lamot1 IS NOT NULL THEN
    UPDATE public.trail_zones
    SET coordinates_json = jsonb_build_array(
      jsonb_build_object('lat', 14.147385047365747, 'lng', 121.32372794241525),
      jsonb_build_object('lat', 14.1479, 'lng', 121.3250),
      jsonb_build_object('lat', 14.1475, 'lng', 121.3264),
      jsonb_build_object('lat', 14.1480, 'lng', 121.3278),
      jsonb_build_object('lat', 14.1474, 'lng', 121.3291),
      jsonb_build_object('lat', 14.1479, 'lng', 121.3306),
      jsonb_build_object('lat', 14.1472, 'lng', 121.3320),
      jsonb_build_object('lat', 14.1478, 'lng', 121.3335),
      jsonb_build_object('lat', 14.1471, 'lng', 121.3349),
      jsonb_build_object('lat', 14.1477, 'lng', 121.3362),
      jsonb_build_object('lat', 14.1469, 'lng', 121.3376),
      jsonb_build_object('lat', 14.1475, 'lng', 121.3390),
      jsonb_build_object('lat', 14.1468, 'lng', 121.3403),
      jsonb_build_object('lat', 14.1474, 'lng', 121.3414),
      jsonb_build_object('lat', 14.1469, 'lng', 121.3423),
      jsonb_build_object('lat', 14.1476, 'lng', 121.3434),
      jsonb_build_object('lat', 14.1480, 'lng', 121.3442),
      jsonb_build_object('lat', 14.1484, 'lng', 121.3449),
      jsonb_build_object('lat', 14.1488, 'lng', 121.3455),
      jsonb_build_object('lat', 14.1491, 'lng', 121.3459),
      jsonb_build_object('lat', v_peak_lat, 'lng', v_peak_lng)
    ),
    recording_metadata = jsonb_set(
      COALESCE(recording_metadata, '{}'::jsonb),
      '{stations}',
      'null'::jsonb,
      true
    )
    WHERE location_id = v_lamot1 AND status = 'active' AND is_official = true;
  END IF;

  IF v_sto_tomas IS NOT NULL THEN
    UPDATE public.trail_zones
    SET coordinates_json = jsonb_build_array(
      jsonb_build_object('lat', 14.166631, 'lng', 121.339746),
      jsonb_build_object('lat', 14.1657, 'lng', 121.3408),
      jsonb_build_object('lat', 14.1663, 'lng', 121.3420),
      jsonb_build_object('lat', 14.1648, 'lng', 121.3430),
      jsonb_build_object('lat', 14.1655, 'lng', 121.3443),
      jsonb_build_object('lat', 14.1638, 'lng', 121.3450),
      jsonb_build_object('lat', 14.1646, 'lng', 121.3462),
      jsonb_build_object('lat', 14.1628, 'lng', 121.3465),
      jsonb_build_object('lat', 14.1635, 'lng', 121.3478),
      jsonb_build_object('lat', 14.1617, 'lng', 121.3475),
      jsonb_build_object('lat', 14.1608, 'lng', 121.3482),
      jsonb_build_object('lat', 14.1595, 'lng', 121.3473),
      jsonb_build_object('lat', 14.1587, 'lng', 121.3480),
      jsonb_build_object('lat', 14.1574, 'lng', 121.3470),
      jsonb_build_object('lat', 14.1564, 'lng', 121.3478),
      jsonb_build_object('lat', 14.1549, 'lng', 121.3471),
      jsonb_build_object('lat', 14.1537, 'lng', 121.3478),
      jsonb_build_object('lat', 14.1525, 'lng', 121.3467),
      jsonb_build_object('lat', 14.1514, 'lng', 121.3472),
      jsonb_build_object('lat', 14.1506, 'lng', 121.3465),
      jsonb_build_object('lat', v_peak_lat, 'lng', v_peak_lng)
    ),
    recording_metadata = jsonb_set(
      COALESCE(recording_metadata, '{}'::jsonb),
      '{stations}',
      'null'::jsonb,
      true
    )
    WHERE location_id = v_sto_tomas AND status = 'active' AND is_official = true;
  END IF;
END $$;
