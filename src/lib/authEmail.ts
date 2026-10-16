import { supabase } from '@/integrations/supabase/client';

const PUBLIC_SITE_URL = 'https://mtkali.vercel.app';

/**
 * Auth links must return to the real app in production, while local and
 * Capacitor development builds keep their own origin for end-to-end testing.
 */
export function resolveAuthOrigin(origin: string) {
  try {
    const url = new URL(origin);
    const host = url.hostname;
    if (host === 'localhost' || host === '127.0.0.1' || url.protocol === 'capacitor:') return origin;
    if (/lovable\.(app|dev)$|lovableproject\.com$/.test(host)) return PUBLIC_SITE_URL;
    return origin;
  } catch {
    return PUBLIC_SITE_URL;
  }
}

export function authCallbackUrl(origin = window.location.origin) {
  return `${resolveAuthOrigin(origin)}/auth/callback`;
}

export function isEmailConfirmationRequired(error: unknown) {
  const candidate = error as { code?: string; message?: string } | null;
  const value = `${candidate?.code ?? ''} ${candidate?.message ?? ''}`.toLowerCase();
  return value.includes('email_not_confirmed') || value.includes('email not confirmed') || value.includes('email is not confirmed');
}

export async function resendSignupVerification(email: string, origin = window.location.origin) {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) throw new Error('Enter your email address first.');

  const { error } = await supabase.auth.resend({
    type: 'signup',
    email: normalizedEmail,
    options: { emailRedirectTo: authCallbackUrl(origin) },
  });
  if (error) throw error;
}
