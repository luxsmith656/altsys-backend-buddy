// Resets a password after the user proves phone ownership via Firebase Phone Auth (SMS code).
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createRemoteJWKSet, jwtVerify } from 'npm:jose@5';

const clean = (n: string) => (Deno.env.get(n) ?? '').trim().replace(/^["']|["']$/g, '');
const RAW_ID = clean('FIREBASE_PROJECT_ID');
const PROJECTS = Array.from(new Set(['mt-kalisungan-system', 'altsys-backend-buddy',
  /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(RAW_ID) ? RAW_ID : ''].filter(Boolean)));
const JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'));

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});

async function verify(token: string) {
  for (const p of PROJECTS) {
    try {
      const { payload } = await jwtVerify(token, JWKS, { issuer: `https://securetoken.google.com/${p}`, audience: p });
      return payload;
    } catch { /* try next */ }
  }
  throw new Error('invalid');
}

/** All stored formats of a PH number: +639..., 639..., 09..., 9... */
function variants(e164: string) {
  const digits = e164.replace(/\D/g, '');
  const local = digits.startsWith('63') ? digits.slice(2) : digits.replace(/^0/, '');
  return [`+63${local}`, `63${local}`, `0${local}`, local];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const body = await req.json().catch(() => ({}));
  const idToken = typeof body.idToken === 'string' ? body.idToken : '';
  const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';
  if (!idToken || newPassword.length < 8 || newPassword.length > 128) {
    return json({ error: 'Choose a password with at least 8 characters.' }, 400);
  }

  let phone = '';
  try {
    const claims = await verify(idToken);
    phone = typeof claims.phone_number === 'string' ? claims.phone_number : '';
  } catch {
    return json({ error: 'The verification code expired. Please request a new one.' }, 401);
  }
  if (!phone) return json({ error: 'This phone number could not be verified.' }, 401);

  const admin = createClient(clean('SUPABASE_URL'), clean('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: rows, error } = await admin.from('profiles').select('user_id').in('phone', variants(phone)).limit(2);
  if (error) return json({ error: 'Could not look up the account. Please try again.' }, 500);
  if (!rows?.length) return json({ error: 'No account is registered with this phone number.' }, 404);
  if (rows.length > 1) return json({ error: 'More than one account uses this number. Please reset by email.' }, 409);

  const { error: updErr } = await admin.auth.admin.updateUserById(rows[0].user_id, { password: newPassword });
  if (updErr) return json({ error: updErr.message }, 400);
  return json({ success: true });
});
