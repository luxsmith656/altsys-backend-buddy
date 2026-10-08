import { describe, expect, it } from 'vitest';
import { getOfflineRoleHelp } from '@/lib/offline-role-help';

describe('offline Kali role help', () => {
  it.each([
    ['hiker', 'Trail FAQ', '/booking'],
    ['guide', 'Guide Operations Help', '/guide'],
    ['admin', 'Basecamp Quick Directory', '/admin?tab=scan'],
    ['super_admin', 'Admin Quick Actions', '/central?tab=analytics'],
  ])('returns actionable help for %s', (role, title, href) => {
    const help = getOfflineRoleHelp(role);

    expect(help.title).toBe(title);
    expect(help.body.length).toBeGreaterThan(40);
    expect(help.links.some((link) => link.href === href)).toBe(true);
  });

  it('falls back to visitor guidance for unknown roles', () => {
    const help = getOfflineRoleHelp('unknown-role');

    expect(help.title).toBe('Trail FAQ');
    expect(help.body).toMatch(/offline maps/i);
  });
});
