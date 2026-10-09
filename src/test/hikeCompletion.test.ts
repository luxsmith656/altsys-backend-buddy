import { afterEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ rpc: vi.fn(), notifyUser: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: state.rpc, rest: {} } }));
vi.mock('@/lib/firestoreNotifications', () => ({ notifyUser: state.notifyUser }));

import { completeHike } from '@/lib/hikeCompletion';

afterEach(() => vi.clearAllMocks());

describe('atomic hike completion', () => {
  it('notifies the hiker once after a new completion', async () => {
    state.rpc.mockResolvedValue({ data: { status: 'completed', already_completed: false }, error: null });
    state.notifyUser.mockResolvedValue('notification-1');
    const result = await completeHike({
      bookingId: 'booking-1',
      notes: '{}',
      hikerUserId: 'hiker-1',
      guideName: 'Guide One',
      completedBy: 'guide-user-1',
    });
    expect(result).toEqual({ success: true, alreadyCompleted: false });
    expect(state.rpc).toHaveBeenCalledWith('complete_hike_session', { p_booking_id: 'booking-1', p_notes: '{}' });
    expect(state.notifyUser).toHaveBeenCalledWith('hiker-1', expect.objectContaining({ title: 'Hike completed' }));
  });

  it('does not duplicate the notification when a retry finds a completed hike', async () => {
    state.rpc.mockResolvedValue({ data: { status: 'completed', already_completed: true }, error: null });
    const result = await completeHike({ bookingId: 'booking-1', notes: '{}' });
    expect(result).toEqual({ success: true, alreadyCompleted: true });
    expect(state.notifyUser).not.toHaveBeenCalled();
  });

  it('returns the database error without claiming completion', async () => {
    state.rpc.mockResolvedValue({ data: null, error: { message: 'not authorized' } });
    await expect(completeHike({ bookingId: 'booking-1', notes: '{}' })).resolves.toEqual({ success: false, error: 'not authorized' });
    expect(state.notifyUser).not.toHaveBeenCalled();
  });

  it('keeps the Supabase RPC client context while completing a hike', async () => {
    state.rpc.mockImplementation(function (this: { rest?: object }) {
      if (!this?.rest) throw new Error('RPC client context was lost');
      return Promise.resolve({ data: { status: 'completed', already_completed: false }, error: null });
    });
    await expect(completeHike({ bookingId: 'booking-1', notes: '{}' })).resolves.toEqual({
      success: true,
      alreadyCompleted: false,
    });
  });
});
