import { beforeEach, describe, expect, it } from 'vitest';
import { loadAnnouncements, saveAnnouncements, visibleAnnouncements, type AdminAnnouncement } from '@/lib/announcements';

const announcement = (id: string, target: AdminAnnouncement['target'], overrides: Partial<AdminAnnouncement> = {}): AdminAnnouncement => ({
  id,
  title: id,
  body: 'Notice',
  type: 'info',
  target,
  isImportant: true,
  created_at: `2026-10-0${id === 'new' ? '6' : '5'}T00:00:00Z`,
  ...overrides,
});

beforeEach(() => localStorage.clear());

describe('announcement audience and dismissal rules', () => {
  it('shows all and admin notices to central and local admins, but keeps guide-only notices private', () => {
    const items = [
      announcement('all', 'all', { created_at: '2026-10-05T00:00:00Z' }),
      announcement('admin', 'admins', { created_at: '2026-10-06T00:00:00Z' }),
      announcement('guide', 'guides', { created_at: '2026-10-04T00:00:00Z' }),
    ];
    expect(visibleAnnouncements(items, 'super_admin').map((item) => item.id)).toEqual(['admin', 'all']);
    expect(visibleAnnouncements(items, 'admin').map((item) => item.id)).toEqual(['admin', 'all']);
    expect(visibleAnnouncements(items, 'guide').map((item) => item.id)).toEqual(['all', 'guide']);
  });

  it('filters notices outside their active dates and sorts newest first', () => {
    const items = [
      announcement('old', 'all'),
      announcement('new', 'all'),
      announcement('future', 'all', { starts_at: '2999-01-01T00:00:00Z' }),
      announcement('expired', 'all', { expires_at: '2000-01-01T00:00:00Z' }),
    ];
    expect(visibleAnnouncements(items, 'hiker').map((item) => item.id)).toEqual(['new', 'old']);
  });

  it('keeps the local announcement cache aligned with the role-filtered active feed', () => {
    saveAnnouncements([announcement('guide', 'guides'), announcement('all', 'all')]);
    expect(loadAnnouncements('admin').map((item) => item.id)).toEqual(['all']);
  });
});
