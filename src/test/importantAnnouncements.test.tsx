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
    { id: 'admin-note', title: 'Trail update', body: 'Use caution.', type: 'warning', target: 'admins', isImportant: true, created_at: '2026-10-06T00:00:00Z' },
    { id: 'guide-note', title: 'Guide update', body: 'Guide-only.', type: 'info', target: 'guides', isImportant: true, created_at: '2026-10-06T00:00:00Z' },
  ]);
});

describe('important announcement dashboard feed', () => {
  it('loads the role-targeted database notice and lets the user dismiss it', async () => {
    render(<ImportantAnnouncements />);
    expect(await screen.findByText('Trail update')).toBeVisible();
    expect(screen.queryByText('Guide update')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss announcement: Trail update' }));
    expect(state.dismiss).toHaveBeenCalledWith('staff-1', 'ann:admin-note');
    await waitFor(() => expect(screen.queryByText('Trail update')).not.toBeInTheDocument());
  });
});
