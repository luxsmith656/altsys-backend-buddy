import { getAuth, RecaptchaVerifier, signInWithPhoneNumber, signOut, type ConfirmationResult } from 'firebase/auth';
import { getFirebaseApp } from '@/lib/firebase';
import { supabase } from '@/integrations/supabase/client';

/** Converts 09XXXXXXXXX / 9XXXXXXXXX / +639XXXXXXXXX into +639XXXXXXXXX. */
export function toPhilippineE164(input: string): string | null {
  const digits = input.replace(/\D/g, '');
  const local = digits.startsWith('63') ? digits.slice(2) : digits.replace(/^0/, '');
  return /^9\d{9}$/.test(local) ? `+63${local}` : null;
}

let verifier: RecaptchaVerifier | null = null;

type FirebasePhoneError = {
  code?: unknown;
  message?: unknown;
};

/**
 * Converts Firebase's provider errors into messages that tell the user what
 * they can do next. In particular, Firebase reports a disabled SMS region as
 * a generic operation failure unless the raw message is inspected.
 */
export function getPhoneResetSendError(error: unknown): string {
  const firebaseError = (error && typeof error === 'object' ? error : {}) as FirebasePhoneError;
  const code = typeof firebaseError.code === 'string' ? firebaseError.code : '';
  const message = typeof firebaseError.message === 'string' ? firebaseError.message.toLowerCase() : '';

  if (
    code === 'auth/operation-not-allowed' ||
    message.includes('sms unable to be sent until this region enabled') ||
    message.includes('region enabled by the app developer')
  ) {
    return 'SMS verification is not enabled for the Philippines yet. Ask the administrator to enable PH (+63) in Firebase Console > Authentication > Sign-in method > Phone > SMS region policy, or use email reset instead.';
  }
  if (code === 'auth/invalid-app-credential' || code === 'auth/captcha-check-failed') {
    return 'The security check could not be completed. Reload the page and try again, or use email reset instead.';
  }
  if (code === 'auth/api-key-not-valid' || code === 'auth/invalid-api-key' || message.includes('api key not valid')) {
    return 'Phone verification is temporarily unavailable because the Firebase web configuration is invalid. Please use email reset or contact the administrator.';
  }
  if (code === 'auth/too-many-requests' || code === 'auth/quota-exceeded') {
    return 'Too many code requests today. Please try again later or reset by email.';
  }
  if (code === 'auth/invalid-phone-number' || code === 'auth/missing-phone-number') {
    return 'Enter a valid Philippine mobile number, e.g. 09123456789.';
  }
  return 'Could not send the code. Check the number and try again, or use email reset instead.';
}

export async function sendPhoneResetCode(phone: string, containerId: string): Promise<ConfirmationResult> {
  const e164 = toPhilippineE164(phone);
  if (!e164) throw new Error('Enter a valid mobile number, e.g. 09123456789.');
  const app = getFirebaseApp();
  if (!app) throw new Error('Phone reset is not available right now.');
  const auth = getAuth(app);
  verifier?.clear();
  verifier = new RecaptchaVerifier(auth, containerId, { size: 'invisible' });
  try {
    return await signInWithPhoneNumber(auth, e164, verifier);
  } catch (error: unknown) {
    throw new Error(getPhoneResetSendError(error));
  } finally {
    verifier?.clear();
    verifier = null;
  }
}

export async function confirmPhoneReset(confirmation: ConfirmationResult, code: string, newPassword: string) {
  if (!/^\d{6}$/.test(code.trim())) throw new Error('Enter the 6-digit code.');
  if (newPassword.length < 8) throw new Error('Choose a password with at least 8 characters.');
  let idToken: string;
  try {
    const cred = await confirmation.confirm(code.trim());
    idToken = await cred.user.getIdToken();
  } catch {
    throw new Error('That code is incorrect or expired.');
  }
  const { data, error } = await supabase.functions.invoke('phone-password-reset', { body: { idToken, newPassword } });
  const app = getFirebaseApp();
  if (app) void signOut(getAuth(app)).catch(() => {});
  if (error || data?.error) {
    let msg = data?.error as string | undefined;
    if (!msg && error && 'context' in error) msg = (await (error as any).context.json().catch(() => ({})))?.error;
    throw new Error(msg || 'Could not reset the password. Please try again.');
  }
}
