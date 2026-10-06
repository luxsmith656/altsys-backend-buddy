import { describe, expect, it } from 'vitest';
import { validateAge, validateEmail, validatePhone } from '@/lib/inputValidation';

describe('shared input validation', () => {
  it('accepts valid email addresses and rejects malformed input', () => {
    expect(validateEmail('hiker@example.com')).toBeNull();
    expect(validateEmail('hiker@gmail.com')).toBeNull();
    expect(validateEmail('not-an-email')).toContain('valid email');
    expect(validateEmail('hiker@localhost')).toContain('valid email');
  });

  it('accepts only whole ages in the allowed range', () => {
    expect(validateAge('25')).toBeNull();
    expect(validateAge('2.5')).toContain('whole number');
    expect(validateAge('twenty')).toContain('whole number');
    expect(validateAge('121')).toContain('between');
    expect(validateAge('0')).toContain('between');
  });

  it('requires a complete phone number rather than a short digit fragment', () => {
    expect(validatePhone('0917-123-4567')).toBeNull();
    expect(validatePhone('+1 (202) 555-0101')).toBeNull();
    expect(validatePhone('12345')).toContain('complete phone');
  });
});
