# Supabase Auth email templates

`confirmation.html` and `recovery.html` are the branded Mt. Kalisungan templates used by Supabase Auth.

For local Supabase development, `supabase/config.toml` points at these files. For the hosted project, paste the same HTML into **Authentication → Email Templates → Confirm signup** and **Reset Password** because hosted Auth settings are managed in the Supabase dashboard.

Both templates use `{{ .ConfirmationURL }}` and return users to `https://mtkali.vercel.app/auth/callback` or `https://mtkali.vercel.app/reset-password` through the redirect URL supplied by the app.
