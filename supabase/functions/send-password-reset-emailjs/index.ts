import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { passwordResetHandler } from './handler.ts';
import {
  DEFAULT_EMAILJS_BOOKING_TEMPLATE_ID,
  DEFAULT_EMAILJS_PASSWORD_RESET_TEMPLATE_ID,
  emailJsConfigFromEnv,
} from '../_shared/emailjs.ts';

Deno.serve(async (req: Request) => {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) {
    return new Response(JSON.stringify({ error: 'Password-reset email is not configured' }), {
      status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return passwordResetHandler(req, {
    headers: corsHeaders,
    config: {
      serviceId: Deno.env.get('EMAILJS_SERVICE_ID')?.trim() ?? '',
      publicKey: Deno.env.get('EMAILJS_PUBLIC_KEY')?.trim() ?? '',
      privateKey: Deno.env.get('EMAILJS_PRIVATE_KEY')?.trim() ?? '',
       templateId: emailJsConfigFromEnv(
         (name) => Deno.env.get(name),
         'EMAILJS_PASSWORD_RESET_TEMPLATE_ID',
         DEFAULT_EMAILJS_PASSWORD_RESET_TEMPLATE_ID,
         [DEFAULT_EMAILJS_BOOKING_TEMPLATE_ID, 'template_dcs8uaj'],
       ).templateId,
    },
    generateLink: (email, redirectTo) => admin.auth.admin.generateLink({
      type: 'recovery', email, options: { redirectTo },
    }),
    fetcher: fetch,
    report: event => console.info('password_reset_emailjs', event),
  });
});
