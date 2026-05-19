import { GoogleAuthProvider, getAuth, signInWithPopup, signOut } from 'firebase/auth';
import { getFirebaseApp, isFirebaseConfigured } from './firebase';
import { supabase } from '@/integrations/supabase/client';

/**
 * Sign in via Firebase Google OAuth, then bridge into a Supabase session
 * so existing RLS/roles/tables continue to work unchanged.
 */
export async function signInWithFirebaseGoogle(): Promise<{ error: Error | null }> {
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

    const { data, error } = await supabase.functions.invoke('firebase-auth-bridge', {
      body: { idToken },
    });
    if (error) return { error: new Error(error.message) };
    if (!data?.token_hash) return { error: new Error('Bridge did not return a session token.') };

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
