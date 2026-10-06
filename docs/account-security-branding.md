# Account Recovery and Sign-In Branding

## Supabase hosted authentication emails

The confirmation and recovery sources are `supabase/templates/confirmation.html` and `supabase/templates/recovery.html`; their subjects and local paths are in `supabase/config.toml`. The hosted project does not read these files automatically. In Lovable Cloud's Supabase project (project ref `evcqnlbumsfgbfddoonv`), or the linked Supabase dashboard:

1. Open **Authentication → Email Templates → Confirm signup**. Set the subject to `Confirm your Mt. Kalisungan account` and paste `supabase/templates/confirmation.html` into the body.
2. Open **Authentication → Email Templates → Reset Password**. Set the subject to `Reset your Mt. Kalisungan password` and paste `supabase/templates/recovery.html` into the body.
3. In **Authentication → URL Configuration**, allow `https://mtkali.vercel.app/reset-password` as a redirect URL. Add local preview origins only when password recovery is tested there.
4. For the sender name/address and reliable delivery, configure SMTP with a verified sending domain. Use a sender such as `Mt. Kalisungan <accounts@verified-domain>` only after that domain is verified with the mail provider. Do not use the Vercel subdomain as if it were owned for DNS verification.

Adding a confirmation template does not enable signup verification. The existing signup behavior remains unchanged unless the hosted **Confirm email** toggle is deliberately enabled.

The hosted template must preserve Supabase’s `{{ .ConfirmationURL }}` variable. The link returns to `/reset-password`, where the app validates the recovery session and accepts the new password.

## Google sign-in branding

The Firebase project ID and `authDomain` are authentication identifiers; changing them in frontend code would break sign-in. The existing project is `altsys-backend-buddy`; its Firebase display names are **Mt Kalisungan System**, and the Google OAuth app name is **Mt Kalisungan**. Do not rename the project ID or change `authDomain` to the Vercel hostname.

Google's account chooser's “continue to” line uses the Firebase `authDomain`, which explains why it still shows `altsys-backend-buddy.firebaseapp.com` even after the visible OAuth app name was changed. Replacing that domain requires a domain the project owner controls, configured for Firebase Hosting and added as an authorized OAuth redirect domain. `mtkali.vercel.app` is Vercel-managed; it is not a custom domain that can safely be pointed at Firebase Authentication. Keep the current auth domain until an owned custom domain is available and fully configured.

Google supplies each person's name from their Google profile. The app stores that as the account's `full_name`; it is distinct from the product name shown on the OAuth consent screen.
