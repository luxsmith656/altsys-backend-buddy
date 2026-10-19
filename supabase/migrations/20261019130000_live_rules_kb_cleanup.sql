-- Keep the searchable knowledge base from competing with Central's live rules.
-- Current fares, schedules, capacities, group limits and official route facts
-- are served by database-backed tools and the LIVE SYSTEM RULES block.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

UPDATE public.kb_chunks
SET content = CASE title
  WHEN 'Trails and difficulty' THEN
    'Official route names, station sequence, distance, elevation and difficulty are published per jump-off in the database. Use the live route data supplied for the selected trailhead; never substitute a generic route or a route from another trailhead.'
  WHEN 'Recommended start times' THEN
    'Start-time options and hike-type windows are controlled by Central and may change. Read the live schedule for the selected trailhead and date before recommending a time.'
  WHEN 'Registration and booking policy' THEN
    'Every hiker must be registered before climbing. Bookings are made per group with a booking date, start time, group size and hike type. Confirmation, capacity, pending holds, rescheduling and duplicate-booking rules are enforced from the live database settings and booking workflow.'
  WHEN 'Fees' THEN
    'Published entry, environmental, guide, peak, horse-rescue and other fees come from Central''s live pricing configuration. Quote only the current database values; if they are unavailable, direct the user to the booking page or staff.'
  WHEN 'Capacity and availability' THEN
    'Capacity mode, group limits, daily limits, pending holds and slot availability are live Central settings. Only the current database response can establish whether a date or start time is available; missing data is unknown rather than closed.'
  ELSE content
END,
content_hash = encode(digest(CASE title
  WHEN 'Trails and difficulty' THEN
    'Official route names, station sequence, distance, elevation and difficulty are published per jump-off in the database. Use the live route data supplied for the selected trailhead; never substitute a generic route or a route from another trailhead.'
  WHEN 'Recommended start times' THEN
    'Start-time options and hike-type windows are controlled by Central and may change. Read the live schedule for the selected trailhead and date before recommending a time.'
  WHEN 'Registration and booking policy' THEN
    'Every hiker must be registered before climbing. Bookings are made per group with a booking date, start time, group size and hike type. Confirmation, capacity, pending holds, rescheduling and duplicate-booking rules are enforced from the live database settings and booking workflow.'
  WHEN 'Fees' THEN
    'Published entry, environmental, guide, peak, horse-rescue and other fees come from Central''s live pricing configuration. Quote only the current database values; if they are unavailable, direct the user to the booking page or staff.'
  WHEN 'Capacity and availability' THEN
    'Capacity mode, group limits, daily limits, pending holds and slot availability are live Central settings. Only the current database response can establish whether a date or start time is available; missing data is unknown rather than closed.'
  ELSE content
END, 'sha256'), 'hex')
WHERE title IN (
  'Trails and difficulty',
  'Recommended start times',
  'Registration and booking policy',
  'Fees',
  'Capacity and availability'
);
