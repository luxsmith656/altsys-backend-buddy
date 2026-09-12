import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FsNotification } from '@/lib/firestoreNotifications';
import Navbar from '@/components/layout/Navbar';
import NotificationsPage from '@/pages/NotificationsPage';

const state = vi.hoisted(() => ({
  user: { id: 'hiker-a', email: 'hiker@example.test', user_metadata: {} },
  subscribe: vi.fn(),
  unsubscribe: vi.fn(),
  markRead: vi.fn(),
  remove: vi.fn(),
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: state.user, role: 'hiker', signOut: vi.fn() }) }));
vi.mock('@/hooks/useTheme', () => ({ useTheme: () => ({ theme: 'light', toggleTheme: vi.fn() }) }));
vi.mock('@/lib/firebase', () => ({ isFirebaseConfigured: () => true }));
vi.mock('@/lib/firestoreNotifications', () => ({
  subscribeUserNotifications: state.subscribe,
  markFsNotificationRead: state.markRead,
  deleteFsNotification: state.remove,
}));

const notice: FsNotification = {
  id: 'booking-confirmed', userId: 'hiker-a', title: 'Your booking is confirmed',
  body: 'Meet your guide at Lamot 2.', category: 'booking', read: false,
  createdAt: '2026-09-07T03:00:00Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  state.subscribe.mockReturnValue(state.unsubscribe);
});

describe('notification listener lifecycle', () => {
  it.each([['navigation', Navbar], ['notification page', NotificationsPage]] as const)(
    '%s keeps one listener when snapshots and refreshed user objects arrive', (_name, Component) => {
      const view = render(<MemoryRouter><Component /></MemoryRouter>);
      expect(state.subscribe).toHaveBeenCalledTimes(1);
      const onSnapshot = state.subscribe.mock.calls[0][1] as (items: FsNotification[]) => void;
      act(() => onSnapshot([notice]));
      state.user = { ...state.user };
      view.rerender(<MemoryRouter><Component /></MemoryRouter>);
      act(() => onSnapshot([{ ...notice, read: true }]));
      expect(state.subscribe).toHaveBeenCalledTimes(1);
      expect(state.unsubscribe).not.toHaveBeenCalled();
      view.unmount();
      expect(state.unsubscribe).toHaveBeenCalledTimes(1);
    },
  );

  it('marks and removes the actual Firestore notification, not only local placeholders', () => {
    render(<MemoryRouter><NotificationsPage /></MemoryRouter>);
    const onSnapshot = state.subscribe.mock.calls[0][1] as (items: FsNotification[]) => void;
    act(() => onSnapshot([notice]));
    expect(screen.getByText(notice.title)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Mark as seen' }));
    expect(state.markRead).toHaveBeenCalledWith(notice.id);
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(state.remove).toHaveBeenCalledWith(notice.id);
    expect(screen.queryByText(notice.title)).not.toBeInTheDocument();
  });

  it('preserves read and dismissed history saved by the previous notification UI', () => {
    localStorage.setItem('mtk_seen_notifications_hiker-a', JSON.stringify([notice.id]));
    localStorage.setItem('mtk_removed_notifications_hiker-a', JSON.stringify(['dismissed']));
    render(<MemoryRouter><NotificationsPage /></MemoryRouter>);
    const onSnapshot = state.subscribe.mock.calls[0][1] as (items: FsNotification[]) => void;
    act(() => onSnapshot([notice, { ...notice, id: 'dismissed', title: 'Already dismissed' }]));
    expect(screen.queryByText('Already dismissed')).not.toBeInTheDocument();
    expect(screen.getByText('Notifications (0 unread)')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Mark as seen' })).not.toBeInTheDocument();
  });
});
