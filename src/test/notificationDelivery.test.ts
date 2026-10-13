import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
}));

vi.mock('@/lib/appNotifications', () => ({
  createAppNotification: mocks.create,
  subscribeAppNotifications: vi.fn(() => vi.fn()),
  markAppNotificationRead: vi.fn(),
  deleteAppNotification: vi.fn(),
}));

import { notifyUser } from '@/lib/firestoreNotifications';

describe('durable notification delivery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.create.mockResolvedValue('notification-1');
  });

  it('writes through the Supabase notification adapter with booking scope', async () => {
    await expect(notifyUser('hiker-1', {
      title: 'Booking submitted',
      body: 'Pending approval',
      category: 'booking',
      bookingId: 'booking-1',
    })).resolves.toBe('notification-1');
    expect(mocks.create).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      bookingId: 'booking-1',
    }));
  });

  it('keeps the saved booking flow non-blocking when notification delivery fails', async () => {
    mocks.create.mockResolvedValueOnce(null);
    await expect(notifyUser('hiker-1', {
      title: 'Booking submitted',
      body: 'Pending approval',
      category: 'booking',
      bookingId: 'booking-1',
    })).resolves.toBeNull();
  });
});
