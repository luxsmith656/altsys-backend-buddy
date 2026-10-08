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
  } catch (e: any) {
    verifier?.clear(); verifier = null;
    if (e?.code === 'auth/too-many-requests' || e?.code === 'auth/quota-exceeded') {
      throw new Error('Too many code requests today. Please try again later or reset by email.');
    }
    if (e?.code === 'auth/operation-not-allowed') throw new Error('Phone reset is not turned on yet. Please reset by email.');
    throw new Error('Could not send the code. Check the number and try again.');
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
