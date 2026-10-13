import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  channel: vi.fn(),
  removeChannel: vi.fn(),
  callbacks: [] as Array<(payload: any) => void>,
  channelNames: [] as string[],
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: state.rpc,
    from: state.from,
    channel: state.channel,
    removeChannel: state.removeChannel,
  },
}));

import { createAppNotification, subscribeAppNotifications } from '@/lib/appNotifications';

describe('Supabase app notifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.callbacks = [];
    state.channelNames = [];
    state.rpc.mockResolvedValue({ data: 'notification-1', error: null });
    state.from.mockReturnValue({
      select: () => ({
        eq: () => ({
          order: () => ({ limit: async () => ({ data: [], error: null }) }),
        }),
      }),
    });
    state.channel.mockImplementation((name: string) => {
      state.channelNames.push(name);
      const channel = {
        on: vi.fn((_event: string, _config: unknown, callback: (payload: any) => void) => {
          state.callbacks.push(callback);
          return channel;
        }),
        subscribe: vi.fn(),
      };
      return channel;
    });
  });

  it('passes booking scope to the authorized notification RPC', async () => {
    await expect(createAppNotification('hiker-1', {
      title: 'Booking submitted',
      body: 'Awaiting approval',
      category: 'booking',
      link: '/hiker',
      bookingId: 'booking-1',
    })).resolves.toBe('notification-1');
    expect(state.rpc).toHaveBeenCalledWith('create_app_notification', {
      p_user_id: 'hiker-1',
      p_title: 'Booking submitted',
      p_body: 'Awaiting approval',
      p_category: 'booking',
      p_link: '/hiker',
      p_booking_id: 'booking-1',
    });
  });

  it('hydrates once and applies realtime inserts without duplicates', async () => {
    const updates: unknown[][] = [];
    const stop = subscribeAppNotifications('hiker-1', (items) => updates.push(items));
    await vi.waitFor(() => expect(updates).toHaveLength(1));
    const row = {
      id: 'notification-1', user_id: 'hiker-1', title: 'Guide assigned', body: 'Review the booking',
      category: 'booking', link: '/hiker', read: false, created_at: '2026-10-13T06:00:00Z',
    };
    state.callbacks[0]({ eventType: 'INSERT', new: row });
    state.callbacks[0]({ eventType: 'INSERT', new: row });
    expect(updates.at(-1)).toHaveLength(1);
    expect(updates.at(-1)?.[0]).toMatchObject({ id: 'notification-1', title: 'Guide assigned' });
    stop();
    expect(state.removeChannel).toHaveBeenCalled();
  });

  it('uses separate channel instances for concurrent notification listeners', () => {
    const stopFirst = subscribeAppNotifications('hiker-1', vi.fn());
    const stopSecond = subscribeAppNotifications('hiker-1', vi.fn());

    expect(state.channelNames).toHaveLength(2);
    expect(state.channelNames[0]).not.toBe(state.channelNames[1]);

    stopFirst();
    stopSecond();
  });
});
