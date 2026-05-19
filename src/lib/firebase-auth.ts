import { GoogleAuthProvider, getAuth, signInWithPopup, signOut } from 'firebase/auth';
import { getFirebaseApp, isFirebaseConfigured } from './firebase';
import { supabase } from '@/integrations/supabase/client';

export interface GoogleSignInResult {
  error: Error | null;
  /** True when the bridge created a new Supabase user during this sign-in. */
  isNewUser?: boolean;
  email?: string;
}

let googleSignInRequest: Promise<GoogleSignInResult> | null = null;

/**
 * Sign in via Firebase Google OAuth, then bridge into a Supabase session.
 * Optimised for latency: the Firebase signOut runs in the background and
 * the bridge call starts the moment we have an ID token.
 */
export async function signInWithFirebaseGoogle(): Promise<GoogleSignInResult> {
  if (googleSignInRequest) return googleSignInRequest;
  googleSignInRequest = runGoogleSignIn().finally(() => {
    googleSignInRequest = null;
  });
  return googleSignInRequest;
}

async function runGoogleSignIn(): Promise<GoogleSignInResult> {
  if (!isFirebaseConfigured()) {
    return { error: new Error('Firebase is not configured. Add VITE_FIREBASE_* values to .env.') };
  }
  const app = getFirebaseApp();
  if (!app) return { error: new Error('Firebase app failed to initialize.') };

  try {
    const auth = getAuth(app);
    const result = await signInWithPopup(auth, new GoogleAuthProvider());
    const idToken = await result.user.getIdToken();

    // Kick the bridge call IMMEDIATELY; sign out of Firebase in parallel.
    const bridgePromise = invokeFirebaseBridge(idToken);
    void signOut(auth).catch(() => undefined);

    const data = await bridgePromise;
    if (!data?.token_hash) return { error: new Error('Bridge did not return a session token.') };

    const { error: otpError } = await supabase.auth.verifyOtp({
      type: 'magiclink',
      token_hash: data.token_hash,
    });
    if (otpError) return { error: otpError as Error };

    return { error: null, isNewUser: !!data.is_new_user, email: data.email };
  } catch (err: unknown) {
    const e = err as { code?: string; message?: string };
    if (e?.code === 'auth/popup-closed-by-user') {
      return { error: new Error('Sign-in cancelled.') };
    }
    return { error: err instanceof Error ? err : new Error(String(err)) };
  }
}

interface BridgeResponse {
  token_hash?: string;
  email?: string;
  is_new_user?: boolean;
}

async function invokeFirebaseBridge(idToken: string): Promise<BridgeResponse> {
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

  const payload = (await response.json().catch(() => ({}))) as BridgeResponse & { error?: string };
  if (!response.ok) {
    throw new Error(payload?.error || `Google sign-in failed (${response.status}).`);
  }
  return payload;
}
