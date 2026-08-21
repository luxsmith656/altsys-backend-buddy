import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  STANDARD_DECLINE_REASONS,
  acceptGuideAssignment,
  declineAndReassignGuide,
  reassignGuideByAdmin,
} from '@/lib/guideAssignmentService';

// Mock Supabase client
vi.mock('@/integrations/supabase/client', () => {
  const fakeFrom = vi.fn().mockImplementation((table: string) => {
    const chain: any = {
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockResolvedValue({ data: null, error: null }),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      single: vi.fn().mockResolvedValue({
        data: {
          id: 'booking-123',
          notes: JSON.stringify({ fullName: 'Alice Hiker', phoneNumber: '09171234567' }),
          user_id: 'user-hiker-1',
          booking_date: '2026-08-25',
          location_id: 'loc-1',
        },
        error: null,
      }),
    };
    return chain;
  });

  return {
    supabase: {
      from: fakeFrom,
    },
  };
});

// Mock Firestore notifyUser
vi.mock('@/lib/firestoreNotifications', () => ({
  notifyUser: vi.fn().mockResolvedValue('notif-id-123'),
}));

describe('Guide Assignment & Confirmation Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('provides standard decline reasons for illness, emergency, weather, and quota', () => {
    expect(STANDARD_DECLINE_REASONS.length).toBeGreaterThanOrEqual(4);
    const ids = STANDARD_DECLINE_REASONS.map((r) => r.id);
    expect(ids).toContain('illness');
    expect(ids).toContain('emergency');
    expect(ids).toContain('weather');
    expect(ids).toContain('capacity');
  });

  it('accepts guide assignment and updates booking status', async () => {
    const res = await acceptGuideAssignment({
      assignmentId: 'assign-1',
      bookingId: 'booking-123',
      guideId: 'guide-1',
      guideName: 'Juan Dela Cruz',
      guideUserId: 'user-guide-1',
      hikerUserId: 'user-hiker-1',
      bookingDate: '2026-08-25',
    });

    expect(res.success).toBe(true);
    expect(res.error).toBeUndefined();
  });

  it('declines assignment and reassigns to an available peer guide', async () => {
    const res = await declineAndReassignGuide({
      assignmentId: 'assign-1',
      bookingId: 'booking-123',
      currentGuideId: 'guide-1',
      currentGuideName: 'Juan Dela Cruz',
      currentGuideUserId: 'user-guide-1',
      reason: 'Feeling unwell / fever',
      replacementGuideId: 'guide-2',
      replacementGuideName: 'Maria Santos',
      replacementGuideUserId: 'user-guide-2',
      replacementGuidePhone: '09189998888',
      hikerUserId: 'user-hiker-1',
      bookingDate: '2026-08-25',
      locationId: 'loc-1',
    });

    expect(res.success).toBe(true);
    expect(res.error).toBeUndefined();
  });

  it('declines assignment and returns to admin dispatch when no replacement guide selected', async () => {
    const res = await declineAndReassignGuide({
      assignmentId: 'assign-1',
      bookingId: 'booking-123',
      currentGuideId: 'guide-1',
      currentGuideName: 'Juan Dela Cruz',
      currentGuideUserId: 'user-guide-1',
      reason: 'Schedule conflict',
      replacementGuideId: null,
      replacementGuideName: null,
      hikerUserId: 'user-hiker-1',
      bookingDate: '2026-08-25',
    });

    expect(res.success).toBe(true);
  });

  it('allows Admin to reassign tour guide and notifies all parties', async () => {
    const res = await reassignGuideByAdmin({
      bookingId: 'booking-123',
      currentGuideId: 'guide-1',
      currentGuideName: 'Juan Dela Cruz',
      currentGuideUserId: 'user-guide-1',
      newGuideId: 'guide-2',
      newGuideName: 'Maria Santos',
      newGuideUserId: 'user-guide-2',
      newGuidePhone: '09189998888',
      reason: 'Guide roster balance',
      hikerUserId: 'user-hiker-1',
      bookingDate: '2026-08-25',
      locationId: 'loc-1',
    });

    expect(res.success).toBe(true);
  });
});
