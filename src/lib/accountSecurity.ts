import { supabase } from '@/integrations/supabase/client';

export async function changeAccountPassword(email: string, currentPassword: string, newPassword: string) {
  if (!email.trim() || !currentPassword) throw new Error('Enter your current password.');
  if (newPassword.length < 8) throw new Error('Choose a password with at least 8 characters.');

  const { error: verificationError } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password: currentPassword,
  });
  if (verificationError) throw new Error('Current password is incorrect.');

  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

const PUBLIC_SITE_URL = 'https://mtkali.vercel.app';

/** Reset links must open the real site, never a preview/editor host. */
export function resolveResetOrigin(origin: string) {
  try {
    const host = new URL(origin).hostname;
    if (host === 'localhost' || host === '127.0.0.1') return origin;
    if (/lovable\.(app|dev)$|lovableproject\.com$/.test(host)) return PUBLIC_SITE_URL;
    return origin;
  } catch {
    return PUBLIC_SITE_URL;
  }
}

export async function emailPasswordReset(email: string, origin: string) {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) throw new Error('Enter your account email address.');

  const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
    redirectTo: `${resolveResetOrigin(origin)}/reset-password`,
  });
  if (error) throw error;
}
