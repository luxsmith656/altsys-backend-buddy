import { describe, expect, it } from 'vitest';
import { getRoleHomePath, resolveAccountRole } from '@/lib/authRoles';

describe('resolveAccountRole', () => {
  it.each([
    ['super_admin', '/central'],
    ['admin', '/admin'],
    ['ranger', '/ranger'],
    ['guide', '/guide'],
    ['hiker', '/hiker'],
  ] as const)('routes %s accounts to %s', (role, expectedPath) => {
    expect(getRoleHomePath(role)).toBe(expectedPath);
  });

  it('uses the highest-authority database role when several roles exist', () => {
    expect(
      resolveAccountRole(
        [{ role: 'hiker' }, { role: 'guide' }, { role: 'admin' }],
        { email: 'person@example.com', user_metadata: { role: 'hiker' } },
      ),
    ).toBe('admin');
  });

  it.each([
    ['central@kalisungan.ph', 'super_admin'],
    ['admin@kalisungan.ph', 'admin'],
    ['lamot1@kalisungan.ph', 'admin'],
    ['lamot2@kalisungan.ph', 'admin'],
    ['guide@kalisungan.ph', 'guide'],
    ['ranger@kalisungan.ph', 'ranger'],
    ['hiker@kalisungan.ph', 'hiker'],
  ] as const)('keeps the seeded %s account mapped to %s when role rows are temporarily empty', (email, role) => {
    expect(resolveAccountRole([], { email })).toBe(role);
  });

  it('does not promote ordinary users merely because their email contains a role word', () => {
    expect(resolveAccountRole([], { email: 'hikingguidefan@example.com' })).toBe('hiker');
  });
});
