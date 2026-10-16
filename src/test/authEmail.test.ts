import { beforeEach, describe, expect, it, vi } from 'vitest';

const { auth } = vi.hoisted(() => ({
  auth: { resend: vi.fn() },
}));

vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth } }));

import { authCallbackUrl, isEmailConfirmationRequired, resendSignupVerification, resolveAuthOrigin } from '@/lib/authEmail';

describe('Supabase auth email helpers', () => {
  beforeEach(() => vi.clearAllMocks());

  it('resends signup verification through the dedicated callback', async () => {
    auth.resend.mockResolvedValue({ error: null });

    await resendSignupVerification(' HIKER@EXAMPLE.COM ', 'https://mtkali.vercel.app');

    expect(auth.resend).toHaveBeenCalledWith({
      type: 'signup',
      email: 'hiker@example.com',
      options: { emailRedirectTo: 'https://mtkali.vercel.app/auth/callback' },
    });
  });

  it('keeps local callback origins for local verification tests', () => {
    expect(resolveAuthOrigin('http://localhost:3000')).toBe('http://localhost:3000');
    expect(authCallbackUrl('https://preview.lovable.app')).toBe('https://mtkali.vercel.app/auth/callback');
  });

  it('recognizes Supabase unverified-account errors without matching unrelated errors', () => {
    expect(isEmailConfirmationRequired({ code: 'email_not_confirmed', message: 'Email not confirmed' })).toBe(true);
    expect(isEmailConfirmationRequired(new Error('Invalid login credentials'))).toBe(false);
  });
});
