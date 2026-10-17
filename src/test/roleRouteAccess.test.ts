import { describe, expect, it } from 'vitest';
import { APP_ROUTES } from '@/app/routes';

function rolesFor(path: string) {
  const route = APP_ROUTES.find((entry) => entry.path === path);
  if (!route) throw new Error(`Route not found: ${path}`);
  return route.allowedRoles;
}

describe('role-specific dashboard access', () => {
  it.each([
    ['/admin', ['admin']],
    ['/central', ['super_admin']],
    ['/hiker', ['hiker']],
    ['/guide', ['guide']],
  ] as const)('restricts %s to its own account role', (path, allowedRoles) => {
    expect(rolesFor(path)).toEqual(allowedRoles);
  });

  it('does not expose the central dashboard to local admins or hikers', () => {
    expect(rolesFor('/central')).not.toEqual(expect.arrayContaining(['admin', 'hiker', 'guide']));
  });

  it('does not expose the local admin dashboard to central admins, hikers, or guides', () => {
    expect(rolesFor('/admin')).not.toEqual(expect.arrayContaining(['super_admin', 'hiker', 'guide']));
  });
});
