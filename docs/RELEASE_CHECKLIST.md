# Release Gate

`npm run verify` is the local release command. It validates environment configuration, email-template parity, lint, TypeScript project references, the booking-email Deno Edge Function, Vitest behavior tests with coverage, isolated PostgreSQL migration/RLS tests (`npm run test:db`), the production Vite build, and Chromium tests against `vite preview`.

Resend confirmations require `20260908140000_booking_confirmation_outbox.sql`, the new Edge Function, verified sender and scheduled worker. See `email-templates/README.md`. Local mocks/queue tests never certify live delivery. No provider credentials are used by the default test suite, and no booking-confirmation emails are sent by it.

## Protected monitoring

The system monitor is available only at the direct URL `/monitoring`. It is role-protected for `admin` and `super_admin` and is intentionally absent from the normal Navbar and dashboard tabs. An unauthenticated request must redirect to `/login`.

## CI behavior

`.github/workflows/ci.yml` runs on every pull request and every push to `main` or `develop`. Any non-zero lint, typecheck, unit, database permission, coverage, build, route, link, responsive, console, network, or authenticated-role result fails the job. No critical step uses `continue-on-error`.

The following GitHub Actions secrets are required before merging:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_SUPABASE_PROJECT_ID`
- `E2E_SUPER_ADMIN_EMAIL`, `E2E_SUPER_ADMIN_PASSWORD`
- `E2E_ADMIN_EMAIL`, `E2E_ADMIN_PASSWORD`
- `E2E_MDRRMO_EMAIL`, `E2E_MDRRMO_PASSWORD`
- `E2E_STOTOMAS_ADMIN_EMAIL`, `E2E_STOTOMAS_ADMIN_PASSWORD`
- `E2E_GUIDE_EMAIL`, `E2E_GUIDE_PASSWORD`
- `E2E_HIKER_EMAIL`, `E2E_HIKER_PASSWORD`

Supply these role credentials to the local process too. Missing credentials fail authentication tests; they are never counted as a pass without running. Prefer dedicated accounts in an isolated Supabase project. The default browser suite does not create hikes or payments. Login may write the application's normal authentication/access audit events.

## Owner-authorized live workflow check

The separate `playwright.live.config.ts` runs `tests/live/booking-lifecycle.spec.ts` against the production build and real configured backend. It is excluded from the default suite and CI. Never run it against a live database without the owner's explicit permission.

```powershell
npm run build
$env:ALLOW_LIVE_TEST_WRITES = 'yes'
npx playwright test --config playwright.live.config.ts
```

It uses the existing demo identities and creates a clearly named `TEST KALI FLOW` booking with test-only medical notes. It exercises booking submission, Lamot 2 dispatch, guide acceptance, official-route assignment, headcount check-in, paired hiker/guide sessions, cash/change settlement, session closeout, and review-request persistence. It records simulated payment amounts, not actual money transfers. It does not test physical GPS accuracy, native background recording, payment-provider settlement, or SMS/email delivery.

The booking ID is logged. If a run fails before completion, set `LIVE_BOOKING_ID` to that ID to resume the same test record rather than duplicating it. Do not resume a completed booking. Retain IDs for owner review and deletion. Never use an unrelated booking as a test fixture.

## Connected design preview

`node scripts/preview-guide.mjs` serves the current code at `http://127.0.0.1:3011/`, using `.env` and real login. It does not inject fake API responses or a sample guide session. Kali conversation responses use the existing `trail-chat-rag` Edge Function; local proactive guidance remains available without that function.

The normal `npm run dev` preview is at `http://127.0.0.1:3000/`. Both use the same source and backend configuration.

## Branch protection

In GitHub repository settings, protect `main` and require a pull request plus the `Release verification` status check before merge. Disable direct pushes if the team wants the CI gate to be authoritative. Repository settings are external to this codebase and must be applied by a repository administrator.

## Database migrations

For the currently missing guide profile/review schema, use `20260908120000_restore_guide_reviews.sql` and the manual instructions in `docs/DATABASE_UPDATE_2026_09_08.md`. It restores `guide_reviews`, `photo_url`, and `facebook_url` and supersedes the older review migration's permissive policies. Do not blindly replay all historical migrations in the SQL editor. Guide pages recognize the legacy guide shape without `photo_url` and do not query the absent review table. The guide dashboard explicitly labels reviews unavailable in that state; a passing legacy-layout test does not mean review submission or photo persistence has been deployed. Do not rely on the old `VITE_GUIDE_PROFILE_EXTENSIONS_ENABLED` example setting as a database migration. Hosted Auth settings and email-provider template configuration are separate from SQL.

## Context-aware Kali guidance

Kali's proactive guidance is local-first and deterministic. Age consistency, minor review, group-size guidance, booking reminders, and weather severity are evaluated in the browser from the data already available to the page. Weather snapshots are cached locally for offline display and marked stale when older than six hours. This feature does not require an AI provider or `SUPABASE_ACCESS_TOKEN`; the existing Supabase URL and publishable key are still required by the application's authentication and booking services.
