import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const RESEND_API_KEY = cleanEnv('RESENDAPI') || cleanEnv('RESEND_API_KEY');
const RESEND_FROM_EMAIL = cleanEnv('RESEND_FROM_EMAIL') || 'Mt. Kalisungan <onboarding@resend.dev>';
const SUPABASE_URL = cleanEnv('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = cleanEnv('SUPABASE_SERVICE_ROLE_KEY');
const CHALLENGE_TTL_MINUTES = 10;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!RESEND_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: 'Email verification is not configured' }, 503);
  }

  const body = await req.json().catch(() => ({}));
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 80) : 'Hiker';
  if (!/^\S+@\S+\.\S+$/.test(email)) return json({ error: 'Enter a valid email address' }, 400);

  const otp = randomOtp();
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const codeHash = await sha256(otp);
  const { data: challenge, error: insertError } = await admin
    .from('email_otp_challenges')
    .insert({
      email,
      code_hash: codeHash,
      expires_at: new Date(Date.now() + CHALLENGE_TTL_MINUTES * 60_000).toISOString(),
    })
    .select('id')
    .single();
  if (insertError || !challenge?.id) return json({ error: 'Could not create email verification challenge' }, 500);

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: RESEND_FROM_EMAIL,
      to: [email],
      subject: 'Your Mt. Kalisungan verification code',
      text: `Hi ${name}, your Mt. Kalisungan verification code is ${otp}. It expires in ${CHALLENGE_TTL_MINUTES} minutes.`,
      html: `<p>Hi ${escapeHtml(name)},</p><p>Your Mt. Kalisungan verification code is:</p><p style="font-size:28px;font-weight:700;letter-spacing:8px">${otp}</p><p>This code expires in ${CHALLENGE_TTL_MINUTES} minutes.</p>`,
    }),
  });

  if (!response.ok) {
    await admin.from('email_otp_challenges').delete().eq('id', challenge.id);
    const result = await response.json().catch(() => ({}));
    const detail = typeof result.message === 'string' ? result.message : 'Resend could not deliver the email';
    console.error('Resend delivery failed', response.status, detail);
    const sandboxed = /only send testing emails/i.test(detail);
    return json({
      error: sandboxed
        ? 'Email sending is still in test mode: a sender domain must be verified before codes can be sent to this address.'
        : detail,
    }, 502);
  }


  return json({ success: true, challengeId: challenge.id });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function cleanEnv(name: string) {
  return (Deno.env.get(name) ?? '').trim().replace(/^["']|["']$/g, '');
}

function randomOtp() {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return String((values[0] % 900000) + 100000);
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character] ?? character);
}
