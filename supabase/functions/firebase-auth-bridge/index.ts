// Bridges a Firebase Google sign-in into a Supabase session.
// Client sends a Firebase ID token; we verify it against Google's JWKS,
// ensure a matching Supabase auth user exists, then return a magiclink
// token_hash the client exchanges via supabase.auth.verifyOtp().

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'npm:jose@5';

const FIREBASE_PROJECT_ID = cleanEnv('FIREBASE_PROJECT_ID');
const SUPABASE_URL = cleanEnv('SUPABASE_URL');
const SERVICE_ROLE = cleanEnv('SUPABASE_SERVICE_ROLE_KEY');
const ALLOWED_FIREBASE_PROJECT_IDS = Array.from(
  new Set([FIREBASE_PROJECT_ID, 'mt-kalisungan-system', 'altsys-backend-buddy'].filter(Boolean)),
);

const JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'),
);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    if (!SUPABASE_URL || !SERVICE_ROLE || ALLOWED_FIREBASE_PROJECT_IDS.length === 0) {
      return json({ error: 'Google sign-in is not configured correctly' }, 500);
    }

    const { idToken } = await req.json().catch(() => ({}));
    if (!idToken || typeof idToken !== 'string') return json({ error: 'Missing idToken' }, 400);

    const payload = await verifyFirebaseToken(idToken);

    const email = (payload.email as string | undefined)?.toLowerCase();
    const emailVerified = payload.email_verified === true;
    const fullName = (payload.name as string | undefined) ?? '';
    const signInProvider = (payload.firebase as { sign_in_provider?: string } | undefined)?.sign_in_provider;

    if (!email) return json({ error: 'Firebase token has no email' }, 400);
    if (!emailVerified) return json({ error: 'Email not verified with Google' }, 400);
    if (signInProvider !== 'google.com') return json({ error: 'Firebase token is not a Google sign-in' }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Fire createUser and generateLink in parallel. generateLink works for
    // existing OR newly-created users (it ensures + signs in by email).
    const createUserPromise = admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { full_name: fullName, firebase_uid: payload.sub, provider: 'firebase-google' },
    });
    const linkPromise = admin.auth.admin.generateLink({ type: 'magiclink', email });

    const [createRes, { data: linkData, error: linkError }] = await Promise.all([
      createUserPromise,
      linkPromise,
    ]);

    if (linkError || !linkData?.properties?.hashed_token) {
      return json({ error: linkError?.message ?? 'Failed to generate session' }, 500);
    }

    const alreadyExists = createRes.error && /already.*registered|exists/i.test(createRes.error.message);
    if (createRes.error && !alreadyExists) {
      return json({ error: createRes.error.message }, 500);
    }
    const isNewUser = !alreadyExists && !!createRes.data?.user?.id;
    const userId =
      createRes.data?.user?.id ??
      (linkData as { user?: { id?: string } })?.user?.id ??
      null;

    // Background first-time setup so the client can continue immediately.
    // Onboarding upserts the profile row, so a tiny race here is fine.
    if (userId) {
      const bg = Promise.all([
        admin.from('profiles').upsert(
          { user_id: userId, full_name: fullName },
          { onConflict: 'user_id', ignoreDuplicates: true },
        ),
        admin.from('user_roles').upsert(
          { user_id: userId, role: 'hiker' },
          { onConflict: 'user_id,role', ignoreDuplicates: true },
        ),
      ]).catch((e) => console.error('[firebase-auth-bridge] setup error', e));
      // @ts-expect-error Deno EdgeRuntime keeps the task alive after response.
      globalThis.EdgeRuntime?.waitUntil?.(bg);
    }

    return json({
      email,
      token_hash: linkData.properties.hashed_token,
      is_new_user: isNewUser,
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

async function verifyFirebaseToken(idToken: string): Promise<JWTPayload> {
  const unverifiedClaims = readUnverifiedClaims(idToken);
  const issuer = typeof unverifiedClaims.iss === 'string' ? unverifiedClaims.iss : '';
  const issuerProjectId = issuer.startsWith('https://securetoken.google.com/')
    ? issuer.slice('https://securetoken.google.com/'.length)
    : '';
  const tokenAudience = typeof unverifiedClaims.aud === 'string' ? unverifiedClaims.aud : '';
  const matchesConfiguredProject = ALLOWED_FIREBASE_PROJECT_IDS.includes(issuerProjectId) &&
    tokenAudience === issuerProjectId;

  // Select by the token's public issuer claims first, but never trust them until
  // jwtVerify validates the signature, issuer and audience below.
  const candidateProjects = matchesConfiguredProject
    ? [issuerProjectId]
    : ALLOWED_FIREBASE_PROJECT_IDS;
  let lastError: unknown;
  for (const projectId of candidateProjects) {
    try {
      const { payload } = await jwtVerify(idToken, JWKS, {
        issuer: `https://securetoken.google.com/${projectId}`,
        audience: projectId,
      });
      return payload;
    } catch (err) {
      lastError = err;
    }
  }
  console.error('[firebase-auth-bridge] jwtVerify failed', {
    tokenIssuerProjectId: issuerProjectId || 'unrecognized',
    tokenAudience: tokenAudience || 'missing',
    allowedProjectIds: ALLOWED_FIREBASE_PROJECT_IDS,
  });
  if (issuerProjectId && !matchesConfiguredProject) {
    throw new Error(`Google sign-in project mismatch: token issuer/audience is ${issuerProjectId}, but the token claims do not match an allowed Firebase project.`);
  }
  throw lastError instanceof Error ? lastError : new Error('Invalid Firebase token');
}

function readUnverifiedClaims(token: string): Record<string, unknown> {
  try {
    const segment = token.split('.')[1];
    if (!segment) return {};
    const normalized = segment.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='));
    const claims: unknown = JSON.parse(decoded);
    return claims && typeof claims === 'object' && !Array.isArray(claims)
      ? claims as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function cleanEnv(name: string): string {
  return (Deno.env.get(name) ?? '').trim().replace(/^["']|["']$/g, '');
}
