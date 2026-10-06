import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ImportantAnnouncements from '@/components/common/ImportantAnnouncements';

const state = vi.hoisted(() => ({
  fetch: vi.fn(),
  dismiss: vi.fn(),
  onChange: vi.fn(() => ({ on: state.onChange, subscribe: state.subscribe })),
  subscribe: vi.fn(),
  removeChannel: vi.fn(),
}));

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'staff-1' }, role: 'admin' }) }));
vi.mock('@/lib/announcements', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/announcements')>();
  return { ...actual, fetchAnnouncementsFromDb: state.fetch };
});
vi.mock('@/lib/notifications', () => ({ loadRemovedNotificationIds: () => [], markNotificationRemoved: state.dismiss }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  channel: () => ({ on: state.onChange, subscribe: state.subscribe }),
  removeChannel: state.removeChannel,
} }));

beforeEach(() => {
  vi.clearAllMocks();
  state.fetch.mockResolvedValue([
    { id: 'old-note', title: 'Older update', body: 'Earlier notice.', type: 'warning', target: 'admins', isImportant: true, created_at: '2026-10-03T00:00:00Z' },
    { id: 'next-note', title: 'Next newest update', body: 'Next notice.', type: 'warning', target: 'admins', isImportant: true, created_at: '2026-10-05T00:00:00Z' },
    { id: 'new-note', title: 'Newest update', body: 'Latest notice.', type: 'warning', target: 'admins', isImportant: true, created_at: '2026-10-06T00:00:00Z' },
    { id: 'middle-note', title: 'Middle update', body: 'Middle notice.', type: 'warning', target: 'admins', isImportant: true, created_at: '2026-10-04T00:00:00Z' },
    { id: 'guide-note', title: 'Guide update', body: 'Guide-only.', type: 'info', target: 'guides', isImportant: true, created_at: '2026-10-07T00:00:00Z' },
  ]);
});

describe('important announcement dashboard feed', () => {
  it('shows only the two newest role-targeted notices and fills the next newest after dismissal', async () => {
    render(<ImportantAnnouncements />);
    expect(await screen.findByText('Newest update')).toBeVisible();
    expect(screen.getByText('Next newest update')).toBeVisible();
    expect(screen.queryByText('Older update')).not.toBeInTheDocument();
    expect(screen.queryByText('Middle update')).not.toBeInTheDocument();
    expect(screen.queryByText('Guide update')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss announcement: Newest update' }));
    expect(state.dismiss).toHaveBeenCalledWith('staff-1', 'ann:new-note');
    expect(screen.queryByText('Newest update')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Middle update')).toBeVisible());
  });
});
