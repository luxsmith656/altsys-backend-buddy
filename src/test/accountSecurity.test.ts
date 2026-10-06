import { beforeEach, describe, expect, it, vi } from 'vitest';

const { auth } = vi.hoisted(() => ({
  auth: {
    signInWithPassword: vi.fn(),
    updateUser: vi.fn(),
    resetPasswordForEmail: vi.fn(),
  },
}));

vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth } }));

import { changeAccountPassword, emailPasswordReset } from '@/lib/accountSecurity';

describe('account password security flows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.signInWithPassword.mockResolvedValue({ error: null });
    auth.updateUser.mockResolvedValue({ error: null });
    auth.resetPasswordForEmail.mockResolvedValue({ error: null });
  });

  it('verifies the current password before updating it', async () => {
    await changeAccountPassword(' HIKER@EXAMPLE.COM ', 'old-pass', 'new-password');

    expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: 'hiker@example.com', password: 'old-pass' });
    expect(auth.updateUser).toHaveBeenCalledWith({ password: 'new-password' });
  });

  it('does not update when the current password is wrong', async () => {
    auth.signInWithPassword.mockResolvedValue({ error: new Error('invalid credentials') });

    await expect(changeAccountPassword('hiker@example.com', 'wrong', 'new-password')).rejects.toThrow('Current password is incorrect.');
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it('sends recovery mail to the normalized email with the app recovery route', async () => {
    await emailPasswordReset(' HIKER@EXAMPLE.COM ', 'https://mtkali.vercel.app');

    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith('hiker@example.com', {
      redirectTo: 'https://mtkali.vercel.app/reset-password',
    });
  });
});
