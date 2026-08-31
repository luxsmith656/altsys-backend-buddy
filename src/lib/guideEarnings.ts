import { parseMeta } from '@/lib/bookingMeta';
import { calculateFees } from '@/lib/payments';
import { isSameMonth, isSameWeek } from 'date-fns';

export interface GuideHikeRecord {
  assignmentId: string;
  bookingId: string;
  hikeDate: string;
  hikerName: string;
  hikerPhone: string;
  groupSize: number;
  guideFee: number;
  paymentMethod: string;
  paymentStatus: 'paid' | 'pending' | 'unsettled';
  assignmentStatus: 'pending' | 'accepted' | 'completed' | 'declined';
  bookingStatus: string;
  completedAt?: string | null;
  createdAt: string;
}

export interface GuideEarningsSummary {
  lifetimeEarned: number;
  thisMonthEarned: number;
  thisWeekEarned: number;
  pendingEarnings: number;
  completedHikesCount: number;
  acceptedHikesCount: number;
  pendingHikesCount: number;
  averageFeePerHike: number;
  hikeRecords: GuideHikeRecord[];
}

/**
 * Calculates a guide's earnings and fee ledger from their assignments and bookings.
 * The booking schedule determines the standard fee (morning ₱800, night ₱1,000,
 * overnight ₱1,600) or uses the guide's custom per_trip_fee.
 */
export function calculateGuideEarnings(
  assignments: any[],
  customPerTripFee?: number | null
): GuideEarningsSummary {
  const baseRate = Number(customPerTripFee) > 0 ? Number(customPerTripFee) : 800;
  const now = new Date();

  let lifetimeEarned = 0;
  let thisMonthEarned = 0;
  let thisWeekEarned = 0;
  let pendingEarnings = 0;
  let completedHikesCount = 0;
  let acceptedHikesCount = 0;
  let pendingHikesCount = 0;

  const hikeRecords: GuideHikeRecord[] = [];

  for (const a of assignments) {
    const booking = a.booking || {};
    const meta = parseMeta(booking.notes);
    const groupSize = Number(booking.group_size || meta.actualGroupSize || 1);
    
    // Booking fees contain the total for every required guide. This ledger is
    // per guide, so divide the booking total across the assigned guide count.
    const feeCalculation = calculateFees(groupSize, { hikeType: meta.hikeType });
    const guideCount = Math.max(1, Math.ceil(groupSize / 8));
    const bookingGuideFee = Number(meta.guideFee) > 0
      ? Number(meta.guideFee)
      : feeCalculation.guideFee;
    const fee = baseRate === 800
      ? Math.round(bookingGuideFee / guideCount)
      : baseRate;

    const assignmentStatus = a.status || 'pending';
    const isCompleted =
      assignmentStatus === 'completed' ||
      (assignmentStatus === 'accepted' && booking.status === 'completed');
    const isAccepted = assignmentStatus === 'accepted' && !isCompleted;
    const isPending = assignmentStatus === 'pending';

    // Payment state detection
    let paymentStatus: 'paid' | 'pending' | 'unsettled' = 'pending';
    if (assignmentStatus === 'declined' || booking.payment_status === 'cancelled') {
      paymentStatus = 'unsettled';
    } else if (
      booking.payment_status === 'paid' ||
      meta.paymentStatus === 'paid' ||
      isCompleted
    ) {
      paymentStatus = 'paid';
    }

    const hikeDateStr = booking.booking_date || a.created_at?.split('T')[0] || '';
    const hikeDate = hikeDateStr ? new Date(hikeDateStr) : new Date(a.created_at || Date.now());

    if (isCompleted) {
      completedHikesCount += 1;
      lifetimeEarned += fee;

      if (!isNaN(hikeDate.getTime())) {
        if (isSameMonth(hikeDate, now)) {
          thisMonthEarned += fee;
        }
        if (isSameWeek(hikeDate, now, { weekStartsOn: 1 })) {
          thisWeekEarned += fee;
        }
      }
    } else if (isAccepted) {
      acceptedHikesCount += 1;
      pendingEarnings += fee;
    } else if (isPending) {
      pendingHikesCount += 1;
    }

    hikeRecords.push({
      assignmentId: a.id,
      bookingId: a.booking_id || booking.id || a.id,
      hikeDate: hikeDateStr,
      hikerName: meta.fullName || booking.emergency_contact_name || 'Lead Hiker',
      hikerPhone: meta.phoneNumber || booking.emergency_contact_phone || '—',
      groupSize,
      guideFee: fee,
      paymentMethod: meta.paymentMethod || booking.payment_method || 'Onsite Cash / GCash',
      paymentStatus,
      assignmentStatus: isCompleted ? 'completed' : assignmentStatus,
      bookingStatus: booking.status || 'confirmed',
      completedAt: meta.hikeCompletedAt || a.decided_at || null,
      createdAt: a.created_at || new Date().toISOString(),
    });
  }

  // Sort hike records descending by date
  hikeRecords.sort((a, b) => {
    const dateA = new Date(a.hikeDate || a.createdAt).getTime();
    const dateB = new Date(b.hikeDate || b.createdAt).getTime();
    return dateB - dateA;
  });

  const averageFeePerHike = completedHikesCount > 0 ? Math.round(lifetimeEarned / completedHikesCount) : 0;

  return {
    lifetimeEarned,
    thisMonthEarned,
    thisWeekEarned,
    pendingEarnings,
    completedHikesCount,
    acceptedHikesCount,
    pendingHikesCount,
    averageFeePerHike,
    hikeRecords,
  };
}
