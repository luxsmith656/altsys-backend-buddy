import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseMeta } from '@/lib/bookingMeta';
import {
  STANDARD_DECLINE_REASONS,
  acceptGuideAssignment,
  declineAndReassignGuide,
  reassignGuideByAdmin,
} from '@/lib/guideAssignmentService';

type Operation = {
  table: string;
  method: 'insert' | 'update';
  payload: unknown;
};

const mockState = vi.hoisted(() => ({
  from: vi.fn(),
  notifyUser: vi.fn(),
  operations: [] as Operation[],
  bookingFetchError: null as Error | null,
  failInsertTable: null as string | null,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: mockState.from },
}));

vi.mock('@/lib/firestoreNotifications', () => ({
  notifyUser: mockState.notifyUser,
}));

function createQueryChain() {
  const chain = {} as Record<string, ReturnType<typeof vi.fn>>;
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.neq = vi.fn(() => chain);
  chain.update = vi.fn(() => chain);
  chain.insert = vi.fn(() => Promise.resolve({ data: null, error: null }));
  chain.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
  chain.single = vi.fn().mockResolvedValue({
    data: {
      id: 'booking-123',
      notes: JSON.stringify({ fullName: 'Alice Hiker', phoneNumber: '09171234567' }),
      user_id: 'user-hiker-1',
      booking_date: '2026-08-25',
      location_id: 'loc-1',
    },
    error: mockState.bookingFetchError,
  });
  return chain;
}

describe('Guide Assignment & Confirmation Service', () => {
  beforeEach(() => {
    mockState.operations.length = 0;
    mockState.bookingFetchError = null;
    mockState.failInsertTable = null;
    mockState.from.mockReset();
    mockState.notifyUser.mockReset();
    mockState.notifyUser.mockResolvedValue('notif-id-123');
    mockState.from.mockImplementation((table: string) => {
      const chain = createQueryChain();
      chain.update = vi.fn((payload: unknown) => {
        mockState.operations.push({ table, method: 'update', payload });
        return chain;
      });
      chain.insert = vi.fn((payload: unknown) => {
        mockState.operations.push({ table, method: 'insert', payload });
        return Promise.resolve({
          data: null,
          error: mockState.failInsertTable === table ? new Error(`${table} insert denied`) : null,
        });
      });
      return chain;
    });
  });

  it('provides standard decline reasons for illness, emergency, weather, and quota', () => {
    expect(STANDARD_DECLINE_REASONS.length).toBeGreaterThanOrEqual(4);
    const ids = STANDARD_DECLINE_REASONS.map((reason) => reason.id);
    expect(ids).toContain('illness');
    expect(ids).toContain('emergency');
    expect(ids).toContain('weather');
    expect(ids).toContain('capacity');
  });

  it('accepts a guide assignment, persists booking metadata, and notifies the hiker', async () => {
    const result = await acceptGuideAssignment({
      assignmentId: 'assign-1', bookingId: 'booking-123', guideId: 'guide-1', guideName: 'Juan Dela Cruz',
      guideUserId: 'user-guide-1', hikerUserId: 'user-hiker-1', bookingDate: '2026-08-25',
    });

    expect(result).toEqual({ success: true });
    expect(mockState.operations).toContainEqual(expect.objectContaining({
      table: 'booking_assignments', method: 'update', payload: expect.objectContaining({ status: 'accepted' }),
    }));
    const bookingUpdate = mockState.operations.find((operation) => operation.table === 'bookings' && operation.method === 'update');
    expect(bookingUpdate).toBeDefined();
    expect(parseMeta((bookingUpdate?.payload as { notes: string }).notes)).toMatchObject({ assignedGuideId: 'guide-1', guideStatus: 'accepted' });
    expect(mockState.notifyUser).toHaveBeenCalledWith('user-hiker-1', expect.objectContaining({ category: 'booking' }));
  });

  it('does not report acceptance success when the assigned booking cannot be read', async () => {
    mockState.bookingFetchError = new Error('booking read denied');

    const result = await acceptGuideAssignment({
      assignmentId: 'assign-1', bookingId: 'booking-123', guideId: 'guide-1', guideName: 'Juan Dela Cruz',
    });

    expect(result).toEqual({ success: false, error: 'booking read denied' });
    expect(mockState.operations).not.toContainEqual(expect.objectContaining({
      table: 'booking_assignments', method: 'update', payload: expect.objectContaining({ status: 'accepted' }),
    }));
  });

  it('declines and reassigns using the schema-supported reassignment_reason field', async () => {
    const result = await declineAndReassignGuide({
      assignmentId: 'assign-1', bookingId: 'booking-123', currentGuideId: 'guide-1', currentGuideName: 'Juan Dela Cruz',
      currentGuideUserId: 'user-guide-1', reason: 'Feeling unwell / fever', replacementGuideId: 'guide-2',
      replacementGuideName: 'Maria Santos', replacementGuideUserId: 'user-guide-2', replacementGuidePhone: '09189998888',
      hikerUserId: 'user-hiker-1', bookingDate: '2026-08-25', locationId: 'loc-1',
    });

    expect(result).toEqual({ success: true });
    const assignmentUpdate = mockState.operations.find((operation) => operation.table === 'booking_assignments' && operation.method === 'update');
    expect(assignmentUpdate?.payload).toEqual(expect.objectContaining({ status: 'declined', reassignment_reason: 'Feeling unwell / fever' }));
    expect(assignmentUpdate?.payload).not.toHaveProperty('decline_reason');
    expect(mockState.operations).toContainEqual(expect.objectContaining({
      table: 'booking_assignments', method: 'insert', payload: expect.objectContaining({ guide_id: 'guide-2', location_id: 'loc-1', status: 'pending' }),
    }));
    expect(mockState.notifyUser).toHaveBeenCalledWith('user-guide-2', expect.objectContaining({ category: 'booking' }));
  });

  it('does not report reassignment success when the replacement assignment insert fails', async () => {
    mockState.failInsertTable = 'booking_assignments';

    const result = await declineAndReassignGuide({
      assignmentId: 'assign-1', bookingId: 'booking-123', currentGuideId: 'guide-1', currentGuideName: 'Juan Dela Cruz',
      reason: 'Emergency', replacementGuideId: 'guide-2', replacementGuideName: 'Maria Santos', locationId: 'loc-1',
    });

    expect(result).toEqual({ success: false, error: 'booking_assignments insert denied' });
    expect(mockState.operations).not.toContainEqual(expect.objectContaining({
      table: 'booking_assignments', method: 'update', payload: expect.objectContaining({ status: 'declined' }),
    }));
  });

  it('returns a declined assignment to admin dispatch when no replacement guide is selected', async () => {
    const result = await declineAndReassignGuide({
      assignmentId: 'assign-1', bookingId: 'booking-123', currentGuideId: 'guide-1', currentGuideName: 'Juan Dela Cruz',
      currentGuideUserId: 'user-guide-1', reason: 'Schedule conflict', replacementGuideId: null, replacementGuideName: null,
      hikerUserId: 'user-hiker-1', bookingDate: '2026-08-25',
    });

    expect(result).toEqual({ success: true });
    const bookingUpdate = mockState.operations.find((operation) => operation.table === 'bookings' && operation.method === 'update');
    expect(parseMeta((bookingUpdate?.payload as { notes: string }).notes)).toMatchObject({ assignedGuideId: null, guideStatus: 'declined', guideDeclineReason: 'Schedule conflict' });
  });

  it('allows admin guide reassignment, records the reason, and notifies affected parties', async () => {
    const result = await reassignGuideByAdmin({
      bookingId: 'booking-123', currentGuideId: 'guide-1', currentGuideName: 'Juan Dela Cruz', currentGuideUserId: 'user-guide-1',
      newGuideId: 'guide-2', newGuideName: 'Maria Santos', newGuideUserId: 'user-guide-2', newGuidePhone: '09189998888',
      reason: 'Guide roster balance', hikerUserId: 'user-hiker-1', bookingDate: '2026-08-25', locationId: 'loc-1',
    });

    expect(result).toEqual({ success: true });
    expect(mockState.operations).toContainEqual(expect.objectContaining({
      table: 'booking_assignments', method: 'update', payload: expect.objectContaining({ reassignment_reason: 'Reassigned by admin: Guide roster balance' }),
    }));
    expect(mockState.notifyUser).toHaveBeenCalledTimes(3);
    expect(mockState.notifyUser).toHaveBeenCalledWith('user-hiker-1', expect.objectContaining({ category: 'booking' }));
  });
});
