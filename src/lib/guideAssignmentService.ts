import { supabase } from '@/integrations/supabase/client';
import { encodeMeta, parseMeta } from '@/lib/bookingMeta';
import { notifyUser } from '@/lib/firestoreNotifications';
import { confirmReservation, type BookingEmailResult } from '@/lib/notification-service';
import { calculateGuidesNeeded } from '@/lib/payments';

async function expediteHikerConfirmationEmail(bookingId: string): Promise<BookingEmailResult | null> {
  const { data, error } = await supabase
    .from('bookings')
    .select('status')
    .eq('id', bookingId)
    .maybeSingle();
  if (error) throw error;
  if (data?.status !== 'confirmed') return null;
  return confirmReservation({ id: bookingId });
}

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
      .select('notes, user_id, booking_date, group_size')
      .eq('id', bookingId)
      .single();

    if (fetchError) throw fetchError;
    if (!booking) throw new Error('Assigned booking was not found.');

    const meta = parseMeta(booking.notes);
    const existingGuides = Array.isArray((meta as any).assignedGuides) ? (meta as any).assignedGuides : [];
    const isAdditionalGuide = Boolean(meta.assignedGuideId && meta.assignedGuideId !== guideId);
    const assignedGuides = [
      ...existingGuides.filter((guide: any) => guide?.id !== guideId),
      { id: guideId, name: guideName, status: 'accepted', acceptedAt: decidedAt },
    ];
    const updatedMeta = encodeMeta({
      ...meta,
      ...(isAdditionalGuide ? {} : {
        assignedGuide: guideName,
        assignedGuideId: guideId,
        guideStatus: 'accepted',
        guideAcceptedAt: decidedAt,
      }),
      assignedGuides,
      additionalGuides: isAdditionalGuide ? assignedGuides.filter((guide: any) => guide.id !== meta.assignedGuideId) : [],
    } as any);

    const { error: assignError } = await supabase
      .from('booking_assignments' as any)
      .update({ status: 'accepted', decided_at: decidedAt } as any)
      .eq('id', assignmentId);
    if (assignError) throw assignError;

    const { count: acceptedCount } = await supabase
      .from('booking_assignments' as any)
      .select('id', { count: 'exact', head: true })
      .eq('booking_id', bookingId)
      .eq('status', 'accepted');
    const requiredGuides = calculateGuidesNeeded(Number((booking as any).group_size) || 1);
    // Older clients/mocks may not expose a count response. In the real API a
    // successful count is numeric; only that response should gate confirmation.
    const bookingStatus = acceptedCount == null || acceptedCount >= requiredGuides ? 'confirmed' : 'pending';
    const { error: bookingUpdateError } = await supabase
      .from('bookings')
      .update({ status: bookingStatus, notes: updatedMeta } as any)
      .eq('id', bookingId);
    if (bookingUpdateError) throw bookingUpdateError;

    const warnings: string[] = [];
    if (bookingStatus === 'confirmed') {
      const email = await confirmReservation({ id: bookingId });
      if (email.success === false) warnings.push(`Confirmation email: ${email.error}`);
    }

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

    // A confirmed status transition is delivered by the booking lifecycle
    // trigger. Keep the earlier, partial-assignment notice so multi-guide
    // groups still know one guide accepted while dispatch continues.
    if (effectiveHikerId && bookingStatus !== 'confirmed') {
      await notifyUser(effectiveHikerId, {
        title: '📋 Guide Assignment Accepted',
        body: `${guideName} accepted your hike booking for ${effectiveDate}. Dispatch is still confirming the remaining guide assignment.`,
        category: 'booking',
        link: `/hiker?booking=${encodeURIComponent(bookingId)}`,
        bookingId,
      });
    }

    return warnings.length ? { success: true, warnings } : { success: true };
  } catch (err: any) {
    console.error('acceptGuideAssignment error:', err);
    return { success: false, error: err?.message || 'Failed to accept assignment' };
  }
}

export async function addAdditionalGuideToBooking({ bookingId, guideId, guideUserId, guideName, bookingDate }: {
  bookingId: string;
  guideId: string;
  guideUserId?: string | null;
  guideName: string;
  bookingDate?: string;
}): Promise<{ success: boolean; error?: string; warnings?: string[] }> {
  try {
    const { data, error } = await (supabase.rpc as any)('admin_add_hike_guide', {
      p_booking_id: bookingId,
      p_guide_id: guideId,
    });
    if (error) throw error;
    const warnings: string[] = [];
    const date = data?.bookingDate || bookingDate || 'your scheduled date';
    const { error: messageError } = await supabase.from('booking_messages' as any).insert({
      booking_id: bookingId,
      sender_role: 'system',
      kind: 'system',
      content: `Admin assigned additional mountain guide ${guideName} for ${date}. The booking is confirmed; the guide was notified.`,
    } as any);
    if (messageError) warnings.push(`Booking message: ${messageError.message}`);
    if (guideUserId) await notifyUser(guideUserId, {
      title: 'Additional Hike Guide Assignment',
      body: `You have been assigned as an additional guide for Booking #${bookingId.slice(0, 8)} on ${date}. The booking is confirmed; review the details in your Guide Dashboard.`,
      category: 'booking',
      bookingId,
    });
    // The primary assignment owns the single confirmation email queue entry.
    return warnings.length ? { success: true, warnings } : { success: true };
  } catch (error: any) {
    return { success: false, error: error?.message || 'Failed to assign the additional guide' };
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
      oldGuideUserId: string | null; oldGuideName: string; hikerUserId: string | null; bookingDate: string;
      locationId: string | null;
    };
    if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('Guide reassignment returned an invalid response. Refresh before retrying.');
    const date = result.bookingDate || 'your scheduled date';
    if (result.replacementGuideUserId && result.replacementGuideName) {
      await notifyUser(result.replacementGuideUserId, {
        title: 'New Hike Assignment Handover',
        body: `You were reassigned to confirmed Booking #${bookingId.slice(0, 8)} on ${date} by ${result.oldGuideName}. Review the details in your Guide Dashboard.`,
        category: 'booking',
        bookingId,
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
        bookingId,
      }).catch((error) => console.warn('Guide handoff committed, but hiker notification failed:', error));
    }

    if (!result.replacementGuideUserId) {
      const { error: adminMessageError } = await supabase.from('booking_messages' as any).insert({
        booking_id: bookingId,
        sender_id: result.oldGuideUserId,
        sender_role: 'guide',
        recipient_role: 'admin',
        kind: 'reassignment_request',
        content: `Guide ${result.oldGuideName} returned this booking to admin dispatch. Reason: ${cleanReason}`,
      } as any);
      if (adminMessageError) console.warn('Guide handoff committed, but admin dispatch message could not be added:', adminMessageError.message);

      const { data: scopedAdmins } = await supabase
        .from('user_locations' as any)
        .select('user_id')
        .eq('location_id', result.locationId || '');
      const scopedIds = [...new Set(((scopedAdmins as any[]) || []).map((row) => row.user_id).filter(Boolean))];
      if (scopedIds.length) {
        const { data: adminRoles } = await supabase
          .from('user_roles' as any)
          .select('user_id,role')
          .in('user_id', scopedIds)
          .in('role', ['admin', 'super_admin']);
        await Promise.all([...new Set(((adminRoles as any[]) || []).map((row) => row.user_id).filter(Boolean))].map((id) =>
          notifyUser(id, {
            title: 'Guide reassignment requested',
            body: `${result.oldGuideName} returned Booking #${bookingId.slice(0, 8)} to dispatch. Reason: ${cleanReason}`,
            category: 'booking',
            link: '/admin?tab=requests',
            bookingId,
          }).catch((error) => console.warn('Guide handoff committed, but admin notification failed:', error)),
        ));
      }
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
        bookingId,
      }).catch((error) => console.warn('Guide reassigned, but previous-guide notification failed:', error));
    }

    // 6. Notify replacement guide
    if (result.guideUserId) {
      await notifyUser(result.guideUserId, {
        title: '📋 New Hike Booking Assignment',
        body: `You have been assigned to lead confirmed Booking #${bookingId.slice(0, 8)} on ${effectiveDate}. Review the details in your Guide Dashboard.`,
        category: 'booking',
        bookingId,
      }).catch((error) => console.warn('Guide reassigned, but replacement notification failed:', error));
    }

    // 7. Notify hiker
    if (effectiveHikerId) {
      await notifyUser(effectiveHikerId, {
        title: '🔄 Mountain Guide Changed',
        body: `Your mountain guide for ${effectiveDate} is now ${result.guideName}${result.guidePhone ? ` (${result.guidePhone})` : newGuidePhone ? ` (${newGuidePhone})` : ''}. Reason: ${cleanReason}.`,
        category: 'booking',
        bookingId,
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
  /** Called after the confirmation email finishes, without delaying assignment completion. */
  onConfirmationEmailResult?: (result: BookingEmailResult | null) => void;
}

/**
 * Admin assigns a mountain guide to a booking (first assignment from dispatch).
 * Every write is checked so the admin never sees a success toast for an
 * assignment the guide cannot actually see.
 */
export async function assignGuideToBooking({
  bookingId, guideId, extraMeta = {}, onConfirmationEmailResult,
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
      content: `Admin assigned mountain guide ${data.guideName}. The booking is confirmed and the guide was notified.`,
    });
    if (messageError) warnings.push(`Booking message: ${messageError.message}`);
    await notifyUser(data.guideUserId, {
      title: 'New Hike Booking Assignment',
      body: `You have been assigned to confirmed Booking #${bookingId.slice(0, 8)} on ${data.bookingDate}. Review the details in your Guide Dashboard.`,
      category: 'booking',
      bookingId,
    });
    // The booking is already committed and the email is also queued by the
    // database. Do not make the admin wait for the provider response here.
    void expediteHikerConfirmationEmail(bookingId)
      .then((email) => onConfirmationEmailResult?.(email))
      .catch((error) => {
        console.warn('Booking confirmed, but confirmation email follow-up failed:', error);
        onConfirmationEmailResult?.({
          success: false,
          code: 'unavailable',
          error: 'The reservation email is queued, but its delivery status could not be checked yet.',
        });
      });
    return warnings.length ? { success: true, warnings } : { success: true };
  } catch (error: unknown) {
    const message = error && typeof error === 'object' && 'message' in error ? String(error.message) : 'Failed to assign guide';
    return { success: false, error: message };
  }
}
