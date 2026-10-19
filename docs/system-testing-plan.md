# ProjectBundok System Testing Plan

## Corrected page mapping

| Manuscript context | Real route and component |
| --- | --- |
| Trail Assistant | `/chat` (`ChatPage`) and the shared `BookingAIChat` on `/booking` |
| Hiker Dashboard | `/hiker` (`HikerDashboard`) |
| Guide Portal | `/guide` (`GuideDashboard`) |
| Local Admin Operations / Check-in | `/admin?tab=requests` (`AdminDashboard`) |
| Local Admin Management | `/admin?tab=management` (`AdminDashboard`) |
| Central Dashboard / Analytics | `/central` and `/admin?tab=reports` (`CentralDashboard`, `CentralAnalyticsReporting`) |
| Operations Assistant | `/ops-ai` (`OpsAIPage`) |
| Ranger Operations | `/ranger` (`RangerDashboard`) |
| MDRRMO Operations | `/mdrrmo` (`MDRRMODashboard`) |

The manuscript paths `/hiker/assistant`, `/guide/assignments`, `/local-admin/*`, and `/central-admin/*` are labels, not routes, and were not renamed.

## Existing coverage and gaps before coding

Existing tests covered context insights, 24-hour memory, personality/quick replies, offline role help, weather presentation, role/tool matrix, GPS filtering, map monitor rendering, session authorization, and location age. Direct thesis assertions were missing for reservation/weather intent, malformed weather responses, incomplete reservation details, guide PII allowlisting, live check-in semantics, central aggregate output, deterministic mutation refusal, and guide booking prevention. The manuscript also had no GPS results table and no reproducible k6 script in the checked tree.

## Schema findings

- Bookings use UUID `bookings.id`; no `#BK-9021` reference column was found in `src`, migrations, or `DATABASE_SCHEMA.md`.
- Check-in is represented by `hiker_sessions` rows and the attendance RPCs, keyed by `booking_id`, `location_id`, `status`, and `start_time`.
- Guide assignments are stored in `booking_assignments`, joined to `guides` and `bookings`; guide names are stored in `guides.full_name`.

## Fix plan

1. Reuse `_shared/ai-role-scope.ts` and `_shared/ai-access.ts`, adding one pure policy module for shared intent, refusal, incomplete-detail, weather-validation, and guide-safe projection rules.
2. Apply deterministic guards before model/tool execution in both Edge Functions; make live-data retrieval fail explicitly instead of silently falling through to guessing.
3. Prevent guides from booking through the real booking page and the server-backed assistant CTA.
4. Add thesis fixtures, deterministic tests, GPS system tests, a non-CI opt-in live evaluator, and load/compatibility artifacts.
5. Run the available gates, generate results from actual runs, and mark live credentials/device/production-load checks as Not run when unavailable.

