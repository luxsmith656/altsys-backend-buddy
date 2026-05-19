// Bridges a Firebase Google sign-in into a Supabase session.
// Client sends a Firebase ID token; we verify it against Google's JWKS,
// ensure a matching Supabase auth user exists, then return a magiclink
// token_hash the client exchanges via supabase.auth.verifyOtp().

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createRemoteJWKSet, jwtVerify } from 'npm:jose@5';

const FIREBASE_PROJECT_ID = (Deno.env.get('FIREBASE_PROJECT_ID') ?? '').trim().replace(/^["']|["']$/g, '');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Firebase ID tokens are signed with these public keys.
const JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'),
);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    if (!FIREBASE_PROJECT_ID) {
      return json({ error: 'FIREBASE_PROJECT_ID not configured' }, 500);
    }

    const { idToken } = await req.json().catch(() => ({}));
    if (!idToken || typeof idToken !== 'string') {
      return json({ error: 'Missing idToken' }, 400);
    }

    // Verify Firebase ID token: signature, issuer, audience.
    const { payload } = await jwtVerify(idToken, JWKS, {
      issuer: `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`,
      audience: FIREBASE_PROJECT_ID,
    }).catch((err) => {
      console.error('[firebase-auth-bridge] jwtVerify failed', {
        expectedIss: `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`,
        expectedAud: FIREBASE_PROJECT_ID,
        projectIdLen: FIREBASE_PROJECT_ID.length,
      });
      throw err;
    });

    const email = (payload.email as string | undefined)?.toLowerCase();
    const emailVerified = payload.email_verified === true;
    const fullName = (payload.name as string | undefined) ?? '';

    if (!email) return json({ error: 'Firebase token has no email' }, 400);
    if (!emailVerified) return json({ error: 'Email not verified with Google' }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Ensure a Supabase auth user exists for this email.
    const createRes = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { full_name: fullName, firebase_uid: payload.sub, provider: 'firebase-google' },
    });
    const alreadyExists = createRes.error && /already.*registered|exists/i.test(createRes.error.message);
    if (createRes.error && !alreadyExists) {
      return json({ error: createRes.error.message }, 500);
    }

    // Resolve the auth user id (newly created or pre-existing).
    let userId = createRes.data?.user?.id ?? null;
    if (!userId) {
      // listUsers is paginated; first page is enough for a fresh Google account,
      // but loop a few pages just in case.
      for (let page = 1; page <= 10 && !userId; page++) {
        const { data } = await admin.auth.admin.listUsers({ page, perPage: 200 });
        userId = data?.users.find((u) => u.email?.toLowerCase() === email)?.id ?? null;
        if (!data || data.users.length < 200) break;
      }
    }

    // First-time setup: ensure profile + default 'hiker' role exist.
    if (userId) {
      await admin.from('profiles').upsert(
        { user_id: userId, full_name: fullName },
        { onConflict: 'user_id', ignoreDuplicates: true },
      );
      await admin.from('user_roles').upsert(
        { user_id: userId, role: 'hiker' },
        { onConflict: 'user_id,role', ignoreDuplicates: true },
      );
    }

    // Mint a magiclink; the client exchanges its token_hash for a session.
    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email,
    });
    if (linkError || !linkData?.properties?.hashed_token) {
      return json({ error: linkError?.message ?? 'Failed to generate session' }, 500);
    }

    return json({
      email,
      token_hash: linkData.properties.hashed_token,
    });
  } catch (err) {
    console.error('[firebase-auth-bridge] error', err);
    return json({ error: (err as Error).message ?? 'Unknown error' }, 401);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
