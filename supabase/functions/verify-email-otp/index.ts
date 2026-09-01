import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const SUPABASE_URL = cleanEnv('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = cleanEnv('SUPABASE_SERVICE_ROLE_KEY');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return json({ error: 'Email verification is not configured' }, 503);

  const body = await req.json().catch(() => ({}));
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const challengeId = typeof body.challengeId === 'string' ? body.challengeId : '';
  const otp = typeof body.otp === 'string' ? body.otp.trim() : '';
  if (!/^\S+@\S+\.\S+$/.test(email) || !challengeId || !/^\d{6}$/.test(otp)) {
    return json({ error: 'Invalid verification request' }, 400);
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: challenge, error: readError } = await admin
    .from('email_otp_challenges')
    .select('id,email,code_hash,expires_at,attempts,used_at')
    .eq('id', challengeId)
    .eq('email', email)
    .maybeSingle();
  if (readError || !challenge || challenge.used_at || challenge.attempts >= 5 || new Date(challenge.expires_at).getTime() <= Date.now()) {
    return json({ error: 'This verification code is invalid or expired' }, 400);
  }

  const matches = challenge.code_hash === await sha256(otp);
  await admin.from('email_otp_challenges').update({
    attempts: challenge.attempts + 1,
    ...(matches ? { used_at: new Date().toISOString() } : {}),
  }).eq('id', challenge.id);

  return matches
    ? json({ success: true })
    : json({ error: 'Invalid verification code' }, 400);
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

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
