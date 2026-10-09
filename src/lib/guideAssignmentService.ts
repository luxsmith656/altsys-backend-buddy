import { supabase } from '@/integrations/supabase/client';
import { encodeMeta, parseMeta } from '@/lib/bookingMeta';
import { notifyUser } from '@/lib/firestoreNotifications';
import { confirmReservation } from '@/lib/notification-service';

export interface AcceptAssignmentParams {
  assignmentId: string;
  bookingId: string;
  guideId: string;
  guideName: string;
  guideUserId?: string | null;
  hikerUserId?: string | null;
  bookingDate?: string;
  routeName?: string;
}

export interface DeclineAndReassignParams {
  assignmentId: string;
  bookingId: string;
  currentGuideId: string;
  currentGuideName: string;
  currentGuideUserId?: string | null;
  reason: string;
  replacementGuideId?: string | null;
  replacementGuideName?: string | null;
  replacementGuideUserId?: string | null;
  replacementGuidePhone?: string | null;
  hikerUserId?: string | null;
  bookingDate?: string;
  locationId?: string | null;
}

export interface AdminReassignParams {
  bookingId: string;
  currentGuideId?: string | null;
  currentGuideName?: string | null;
  currentGuideUserId?: string | null;
  newGuideId: string;
  newGuideName: string;
  newGuideUserId?: string | null;
  newGuidePhone?: string | null;
  reason: string;
  hikerUserId?: string | null;
  bookingDate?: string;
  locationId?: string | null;
}

/**
 * Standard reasons for guide decline / reassignment
 */
export const STANDARD_DECLINE_REASONS = [
  { id: 'illness', label: '🤒 Not feeling well / Medical reason' },
  { id: 'emergency', label: '📅 Family emergency / Schedule conflict' },
  { id: 'weather', label: '🌧️ Trail or severe weather safety concern' },
  { id: 'capacity', label: '👥 Daily hiker group quota reached' },
  { id: 'custom', label: '✏️ Other reason (specify)' },
];

/**
 * Guide accepts an assigned booking
 */
export async function acceptGuideAssignment({
  assignmentId,
  bookingId,
  guideId,
  guideName,
  guideUserId,
  hikerUserId,
  bookingDate,
  routeName,
}: AcceptAssignmentParams): Promise<{ success: boolean; error?: string; warnings?: string[] }> {
  try {
    const decidedAt = new Date().toISOString();

    // Read the booking before changing assignment state so a denied read leaves it untouched.
    const { data: booking, error: fetchError } = await supabase
      .from('bookings')
      .select('notes, user_id, booking_date')
      .eq('id', bookingId)
      .single();

    if (fetchError) throw fetchError;
    if (!booking) throw new Error('Assigned booking was not found.');

    const meta = parseMeta(booking.notes);
    const updatedMeta = encodeMeta({
      ...meta,
      assignedGuide: guideName,
      assignedGuideId: guideId,
      guideStatus: 'accepted',
      guideAcceptedAt: decidedAt,
    });

    const { error: assignError } = await supabase
      .from('booking_assignments' as any)
      .update({ status: 'accepted', decided_at: decidedAt } as any)
      .eq('id', assignmentId);
    if (assignError) throw assignError;

    const { error: bookingUpdateError } = await supabase
      .from('bookings')
      .update({ status: 'confirmed', notes: updatedMeta } as any)
      .eq('id', bookingId);
    if (bookingUpdateError) throw bookingUpdateError;

    const warnings: string[] = [];
    const email = await confirmReservation({ id: bookingId });
    if (email.success === false) warnings.push(`Confirmation email: ${email.error}`);

    const effectiveHikerId = hikerUserId || booking?.user_id;
    const effectiveDate = bookingDate || booking?.booking_date || 'your scheduled date';

    // 3. Post system message visible in booking chat
    const { error: messageError } = await supabase.from('booking_messages' as any).insert({
      booking_id: bookingId,
      sender_id: guideUserId || null,
      sender_role: 'guide',
      recipient_role: 'hiker',
      kind: 'system',
      content: `✅ Mountain Guide ${guideName} has ACCEPTED this booking for ${effectiveDate}. See you at the trailhead!`,
    } as any);
    if (messageError) warnings.push(`Booking chat: ${messageError.message}`);

    // 4. Notify Hiker
    if (effectiveHikerId) {
      await notifyUser(effectiveHikerId, {
        title: '🎉 Mountain Guide Confirmed!',
        body: `Your mountain guide ${guideName} has accepted your hike booking for ${effectiveDate}.`,
        category: 'booking',
        link: `/hiker?booking=${encodeURIComponent(bookingId)}`,
      }).catch(() => warnings.push('In-app notification could not be delivered.'));
    }

    return warnings.length ? { success: true, warnings } : { success: true };
  } catch (err: any) {
    console.error('acceptGuideAssignment error:', err);
    return { success: false, error: err?.message || 'Failed to accept assignment' };
  }
}

/**
 * Guide declines assignment and optionally reassigns to an available peer guide
 */
export async function declineAndReassignGuide({
  assignmentId,
  bookingId,
  reason,
  replacementGuideId,
}: DeclineAndReassignParams): Promise<{ success: boolean; error?: string }> {
  try {
    const cleanReason = reason.trim() || 'Not available';
    const { data, error } = await (supabase.rpc as any)('guide_reassign_hike_assignment', {
      p_assignment_id: assignmentId,
      p_replacement_guide_id: replacementGuideId || null,
      p_reason: cleanReason,
    });
    if (error) {
      if (error.code === 'PGRST202') throw new Error('Guide reassignment is not installed. Apply migration 20261006120000_guide_message_audience_and_reassignment.sql.');
      throw error;
    }
    const result = data as unknown as {
      replacementGuideUserId: string | null; replacementGuideName: string | null;
      oldGuideName: string; hikerUserId: string | null; bookingDate: string;
    };
    if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('Guide reassignment returned an invalid response. Refresh before retrying.');
    const date = result.bookingDate || 'your scheduled date';
    if (result.replacementGuideUserId && result.replacementGuideName) {
      await notifyUser(result.replacementGuideUserId, {
        title: 'New Hike Assignment Handover',
        body: `You were reassigned to Booking #${bookingId.slice(0, 8)} on ${date} by ${result.oldGuideName}. Please review and accept.`,
        category: 'booking',
      }).catch((error) => console.warn('Guide handoff committed, but replacement notification failed:', error));
    }
    if (result.hikerUserId) {
      const { error: hikerMessageError } = await supabase.from('booking_messages' as any).insert({
        booking_id: bookingId,
        sender_id: null,
        sender_role: 'system',
        recipient_role: 'hiker',
        kind: 'system',
        content: result.replacementGuideName
          ? `Mountain guide changed to ${result.replacementGuideName} for ${date}. Reason: ${cleanReason}`
          : `Your assigned guide could not take the hike on ${date}. Reason: ${cleanReason}. A replacement is being assigned.`,
      } as any);
      if (hikerMessageError) console.warn('Guide handoff committed, but the hiker message could not be added:', hikerMessageError.message);
      await notifyUser(result.hikerUserId, {
        title: result.replacementGuideName ? 'Mountain Guide Update' : 'Mountain Guide Reassignment in Progress',
        body: result.replacementGuideName
          ? `Your mountain guide for ${date} has been updated to ${result.replacementGuideName} due to: ${cleanReason}.`
          : `Your assigned guide was unable to take your hike on ${date} (${cleanReason}). The LGU dispatch is assigning a replacement.`,
        category: 'booking',
        link: `/hiker?booking=${encodeURIComponent(bookingId)}`,
      }).catch((error) => console.warn('Guide handoff committed, but hiker notification failed:', error));
    }

    return { success: true };
  } catch (err: any) {
    console.error('declineAndReassignGuide error:', err);
    return { success: false, error: err?.message || 'Failed to decline assignment' };
  }
}

/**
 * Admin reassigns a mountain guide on any booking
 */
export async function reassignGuideByAdmin({
  newGuidePhone,
  bookingId,
  newGuideId,
  reason,
  hikerUserId,
  bookingDate,
}: AdminReassignParams): Promise<{ success: boolean; error?: string }> {
  try {
    const cleanReason = reason.trim() || 'Admin reassignment';
    const { data, error } = await (supabase.rpc as any)('admin_reassign_hike_guide', {
      p_booking_id: bookingId,
      p_guide_id: newGuideId,
      p_reason: cleanReason,
    });
    if (error) {
      if (error.code === 'PGRST202') throw new Error('Atomic guide reassignment is not installed. Apply migration 20261006120000_guide_message_audience_and_reassignment.sql.');
      if (error.code === 'PGRST204' && /reassignment_reason|recipient_role/i.test(error.message || '')) {
        throw new Error('Guide reassignment fields are missing in the hosted database. Apply 20261009110000_repair_announcement_and_reassignment_schema.sql.');
      }
      throw error;
    }
    const result = data as unknown as {
      guideUserId: string; guideName: string; guidePhone: string | null;
      oldGuideUserId: string | null; oldGuideName: string | null;
      hikerUserId: string | null; bookingDate: string;
    };
    if (!result || typeof result !== 'object' || Array.isArray(result) || typeof result.guideUserId !== 'string') {
      throw new Error('Guide reassignment returned an invalid response. Refresh the booking before retrying.');
    }
    const effectiveHikerId = result.hikerUserId || hikerUserId;
    const effectiveDate = result.bookingDate || bookingDate || 'your scheduled date';

    const { error: messageError } = await supabase.from('booking_messages').insert({
      booking_id: bookingId,
      sender_role: 'system',
      kind: 'system',
      content: `Admin reassigned mountain guide: ${result.oldGuideName ? `${result.oldGuideName} replaced by ${result.guideName}` : `Assigned ${result.guideName}`}. Reason: ${cleanReason}`,
    });
    if (messageError) console.warn('Guide reassigned, but booking notice could not be added:', messageError.message);

    // 5. Notify previous guide
    if (result.oldGuideUserId) {
      await notifyUser(result.oldGuideUserId, {
        title: 'ℹ️ Booking Reassignment Notice',
        body: `Your assignment for Booking #${bookingId.slice(0, 8)} on ${effectiveDate} was reassigned to ${result.guideName} by the admin (Reason: ${cleanReason}).`,
        category: 'booking',
      }).catch((error) => console.warn('Guide reassigned, but previous-guide notification failed:', error));
    }

    // 6. Notify replacement guide
    if (result.guideUserId) {
      await notifyUser(result.guideUserId, {
        title: '📋 New Hike Booking Assignment',
        body: `You have been assigned to lead Booking #${bookingId.slice(0, 8)} on ${effectiveDate}. Please review and accept.`,
        category: 'booking',
      }).catch((error) => console.warn('Guide reassigned, but replacement notification failed:', error));
    }

    // 7. Notify hiker
    if (effectiveHikerId) {
      await notifyUser(effectiveHikerId, {
        title: '🔄 Mountain Guide Changed',
        body: `Your mountain guide for ${effectiveDate} is now ${result.guideName}${result.guidePhone ? ` (${result.guidePhone})` : newGuidePhone ? ` (${newGuidePhone})` : ''}. Reason: ${cleanReason}.`,
        category: 'booking',
      }).catch((error) => console.warn('Guide reassigned, but hiker notification failed:', error));
    }

    return { success: true };
  } catch (err: any) {
    console.error('reassignGuideByAdmin error:', err);
    return { success: false, error: err?.message || 'Failed to reassign guide' };
  }
}

export interface AdminAssignParams {
  bookingId: string;
  guideId: string;
  guideName: string;
  guideUserId?: string | null;
  locationId?: string | null;
  /** Extra booking-meta fields to persist with the assignment (e.g. assigned trail). */
  extraMeta?: Record<string, unknown>;
}

/**
 * Admin assigns a mountain guide to a booking (first assignment from dispatch).
 * Every write is checked so the admin never sees a success toast for an
 * assignment the guide cannot actually see.
 */
export async function assignGuideToBooking({
  bookingId, guideId, extraMeta = {},
}: AdminAssignParams): Promise<{ success: boolean; error?: string; warnings?: string[] }> {
  try {
    const { data, error } = await supabase.rpc('admin_assign_hike_guide', {
      p_booking_id: bookingId,
      p_guide_id: guideId,
      p_trail_id: typeof extraMeta.assignedTrailZoneId === 'string' ? extraMeta.assignedTrailZoneId : null,
    });
    if (error) {
      if (error.code === 'PGRST202') throw new Error('Guide assignment update is not installed. Apply migration 20261004120000_atomic_admin_guide_assignment.sql.');
      throw error;
    }
    if (!data || typeof data !== 'object' || Array.isArray(data) ||
        typeof data.guideUserId !== 'string' || typeof data.guideName !== 'string' ||
        typeof data.bookingDate !== 'string' || typeof data.unchanged !== 'boolean') {
      throw new Error('Guide assignment returned an invalid response. Refresh the booking before retrying.');
    }
    if (data.unchanged) return { success: true };
    const warnings: string[] = [];
    const { error: messageError } = await supabase.from('booking_messages').insert({
      booking_id: bookingId, sender_role: 'system', kind: 'system',
      content: `Admin assigned mountain guide ${data.guideName}. Awaiting guide acceptance.`,
    });
    if (messageError) warnings.push(`Booking message: ${messageError.message}`);
    await notifyUser(data.guideUserId, {
      title: 'New Hike Booking Assignment',
      body: `You have been assigned to Booking #${bookingId.slice(0, 8)} on ${data.bookingDate}. Please review and accept.`,
      category: 'booking',
    }).catch(() => warnings.push('Guide notification could not be delivered.'));
    return warnings.length ? { success: true, warnings } : { success: true };
  } catch (error: unknown) {
    const message = error && typeof error === 'object' && 'message' in error ? String(error.message) : 'Failed to assign guide';
    return { success: false, error: message };
  }
}
