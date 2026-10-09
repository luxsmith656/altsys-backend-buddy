import { describe, expect, it } from 'vitest';
import { getPhoneResetSendError, toPhilippineE164 } from '@/lib/phonePasswordReset';

describe('phone password reset', () => {
  it('normalizes valid Philippine mobile numbers', () => {
    expect(toPhilippineE164('0917 123 4567')).toBe('+639171234567');
    expect(toPhilippineE164('+63 917 123 4567')).toBe('+639171234567');
  });

  it('rejects malformed phone numbers before contacting Firebase', () => {
    expect(toPhilippineE164('09171234')).toBeNull();
    expect(toPhilippineE164('abc')).toBeNull();
  });

  it('explains when Firebase has disabled Philippine SMS delivery', () => {
    expect(
      getPhoneResetSendError({
        code: 'auth/operation-not-allowed',
        message: 'SMS unable to be sent until this region enabled by the app developer.',
      }),
    ).toContain('enable PH (+63)');
  });

  it('does not hide captcha failures as a number error', () => {
    expect(getPhoneResetSendError({ code: 'auth/captcha-check-failed' })).toContain('security check');
  });

  it('reports a broken Firebase web configuration separately', () => {
    expect(getPhoneResetSendError({ message: 'API key not valid. Please pass a valid API key.' })).toContain(
      'Firebase web configuration is invalid',
    );
  });
});
