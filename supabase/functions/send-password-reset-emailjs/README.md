# Password-reset email via EmailJS

Public POST body: `{ "email": "hiker@example.com", "app_url": "https://mtkali.vercel.app" }`.

Required server environment variables: `EMAILJS_SERVICE_ID`, `EMAILJS_PUBLIC_KEY`, `EMAILJS_PRIVATE_KEY`, `EMAILJS_PASSWORD_RESET_TEMPLATE_ID`. The Auth service URL and service-role key are supplied by the hosting environment; never copy them into frontend code.

The configured EmailJS template must be the branded Mt. Kalisungan password-reset template. Set its recipient to `{{to_email}}` and its reset button/link to `{{reset_link}}` (aliases `reset_url` and `confirmation_url` are also supplied). Other parameters are `email`, `to_name`, and `app_name`. Existing branded HTML in `supabase/templates/recovery.html` can be used in EmailJS by replacing all `{{ .ConfirmationURL }}` placeholders with `{{reset_link}}`. This repository cannot inspect or change the template saved in EmailJS.

The redirect is limited to known app origins and always uses `/reset-password`. The corresponding full redirect URL must also be allowed in hosted Auth settings. No client login is required. Valid requests return the same generic success message for missing accounts, Auth errors, and provider errors; success is acknowledgment, not proof of email delivery. Server logs contain fixed event names only, never addresses, keys, links, or provider response bodies.

Verification: deployed production endpoint accepted public OPTIONS (200), invalid email POST (400), and a non-existent test address POST (200). The privacy and recovery tests passed. Actual inbox delivery and the remotely configured EmailJS template have not been verified. Frontend password-reset behavior is unchanged; this endpoint is not wired into the existing email reset button by this task.