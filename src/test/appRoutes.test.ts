import { describe, expect, it } from 'vitest';
import { APP_ROUTES, findAppRoute } from '@/app/routes';

describe('authoritative application routes', () => {
  it('contains every mounted application route exactly once', () => {
    const paths = APP_ROUTES.map((route) => route.path);

    expect(new Set(paths).size).toBe(paths.length);
    expect(paths).toEqual([
      '/',
      '/login',
      '/register',
      '/map',
      '/chat',
      '/booking',
      '/join-hike',
      '/join',
      '/ops-ai',
      '/admin',
      '/central',
      '/ranger',
      '/hiker',
      '/guide',
      '/guide/:guideId',
      '/profile',
      '/dashboard',
      '/notifications',
      '/onboarding',
      '/monitoring',
    ]);
  });

  it('keeps monitoring direct-link-only and admin protected', () => {
    const route = findAppRoute('/monitoring');

    expect(route?.showInNavigation).toBe(false);
    expect(route?.allowedRoles).toEqual(['admin', 'super_admin']);
    expect(route?.pageKey).toBe('monitoring');
  });
});
