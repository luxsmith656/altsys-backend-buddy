import { beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.fn();
const send = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke } },
}));

vi.mock('@emailjs/browser', () => ({
  default: { send },
}));

describe('email OTP delivery', () => {
  beforeEach(() => {
    invoke.mockReset();
    send.mockReset();
  });

  it('uses the Resend-backed edge function before browser email providers', async () => {
    invoke.mockResolvedValue({ data: { success: true, challengeId: 'challenge-1' }, error: null });
    const { sendOtpEmail } = await import('@/lib/notification-service');

    await expect(sendOtpEmail('hiker@example.com', 'Hiker', '123456')).resolves.toEqual({ success: true, challengeId: 'challenge-1' });
    expect(invoke).toHaveBeenCalledWith('send-email-otp', {
      body: { email: 'hiker@example.com', name: 'Hiker' },
    });
    expect(send).not.toHaveBeenCalled();
  });

  it('verifies the email code through the server-side challenge', async () => {
    invoke.mockResolvedValue({ data: { success: true }, error: null });
    const { verifyOtpEmail } = await import('@/lib/notification-service');

    await expect(verifyOtpEmail('hiker@example.com', 'challenge-1', '123456')).resolves.toEqual({ success: true });
    expect(invoke).toHaveBeenCalledWith('verify-email-otp', {
      body: { email: 'hiker@example.com', challengeId: 'challenge-1', otp: '123456' },
    });
  });

  it('falls back to EmailJS only when the server delivery is unavailable', async () => {
    invoke.mockResolvedValue({ data: null, error: new Error('function unavailable') });
    send.mockResolvedValue({ status: 200 });
    const { sendOtpEmail } = await import('@/lib/notification-service');

    await expect(sendOtpEmail('hiker@example.com', 'Hiker', '123456')).resolves.toEqual({ success: true });
    expect(send).toHaveBeenCalled();
  });
});
