import { describe, expect, it } from 'vitest';
import { validatePasswordConfirmation } from '@/lib/authValidation';

describe('password confirmation validation', () => {
  it('accepts matching non-empty passwords', () => {
    expect(validatePasswordConfirmation('secret123', 'secret123')).toBeNull();
  });

  it('rejects a missing confirmation', () => {
    expect(validatePasswordConfirmation('secret123', '')).toBe('Please confirm your password');
  });

  it('rejects a changed confirmation', () => {
    expect(validatePasswordConfirmation('secret123', 'secret124')).toBe('Passwords do not match');
  });
});
