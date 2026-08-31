import { describe, it, expect } from 'vitest';
import { calculateGuideEarnings } from '@/lib/guideEarnings';

describe('Guide Earnings Calculator', () => {
  it('calculates lifetime earnings, completed counts, and itemized records for standard base fees', () => {
    const mockAssignments = [
      {
        id: 'assign-1',
        booking_id: 'bk-1',
        status: 'completed',
        created_at: '2026-08-01T08:00:00Z',
        booking: {
          id: 'bk-1',
          booking_date: '2026-08-01',
          group_size: 4,
          status: 'completed',
          payment_status: 'paid',
          notes: JSON.stringify({ fullName: 'Alice Walker', phoneNumber: '09171111111' }),
        },
      },
      {
        id: 'assign-2',
        booking_id: 'bk-2',
        status: 'completed',
        created_at: '2026-08-15T08:00:00Z',
        booking: {
          id: 'bk-2',
          booking_date: '2026-08-15',
          group_size: 12, // Requires 2 guides; this guide receives one ₱800 share
          status: 'completed',
          payment_status: 'paid',
          notes: JSON.stringify({ fullName: 'Bob Builder', phoneNumber: '09182222222' }),
        },
      },
      {
        id: 'assign-3',
        booking_id: 'bk-3',
        status: 'accepted',
        created_at: '2026-08-28T08:00:00Z',
        booking: {
          id: 'bk-3',
          booking_date: '2026-08-30',
          group_size: 2,
          status: 'confirmed',
          notes: JSON.stringify({ fullName: 'Charlie Davis' }),
        },
      },
      {
        id: 'assign-4',
        booking_id: 'bk-4',
        status: 'pending',
        created_at: '2026-08-28T09:00:00Z',
        booking: {
          id: 'bk-4',
          booking_date: '2026-08-31',
          group_size: 5,
          status: 'pending',
        },
      },
    ];

    const result = calculateGuideEarnings(mockAssignments, 800);

    // Completed: one ₱800 share from each assigned hike.
    expect(result.lifetimeEarned).toBe(1600);
    expect(result.completedHikesCount).toBe(2);
    expect(result.acceptedHikesCount).toBe(1);
    expect(result.pendingHikesCount).toBe(1);
    // Pending: 800 from bk-3
    expect(result.pendingEarnings).toBe(800);
    expect(result.averageFeePerHike).toBe(800);
    expect(result.hikeRecords.length).toBe(4);
    expect(result.hikeRecords[0].hikerName).toBeDefined();
  });

  it('respects customized per_trip_fee override', () => {
    const mockAssignments = [
      {
        id: 'assign-custom-1',
        booking_id: 'bk-c1',
        status: 'completed',
        created_at: '2026-08-10T08:00:00Z',
        booking: {
          id: 'bk-c1',
          booking_date: '2026-08-10',
          group_size: 5,
          status: 'completed',
          payment_status: 'paid',
          notes: JSON.stringify({ fullName: 'Diana Prince' }),
        },
      },
    ];

    const result = calculateGuideEarnings(mockAssignments, 1000);
    expect(result.lifetimeEarned).toBe(1000);
    expect(result.completedHikesCount).toBe(1);
  });

  it('uses the stored hike type when a legacy booking has no guide fee field', () => {
    const result = calculateGuideEarnings([
      {
        id: 'assign-night-1',
        booking_id: 'bk-night',
        status: 'completed',
        created_at: '2026-08-10T08:00:00Z',
        booking: {
          id: 'bk-night',
          booking_date: '2026-08-10',
          group_size: 1,
          status: 'completed',
          notes: JSON.stringify({ hikeType: 'night', fullName: 'Night Hiker' }),
        },
      },
    ]);

    expect(result.hikeRecords[0].guideFee).toBe(1000);
  });

  it('credits an assigned guide only their share of a multi-guide booking fee', () => {
    const result = calculateGuideEarnings([
      {
        id: 'assign-group-guide-1',
        booking_id: 'bk-group',
        status: 'completed',
        created_at: '2026-08-20T08:00:00Z',
        booking: {
          id: 'bk-group',
          booking_date: '2026-08-20',
          group_size: 12,
          status: 'completed',
          payment_status: 'paid',
          notes: JSON.stringify({ guideFee: 1600, fullName: 'Large Group Lead' }),
        },
      },
    ]);

    expect(result.lifetimeEarned).toBe(800);
    expect(result.hikeRecords[0].guideFee).toBe(800);
  });

  it('does not pay a declined guide when the replacement later completes the booking', () => {
    const result = calculateGuideEarnings([
      {
        id: 'declined-assignment',
        booking_id: 'completed-by-replacement',
        status: 'declined',
        created_at: '2026-08-20T08:00:00Z',
        booking: {
          id: 'completed-by-replacement',
          booking_date: '2026-08-20',
          group_size: 4,
          status: 'completed',
          payment_status: 'paid',
        },
      },
    ]);

    expect(result.lifetimeEarned).toBe(0);
    expect(result.completedHikesCount).toBe(0);
    expect(result.hikeRecords[0]).toMatchObject({
      assignmentStatus: 'declined',
      paymentStatus: 'unsettled',
    });
  });

  it('handles empty assignments without errors', () => {
    const result = calculateGuideEarnings([]);
    expect(result.lifetimeEarned).toBe(0);
    expect(result.thisMonthEarned).toBe(0);
    expect(result.pendingEarnings).toBe(0);
    expect(result.completedHikesCount).toBe(0);
    expect(result.averageFeePerHike).toBe(0);
    expect(result.hikeRecords).toEqual([]);
  });
});
