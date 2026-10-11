-- Keep the published route names consistent across booking, maps, check-in,
-- receipts, and admin operations. The location is authoritative because old
-- route rows used several display names for the same three entry points.
UPDATE public.trail_zones AS tz
SET name = CASE
  WHEN lower(coalesce(loc.slug, '') || ' ' || coalesce(loc.name, '')) ~ 'lamot[ _-]*1' THEN 'Lamot 1 Trail'
  WHEN lower(coalesce(loc.slug, '') || ' ' || coalesce(loc.name, '')) ~ 'sto[ ._-]*tomas|santo tomas' THEN 'Sto. Tomas Trail'
  WHEN lower(coalesce(loc.slug, '') || ' ' || coalesce(loc.name, '')) ~ 'lamot[ _-]*2' THEN 'Lamot 2 Trail'
  WHEN lower(coalesce(tz.name, '')) ~ 'lamot[ _-]*1' THEN 'Lamot 1 Trail'
  WHEN lower(coalesce(tz.name, '')) ~ 'sto[ ._-]*tomas|santo tomas' THEN 'Sto. Tomas Trail'
  WHEN lower(coalesce(tz.name, '')) ~ 'summit[ _-]*trail' THEN 'Lamot 2 Trail'
  ELSE tz.name
END
FROM public.locations AS loc
WHERE tz.location_id = loc.id
  AND tz.is_official = true
  AND tz.status <> 'deleted';

-- Also repair legacy official rows that have no location foreign key but still
-- carry one of the old route names.
UPDATE public.trail_zones AS tz
SET name = CASE
  WHEN lower(tz.name) ~ 'lamot[ _-]*1' THEN 'Lamot 1 Trail'
  WHEN lower(tz.name) ~ 'sto[ ._-]*tomas|santo tomas' THEN 'Sto. Tomas Trail'
  WHEN lower(tz.name) ~ 'summit[ _-]*trail' THEN 'Lamot 2 Trail'
  ELSE tz.name
END
WHERE tz.location_id IS NULL
  AND tz.is_official = true
  AND tz.status <> 'deleted'
  AND (
    lower(tz.name) ~ 'lamot[ _-]*1'
    OR lower(tz.name) ~ 'sto[ ._-]*tomas|santo tomas'
    OR lower(tz.name) ~ 'summit[ _-]*trail'
  );
