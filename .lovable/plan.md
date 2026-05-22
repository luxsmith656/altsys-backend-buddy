
# Build Plan

Scope is huge — I'll ship it as one cohesive change but flag what's foundational vs polish so we can iterate.

## Part A — Quick fixes (small)

1. **Hiker "Message admin" → "Reschedule"**
   - `src/pages/HikerDashboard.tsx`: rename button label + icon; keep underlying `BookingChat` dialog, just default it to the reschedule tab.
   - `src/components/booking/BookingChat.tsx`: add `defaultTab` prop ("chat" | "reschedule").

2. **Admin can reassign guide mid-booking with reason**
   - `src/pages/AdminDashboard.tsx`: in booking row, add "Reassign guide" action. Dialog: new guide dropdown + required reason textarea.
   - Logic: mark old `booking_assignments` row `status='reassigned'`, insert new row `status='pending'` for new guide, post 3 system messages to `booking_messages` (old guide removed, new guide assigned, hiker notified) — all including the reason.
   - Free old guide status to `available` if not on_duty; new guide trigger handles the rest.

## Part B — Offline-first hiking tracker (foundational MVP of "full vision")

This delivers the **architecture and core loop**. Predictions, weather routing, polyline DB compression on the server side, and advanced replay UI ship as follow-ups.

### B1. Storage layer (IndexedDB via `idb`)

New `src/lib/offlineDb.ts`:
- Stores: `sessions`, `points` (GPS samples), `tiles` (cached map tiles as blobs), `syncQueue`.
- Session record: id, bookingId, userId, startTime, endTime, status (active/paused/completed/synced), ascent/descent flags, summary stats.
- Point record: sessionId, lat, lng, alt, accuracy, speed, ts, segment ('ascent'|'descent').

### B2. GPS tracking engine

New `src/lib/tracking/HikeTracker.ts`:
- `navigator.geolocation.watchPosition` with high-accuracy.
- **Kalman-lite smoothing**: reject points with accuracy > 50m unless no better fix in 30s; weighted moving average on lat/lng; altitude EMA.
- **Adaptive interval**: record every 5s when moving, every 30s when idle (<0.5 m/s for 60s).
- **Douglas-Peucker simplification** on session save (epsilon 5m) → stored compressed path.
- Computes live: distance (Haversine), moving time vs resting time, current pace, elevation gain/loss, ascent vs descent segmentation (detects turnaround via cumulative elevation reversal + distance from summit POI).
- **ETA predictor**: Naismith's rule with Tobler's hiking function modifier, calibrated by user's observed pace.

### B3. Offline tile cache

New `src/lib/tracking/tileCache.ts`:
- Bbox + zoom range → fetch OpenTopoMap tiles → store blobs in IndexedDB.
- Custom Leaflet `TileLayer.Offline` that checks cache first, falls back to network, writes-through on success.
- Download progress UI in `TrailStats` (already has a "Download Map" button — wire it up).

### B4. Sync engine

New `src/lib/tracking/syncEngine.ts`:
- On `online` event + every 60s when online: drain `syncQueue` → upload sessions + simplified path to Supabase.
- Sessions go into existing `hiker_sessions`; GPS path into existing `hiker_locations` (batched insert, 500 rows/req).
- Idempotent via client-generated UUIDs.
- Last-known-location ping (every 2 min when online) for live monitoring.

### B5. Auto-start on QR scan

- `src/components/admin/QRCameraScanner.tsx`: on successful scan, in addition to existing confirm, POST a system message AND call new RPC/edge that flips booking→checked_in, then signals the hiker's device.
- Hiker side: `HikerDashboard` polls (or realtime) for `status='checked_in'` → auto-navigates to `/map` and starts `HikeTracker`.

### B6. Map page rebuild

`src/pages/MapPage.tsx`:
- Left rail: live stats (distance, moving time, resting time, elevation gain/loss, current pace, ETA to next checkpoint and summit).
- Map: offline-aware base layer, recorded path live polyline, checkpoints, rescue points, off-trail warning (existing `distanceToTrail`).
- Bottom: Start/Pause/Resume/Stop. On Stop → save summary screen (Strava-style): total distance, gain/loss, ascent time, descent time, moving time, resting time, pace chart, summit badge if reached.

### B7. Admin/guide live monitor

`src/components/admin/RealtimeMonitorMap.tsx`:
- Subscribe to `hiker_locations` via Supabase realtime; show last point per active session.
- **Inactivity alert**: if no new point in 20 min for an active session → flag red, toast admin.
- Status: synced timestamp, online/offline indicator (based on point recency).

### B8. DB migration

- Add columns to `hiker_sessions`: `moving_time_sec`, `resting_time_sec`, `elevation_gain_m`, `elevation_loss_m`, `ascent_time_sec`, `descent_time_sec`, `summit_reached`, `encoded_path` (text, Google polyline), `last_synced_at`, `client_session_id` (text unique).
- Add `rescue_points` table (name, lat, lng, type, location_id, public read, admin manage).
- Add `reassignment_reason` text and `replaced_by` uuid to `booking_assignments`.

## Technical notes

- New dep: `idb` (typed IndexedDB wrapper). Already have `leaflet`/`react-leaflet`.
- No service worker / PWA install (per project rule against PWA in iframe). Offline cache works via IndexedDB only; the page itself still needs an initial load.
- All design tokens from `index.css`; no raw color classes.
- Battery: `enableHighAccuracy:true` only while tracking; release `watchPosition` on stop.

## Out of scope (follow-up)

- Server-side polyline DB compression beyond Google polyline encode
- Weather-aware routing engine
- 3D elevation replay
- Multi-day expedition stitching

After approval I'll run the migration first, wait for confirmation, then ship all code in one pass.
