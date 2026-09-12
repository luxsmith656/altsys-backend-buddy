# Local Preview Review - 2026-09-09

## Preview
- Landing: http://127.0.0.1:3000/
- Guide: http://127.0.0.1:3000/guide (sign in normally)
- Same React source, real Supabase project and authentication; no injected design-preview session.
- No commit, push, database schema deployment or Vercel deployment was performed in this work.

## September 9 Follow-up: Floating Map Dock
- Owner-approved local design replaces the interim sidebar/bottom strip and Map/Tracker/Editor toolbar. Groups, Routes and Tools share a compact bottom-center dock; only one short panel opens above it, without resizing the map or navigating to a separate screen.
- Routes lists published trails and opens the existing route editor. Its mobile bounds leave the dock accessible; returning to the live map is tested. Right-side zoom/locate controls remain available. Simulation controls use the same floating panel.
- Focused production-build browser checks passed on admin/guide at 360x740, 844x390 and 1440x900, including route preview, editor return, group details, simulation and repeated live/simulation switching. Screenshots were inspected on mobile and desktop; the signed-in local admin also opened its actual published route and returned from the editor.
- Final `npm run verify`: PASS, exit 0 (`map-dock-final-verify.log` in the local temporary directory): 214 unit tests in 39 files, 19 isolated database tests, 64 browser tests, environment/template validation, TypeScript including the email function, and production build. Lint: 0 errors, 414 existing warnings. Existing bundle-size/dependency concerns and external-service limitations below remain. No push or deployment.

## Booking Receipts Follow-up
- Hiker bookings now open a scrollable details/receipt dialog before and after a hike. Guide details use the same charge calculation and current assignment data. The receipt shows original quote when available, current/final charges, horse help, named expenses, payment, balance, references and price history.
- New online and walk-in bookings preserve their original quote. Older records without a snapshot display an earliest recorded total from history or explicitly say Not recorded; historical prices were not backfilled or invented.
- Admin Edit Payment & Services supports named expenses such as water and porter, saved in existing booking notes JSON. Reopening retains these items. Checkout includes them and does not double-count legacy peak/horse fees already included by a price edit. The editor also uses the booking's morning/night/overnight guide rate.
- Reschedule and cancellation controls are excluded for started/completed hikes, including completion metadata or linked completed sessions. Reschedule submission rechecks current booking/session state and compares the loaded booking state before writing.
- No database migration is required for these JSON metadata fields. No live charges, payments, booking mutations, deployment or Git push were performed for these tests.
- Final `npm run verify`: exit 0 (`receipt-complete-verify.log` in the local temporary directory). 228 unit tests, 19 isolated database tests, 66 Chromium tests passed, with 0 lint errors and 414 existing warnings. TypeScript and production build passed. Receipt/expense browser tests use synthetic records; actual payment-provider processing is not certified.

## Earlier September 9 Follow-up: Compact Map and Movable Kali
- The previous interim panel started closed, with a 32% mobile height and 272px desktop width. It has now been replaced by the owner-approved floating dock above.
- Global Kali quick-actions bubble supports pointer/touch dragging, bounds checking after resize, arrow-key movement and Home reset. It uses only component state, returning to bottom-left after reload. On the guide dashboard it starts above the fixed mobile navigation to keep Assignments reachable.
- A proven route disappearance case was fixed: successful published geometry is displayed before live-session queries complete, and transient route refresh failures preserve previously validated geometry. Successful empty results still remove unpublished routes; changing location remounts the scoped map. This does not establish offline route-cache support or prove every possible reload race is resolved.
- `npm run verify` passed, exit 0: 214 unit tests, 19 isolated database tests, 64 browser tests, TypeScript and production build. Lint: 0 errors, 414 existing warnings. Log: `kali-compact-path-verify.log` in the local temporary directory.
- The first follow-up full run correctly caught Kali overlapping the guide's fixed navigation; corrected placement passed the next full run. Touch/mouse dragging, accidental activation prevention, menu reachability, resizing and reload reset are browser-tested.
- Email setup is paused at the owner's request. GPS-to-jump-off directions, routing alternatives and a separate Map/Groups layout are proposals only; no device-location prompt or routing-provider request was added.

## Fog
The original landing layout and photograph remain. Different upper/lower textures move right/left. Each lane uses four tail-blended tiles, constant opacity and matching cycle boundaries. Tile size remains 160% of hero width and 65% of height, upper top 4%, lower bottom -12%. Soft vertical masks separate the upper/lower banks; only transparent tails within each bank overlap to prevent hard edges or empty strips. Fog cannot intercept controls. Offscreen/reduced-motion behavior is preserved; no pause/play button. Browser compositor checks sample twelve phases per bank and test loop continuity.

## Map and booking email
- Shared admin/guide map workspace now uses the floating dock described above, reachable zoom/locate controls and live group details with guide, phase and last GPS update. ETA is unavailable when reliable pace is missing.
- Booking confirmation now uses a server-side Resend function and durable confirmation outbox, not EmailJS or SMS. New HTML retains the supplied green branding and embeds the logo in sent messages. Includes confirmed Manila date/time, guide/contact, jump-off, pax and the day-before call reminder.
- Preview: `email-templates/booking-confirmation-preview.html`. Editable template: `email-templates/booking-confirmation.html`. `npm run email:sync` regenerates the preview and server template; CI rejects drift.
- Required manual SQL and setup: `docs/DATABASE_UPDATE_2026_09_08.md` and `email-templates/README.md`. No migration, function, sender or scheduled worker was deployed in this work.

## Earlier Executed Checks - September 9
- Full `npm run verify`: PASS, exit 0 (`kali-final-verify-3.log` in the local temporary directory).
- Environment validation and email template/preview parity: PASS.
- Lint: 0 errors, 414 warnings. TypeScript, including the Deno email function: PASS.
- Vitest: 39 files, 213 tests passed; 84.94% line coverage in the configured scope.
- Disposable PostgreSQL tests: 19 passed, 0 failed. No production database writes by these tests.
- Production build: PASS. Chromium production-build suite: 62 passed, including real role login/reload and fixture-backed map, guide, email and Kali interactions.
- Focused route/auth/guide/email checks: 34 passed. Map regression suite repeated three times: 18 passed.
- The first full runs correctly failed: stale map title expectation, premature guide reload/resource contention, then a genuine Leaflet zoom-completion callback after map removal. The expected map content was updated and strengthened, guide data readiness is awaited, worker count is bounded, and the affected Leaflet CSS zoom animation is disabled. Zoom remains functional; rapid live/simulation switching is now exercised repeatedly.
- Playwright discovers browser specs only; database tests run independently through the mandatory `test:db` gate.
- `git diff --check`: PASS. Dependency advisories and existing lint/bundle warnings remain; these checks do not certify all production integrations.
- The local signed-in admin map also opened an actual group and its guide/route/phase. Missing GPS was labeled Awaiting GPS, with locate disabled rather than an invented position.

## Earlier Executed Checks (Historical)
- npm ci: PASS; 27 dependency advisories reported (2 low, 5 moderate, 19 high, 1 critical), not broadly upgraded here.
- npm run verify: PASS after corrections.
- Lint: 0 errors, 420 warnings. TypeScript: PASS.
- Vitest: 34 files, 143 tests passed; 84.11% line coverage within the configured coverage scope.
- Production build: PASS, with existing bundle-size and Browserslist-age warnings.
- Chromium production-build suite: 51 passed, including role login/reload, routes, links, responsive views, guide controls/referral, Kali UI, fog motion and continuity.
- Focused guide/fog browser checks: 11 passed.
- Static review identified notification-history compatibility and partial-settlement retry problems; both have failing-before/passing-after regression tests and fixes.

## Earlier Owner-Authorized Live Test
The final live test verified a real authenticated Kali SSE reply with hiker context and the five-hiker guide limit. It also verified booking persistence at Lamot 2, admin assignment, guide acceptance, approved recorded-route assignment, explicit headcount check-in, paired hiker/guide sessions, checkout, and simulated settlement: PHP 1000 tendered, PHP 850 paid, PHP 150 change. The booking completed, sessions closed, and a guide-review request timestamp persisted.

That earlier live runtime monitor correctly FAILED on the following. The replacement email code and SMS removal below have not been re-deployed or delivery-tested against a real recipient:
- EmailJS HTTP 422: provider reported an empty recipient address. Reservation template recipient configuration still needs verification.
- Firestore notification creation: unhandled permission denial. Supabase login does not by itself authorize Firebase writes. Do not loosen access rules to hide this.
- SMS HTTP 400: intentionally synthetic test phone rejected as invalid/not allowed. No SMS delivery was verified; use a separately approved real recipient for delivery testing.

## Retained Test Records
The owner explicitly authorized test writes to this project and later deletion. These clearly labeled TEST KALI FLOW records were observed completed/settled:
- 44702911-e763-4ee5-9935-3b7f07595d2e
- 43110398-cd8b-4977-a33e-877854037430
- c5decdcd-00b5-4efc-b458-255ed3196c2c

Notes mark these as automated tests with no actual hike or money. Simulated amounts affect totals until the owner deletes them. Never resume completed records for another collection.

## Location Correction
With explicit approval, Test Guide and previously approved routes were assigned to Lamot 2 without changing geometry. Empty placeholders are excluded from dispatch; the valid approved 417-point recording is eligible. Pending recordings remain drafts.

## Remaining Work
- Apply the replacement `20260908120000_restore_guide_reviews.sql` migration manually after review; twelve isolated PostgreSQL tests cover its permissions and legacy preservation. The guide dashboard labels reviews unavailable on legacy schema; that does not certify live review submission or photo persistence.
- Apply `20260908140000_booking_confirmation_outbox.sql`, deploy the email function, set verified Resend sender and worker secret, then enable the scheduled worker. Seven isolated database tests cover the queue. Verify delivery to one approved real test recipient; no historical backfill or bulk send is configured.
- Resolve production Firebase notification write permissions without loosening access rules. Hosted Auth's Confirm Email remains enabled as last checked; custom signup OTP screens were removed locally, not the hosted setting.
- Settlement is still multiple API writes, not a server-side transaction. Post-payment sync failures now refresh/close the collection dialog and surface follow-up warnings instead of offering duplicate collection.
- Physical GPS, native screen-off recording, no-signal recovery, peak/descent transitions, external payment providers and every action of every role were not fully exercised.
- Admin/guide live-map redesign is implemented locally with browser interaction checks. Physical-device field testing remains necessary.
- Dependency advisories, lint warnings, bundle size and existing placeholder marketing/review content need separate review.

**Release status: BLOCKED for an all-function production release. Local fog/design preview is available. Nothing pushed.**

## Working-Tree Files
Includes earlier work continued in this task, not only the final fog patch.
- `docs/RELEASE_CHECKLIST.md`
- `package-lock.json`
- `package.json`
- `playwright.config.ts`
- `src/components/admin/DemographicsTab.tsx`
- `src/components/admin/EndHikeSettlementDialog.tsx`
- `src/components/admin/OverviewDashboard.tsx`
- `src/components/admin/RealtimeMonitorMap.tsx`
- `src/components/booking/BookingAIChat.tsx`
- `src/components/booking/GlobalAIAssistant.tsx`
- `src/components/booking/OffDutyManager.tsx`
- `src/components/kali/KaliAvatar.tsx`
- `src/components/kali/KaliContextPanel.tsx`
- `src/components/landing/TrailGallery.tsx`
- `src/components/layout/Navbar.tsx`
- `src/hooks/useLocations.tsx`
- `src/lib/activity-log.ts`
- `src/lib/kaliContext.ts`
- `src/lib/notifications.ts`
- `src/lib/payments.ts`
- `src/pages/AdminDashboard.tsx`
- `src/pages/BookingPage.tsx`
- `src/pages/CentralDashboard.tsx`
- `src/pages/ChatPage.tsx`
- `src/pages/GuideDashboard.tsx`
- `src/pages/Index.tsx`
- `src/pages/MapPage.tsx`
- `src/pages/NotificationsPage.tsx`
- `src/test/kaliContextPanel.test.tsx`
- `tests/e2e/authenticated-roles.spec.ts`
- `tests/support/runtime-monitor.ts`
- `docs/mountain-mist-asset.md`
- `playwright.live.config.ts`
- `scripts/preview-guide.mjs`
- `src/assets/mountain-mist-low.webp`
- `src/assets/mountain-mist.webp`
- `src/components/kali/kali-avatar.css`
- `src/components/landing/MountainMist.tsx`
- `src/components/landing/mountain-mist.css`
- `src/lib/adminOverview.ts`
- `src/lib/kaliPersonality.ts`
- `src/lib/officialRoutes.ts`
- `src/pages/guide-dashboard.css`
- `src/test/activityLog.test.ts`
- `src/test/adminOverview.test.ts`
- `src/test/centralRevenue.test.ts`
- `src/test/endHikeSettlement.test.tsx`
- `src/test/kaliAvatar.test.tsx`
- `src/test/kaliPersonality.test.ts`
- `src/test/locationLoadingRace.test.tsx`
- `src/test/notificationSubscriptions.test.tsx`
- `src/test/officialRoutes.test.ts`
- `tests/e2e/guide-design.spec.ts`
- `tests/e2e/guide-referral.spec.ts`
- `tests/e2e/kali-conversation.spec.ts`
- `tests/e2e/landing-design.spec.ts`
- `tests/live/`
- `tests/support/guide-fixture.ts`
- `docs/LOCAL_PREVIEW_REVIEW.md`
