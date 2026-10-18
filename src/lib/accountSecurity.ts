import { supabase } from '@/integrations/supabase/client';
import { resolveAuthOrigin } from '@/lib/authEmail';

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

/** Reset links must open the real site, never a preview/editor host. */
export function resolveResetOrigin(origin: string) {
  return resolveAuthOrigin(origin);
}

export async function emailPasswordReset(email: string, origin: string) {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) throw new Error('Enter your account email address.');

  const functions = (supabase as typeof supabase & { functions?: { invoke: (name: string, options: { body: Record<string, string> }) => Promise<{ data?: unknown; error?: unknown }> } }).functions;
  if (functions?.invoke) {
    const { data, error } = await functions.invoke('send-password-reset-emailjs', {
      body: { email: normalizedEmail, app_url: resolveResetOrigin(origin) },
    }).catch(() => ({ data: null, error: new Error('Password reset function unavailable') }));
    if (!error && (data as { success?: unknown } | null)?.success === true) return;
  }

  const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
    redirectTo: `${resolveResetOrigin(origin)}/reset-password`,
  });
  if (error) throw error;
}
