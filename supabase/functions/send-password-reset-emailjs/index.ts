import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import {
  DEFAULT_EMAILJS_PASSWORD_RESET_TEMPLATE_ID,
  emailJsConfigFromEnv,
  sendEmailJs,
} from '../_shared/emailjs.ts';

const env = (name: string) => (Deno.env.get(name) ?? '').trim().replace(/^['"]|['"]$/g, '');
const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
});
const emailJs = emailJsConfigFromEnv((name) => Deno.env.get(name), 'EMAILJS_PASSWORD_RESET_TEMPLATE_ID', DEFAULT_EMAILJS_PASSWORD_RESET_TEMPLATE_ID);
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Cache-Control': 'no-store', 'Content-Type': 'application/json' },
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ success: false, error: 'Method not allowed' }, 405);

  const body = await req.json().catch(() => ({}));
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!/^\S+@\S+\.\S+$/.test(email)) return json({ success: false, error: 'Enter a valid account email address.' }, 400);

  const redirectTo = safeResetUrl(body?.app_url);
  try {
    const { data, error } = await admin.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: { redirectTo },
    });

    // Keep unknown-account responses indistinguishable from successful requests.
    if (error || !data?.properties?.action_link) return json({ success: true });

    const fullName = typeof data.user?.user_metadata?.full_name === 'string'
      ? data.user.user_metadata.full_name.slice(0, 80)
      : 'there';
    await sendEmailJs(fetch, emailJs, {
      to_email: email,
      email,
      to_name: fullName,
      name: 'Mt. Kalisungan System',
      reset_link: data.properties.action_link,
    });
    return json({ success: true });
  } catch (error) {
    console.error('[send-password-reset-emailjs] delivery failed', error instanceof Error ? error.message : 'unknown error');
    return json({ success: false, error: 'Password reset email could not be sent. Please try again.' }, 502);
  }
});

function safeResetUrl(value: unknown) {
  const fallback = 'https://mtkali.vercel.app/reset-password';
  if (typeof value !== 'string') return fallback;
  try {
    const requested = new URL(value);
    const allowed = new Set([
      'https://mtkali.vercel.app',
      'http://localhost:3000',
      'http://127.0.0.1:3000',
    ]);
    return allowed.has(requested.origin) ? `${requested.origin}/reset-password` : fallback;
  } catch {
    return fallback;
  }
}
