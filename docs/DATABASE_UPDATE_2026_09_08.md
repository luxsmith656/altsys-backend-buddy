# Manual Database Update

## SQL to run

The newest migration is `supabase/migrations/20260908140000_booking_confirmation_outbox.sql`, for the Resend booking-confirmation queue. It adds a queue/trigger, not email or SMS verification. Run it after the review migration below. It does not send or backfill historical bookings. Sending additionally requires the Edge Function, verified sender and scheduled worker described in `email-templates/README.md`; SQL alone cannot send emails. Both migrations are provided for manual review and have not been applied to the live project in this work.

Open `supabase/migrations/20260908120000_restore_guide_reviews.sql` and run the **entire file** in the SQL editor for this app's existing Lovable/Supabase project. It contains its own transaction and schema-cache reload. Running it a second time preserves existing reviews.

This update adds the missing guide photo/Facebook fields and guide-review table. It requires the existing `guides`, `bookings`, `booking_assignments`, `user_locations`, and `has_role` setup. It does not create/reset accounts, change routes, move guides, modify payments, or apply unrelated historical migrations.

Do not run `20260901120000_email_otp_challenges.sql` for this update: that older migration supports the verification flow being retired. Existing OTP data is not deleted automatically. Do not run every historical migration indiscriminately against the live project.

## Review permissions

- A booking owner can review an actually assigned guide only after the booking is completed.
- The same booking/reviewer/guide combination cannot be inserted twice.
- A location admin can moderate reviews only for bookings in their assigned location; central admin can moderate across locations.
- Approved reviews remain visible on public guide profiles. Moderation can change visibility, not rewrite the review author's text, rating or booking.
- Existing reviews are preserved, including legacy records whose booking has since been removed. New reviews must have an eligible booking.

## Check after running

Run this read-only check, then reload the guide account:

```sql
SELECT to_regclass('public.guide_reviews') AS reviews_table;

SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'guides'
  AND column_name IN ('photo_url', 'facebook_url');

SELECT policyname, cmd, permissive
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'guide_reviews'
ORDER BY policyname;
```

Expected: the review table, both profile columns, and the review policies. This check establishes schema presence, not successful photo upload, review delivery, or every database permission.

## Removing signup verification

SQL does not configure hosted Supabase Auth. Disable **Confirm Email** in the project's email authentication settings through Lovable/its connected Supabase settings. Keep email/password sign-in enabled. Password recovery and the Google sign-in token exchange remain authentication mechanisms, not the removed custom signup OTP screen.

See the [Supabase authentication configuration documentation](https://supabase.com/docs/guides/auth/general-configuration). Disabling confirmation means a new email address is not independently verified, so a typo or address entered by someone else is possible. Do not put medical notes, companion details, or other sensitive information in booking-confirmation emails. These settings have **not** been changed by this local code update.

Read-only verification on 2026-09-08: hosted Auth returned `mailer_autoconfirm: false`, email authentication enabled, phone authentication disabled, and signup enabled. The confirmation setting therefore still needs changing for immediate password signup.

## Test evidence

`npm run test:db` executes the real SQL in a disposable PGlite PostgreSQL database with seeded users, guides, bookings and role policies, never against the production URL. The old review migration failed three new checks (unfinished booking, unrelated guide, cross-location admin). The replacement passed twelve checks, including legacy-policy replacement, preservation of existing reviews, and protection against staff rewriting an author's text. This is a targeted schema/RLS test, not a claim that every production migration or external integration has been verified.

Email delivery also requires the Resend setup in `email-templates/README.md`; the old EmailJS client path is retired. The outbox migration has seven additional isolated PostgreSQL tests covering confirmation-only enqueue, leases, sent-state persistence, cancellation, retry expiry and service-role-only access.
