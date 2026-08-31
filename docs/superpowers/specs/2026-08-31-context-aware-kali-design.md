# Context-Aware Kali Guidance Design

## Goal

Add a local-first, role-aware Kali guidance surface that proactively flags booking age changes, minors, group guide requirements, weather risk, and confirmed-booking reminders without changing the existing authentication, booking, or Supabase data model.

## Scope

- Add a pure context engine that turns normalized booking, weather, role, and current-time facts into a small set of actionable insights.
- Reuse the existing Open-Meteo forecast adapter and cache successful results locally with an explicit stale/unavailable state.
- Add one reusable Kali avatar that crops the supplied sprite sheet to show one expression at a time.
- Add a collapsible desktop side panel and a mobile floating bubble/bottom sheet. It must not cover primary form controls or map content.
- Surface the panel on booking, hiker, guide, admin, central, ranger, and MDRRMO contexts through the existing app shell.
- Keep the existing free-form chat assistant separate.

## Safety and Data Boundaries

- The persisted booking snapshot remains the source for later age comparison; the browser assistant only flags a mismatch and never approves or rejects a person.
- Server-side authentication, RLS, admin check-in, and booking persistence stay authoritative.
- No Supabase service-role key, deployment access token, or remote AI call is required for proactive prompts.
- Weather advice is advisory. A forecast is labeled with its retrieval time and is never described as current when it is stale or unavailable.
- MDRRMO and staff copy must not expose personal data beyond what existing role-controlled pages already provide.

## Rules

- Minor: age 0-17. A saved age and current age that differ by at least one year produce a high-priority review insight.
- Group size above five explains that two guides are required for front/back coverage while preserving one group.
- Severe conditions produce `avoid`; rain or elevated risk produces `caution`; clear conditions produce `go`.
- A confirmed booking within seven days produces a reminder with the local Manila date/time.
- Copy is role-aware and distinguishes hiker, guide, admin, ranger, central admin, and MDRRMO.

## Visual Direction

Use `src/assets/kali-ai.png` as a sprite sheet. `KaliAvatar` clips a fixed square and selects a source region using a semantic expression key (`alert`, `review`, `map`, `happy`, `thinking`). Desktop uses a right-side rail that can collapse to a narrow tab; mobile uses a single circular trigger and bottom sheet. The panel is fixed above safe-area insets and has bounded scrolling.

## Verification

- Unit tests exercise every rule and weather severity branch with real return values.
- Component tests cover avatar expression selection, panel collapse/expand, role copy, and mobile trigger semantics.
- Existing lint, typecheck, unit, production build, and Playwright suites remain required.
- No test is allowed to pass solely by checking that an export exists.
