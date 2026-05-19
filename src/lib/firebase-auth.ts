import { GoogleAuthProvider, getAuth, signInWithPopup, signOut } from 'firebase/auth';
import { getFirebaseApp, isFirebaseConfigured } from './firebase';
import { supabase } from '@/integrations/supabase/client';

let googleSignInRequest: Promise<{ error: Error | null }> | null = null;

/**
 * Sign in via Firebase Google OAuth, then bridge into a Supabase session
 * so existing RLS/roles/tables continue to work unchanged.
 */
export async function signInWithFirebaseGoogle(): Promise<{ error: Error | null }> {
  if (googleSignInRequest) return googleSignInRequest;

  googleSignInRequest = runGoogleSignIn().finally(() => {
    googleSignInRequest = null;
  });

  return googleSignInRequest;
}

async function runGoogleSignIn(): Promise<{ error: Error | null }> {
  if (!isFirebaseConfigured()) {
    return { error: new Error('Firebase is not configured. Add VITE_FIREBASE_* values to .env.') };
  }
  const app = getFirebaseApp();
  if (!app) return { error: new Error('Firebase app failed to initialize.') };

  try {
    const auth = getAuth(app);
    const result = await signInWithPopup(auth, new GoogleAuthProvider());
    const idToken = await result.user.getIdToken();

    // Sign out of Firebase immediately — we only needed it to prove identity.
    // Supabase now owns the active session.
    await signOut(auth).catch(() => undefined);

    const data = await invokeFirebaseBridge(idToken);
    if (!data?.token_hash) return { error: new Error('Bridge did not return a session token.') };

    await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);

    const { error: otpError } = await supabase.auth.verifyOtp({
      type: 'magiclink',
      token_hash: data.token_hash,
    });
    if (otpError) return { error: otpError as Error };

    return { error: null };
  } catch (err: any) {
    if (err?.code === 'auth/popup-closed-by-user') {
      return { error: new Error('Sign-in cancelled.') };
    }
    return { error: err instanceof Error ? err : new Error(String(err)) };
  }
}

async function invokeFirebaseBridge(idToken: string): Promise<{ token_hash?: string }> {
  const functionsUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/firebase-auth-bridge`;
  const response = await fetch(functionsUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
    },
    body: JSON.stringify({ idToken }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || `Google sign-in failed (${response.status}).`);
  }

  return payload;
}
