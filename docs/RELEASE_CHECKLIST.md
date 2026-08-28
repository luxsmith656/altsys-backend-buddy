# Release Gate

`npm run verify` is the local release command. It validates environment configuration, lint, TypeScript project references, Vitest behavior tests with coverage, the production Vite build, and Chromium tests against `vite preview`.

## Protected monitoring

The system monitor is available only at the direct URL `/monitoring`. It is role-protected for `admin` and `super_admin` and is intentionally absent from the normal Navbar and dashboard tabs. An unauthenticated request must redirect to `/login`.

## CI behavior

`.github/workflows/ci.yml` runs on every pull request and every push to `main` or `develop`. Any non-zero lint, typecheck, unit, coverage, build, route, link, responsive, console, network, or authenticated-role result fails the job. No critical step uses `continue-on-error`.

The following GitHub Actions secrets are required before merging:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_SUPABASE_PROJECT_ID`
- `E2E_SUPER_ADMIN_EMAIL`, `E2E_SUPER_ADMIN_PASSWORD`
- `E2E_ADMIN_EMAIL`, `E2E_ADMIN_PASSWORD`
- `E2E_RANGER_EMAIL`, `E2E_RANGER_PASSWORD`
- `E2E_GUIDE_EMAIL`, `E2E_GUIDE_PASSWORD`
- `E2E_HIKER_EMAIL`, `E2E_HIKER_PASSWORD`

Role accounts must be dedicated test accounts in an isolated Supabase project. The browser suite does not create, update, delete, or seed production data.

## Branch protection

In GitHub repository settings, protect `main` and require a pull request plus the `Release verification` status check before merge. Disable direct pushes if the team wants the CI gate to be authoritative. Repository settings are external to this codebase and must be applied by a repository administrator.

## Database migrations

Apply pending files in `supabase/migrations` to the target Supabase project before enabling optional schema-backed features. The guide profile extension flag is `VITE_GUIDE_PROFILE_EXTENSIONS_ENABLED=true`; leave it `false` until the `guide_reviews`, `photo_url`, and `facebook_url` migration is deployed.
