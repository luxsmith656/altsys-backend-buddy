import { supabase } from '@/integrations/supabase/client';
import { encodeMeta, parseMeta } from '@/lib/bookingMeta';
import { notifyUser } from '@/lib/firestoreNotifications';

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
}: AcceptAssignmentParams): Promise<{ success: boolean; error?: string }> {
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

    const effectiveHikerId = hikerUserId || booking?.user_id;
    const effectiveDate = bookingDate || booking?.booking_date || 'your scheduled date';

    // 3. Post system message visible in booking chat
    const { error: messageError } = await supabase.from('booking_messages' as any).insert({
      booking_id: bookingId,
      sender_id: guideUserId || null,
      sender_role: 'system',
      kind: 'system',
      content: `✅ Tour Guide ${guideName} has ACCEPTED this booking for ${effectiveDate}. See you at the trailhead!`,
    } as any);
    if (messageError) throw messageError;

    // 4. Notify Hiker
    if (effectiveHikerId) {
      await notifyUser(effectiveHikerId, {
        title: '🎉 Tour Guide Confirmed!',
        body: `Your tour guide ${guideName} has accepted your hike booking for ${effectiveDate}.`,
        category: 'booking',
      });
    }

    return { success: true };
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
  currentGuideId,
  currentGuideName,
  currentGuideUserId,
  reason,
  replacementGuideId,
  replacementGuideName,
  replacementGuideUserId,
  replacementGuidePhone,
  hikerUserId,
  bookingDate,
  locationId,
}: DeclineAndReassignParams): Promise<{ success: boolean; error?: string }> {
  try {
    const decidedAt = new Date().toISOString();
    const cleanReason = reason.trim() || 'Not available';

    const declineCurrentAssignment = async () => {
      const { error } = await supabase
        .from('booking_assignments' as any)
        .update({
          status: 'declined',
          decided_at: decidedAt,
          reassignment_reason: cleanReason,
        } as any)
        .eq('id', assignmentId);
      if (error) throw error;
    };

    // Keep the current assignment active until all handover writes succeed.
    const { data: booking, error: bookingFetchError } = await supabase
      .from('bookings')
      .select('notes, user_id, booking_date, location_id')
      .eq('id', bookingId)
      .single();
    if (bookingFetchError) throw bookingFetchError;
    if (!booking) throw new Error('Assigned booking was not found.');

    const effectiveHikerId = hikerUserId || booking?.user_id;
    const effectiveLocId = locationId || booking?.location_id;
    const effectiveDate = bookingDate || booking?.booking_date || 'your scheduled date';
    const meta = parseMeta(booking?.notes);

    if (replacementGuideId && replacementGuideName) {
      // 3A. Reassign to replacement peer guide
      const { data: existingAss, error: existingError } = await supabase
        .from('booking_assignments' as any)
        .select('id')
        .eq('booking_id', bookingId)
        .eq('guide_id', replacementGuideId)
        .maybeSingle();
      if (existingError) throw existingError;

      if ((existingAss as any)?.id) {
        const { error: replacementUpdateError } = await supabase
          .from('booking_assignments' as any)
          .update({ status: 'pending', decided_at: null, reassignment_reason: null } as any)
          .eq('id', (existingAss as any).id);
        if (replacementUpdateError) throw replacementUpdateError;
      } else {
        const { error: replacementInsertError } = await supabase
          .from('booking_assignments' as any)
          .insert({
            booking_id: bookingId,
            guide_id: replacementGuideId,
            location_id: effectiveLocId,
            status: 'pending',
          } as any);
        if (replacementInsertError) throw replacementInsertError;
      }

      // Update booking metadata
      const updatedMeta = encodeMeta({
        ...meta,
        assignedGuide: replacementGuideName,
        assignedGuideId: replacementGuideId,
        guideStatus: 'reassigned_pending',
        previousGuide: currentGuideName,
        previousGuideId: currentGuideId,
        guideChangeReason: cleanReason,
        guideChangedAt: decidedAt,
      });

      const { error: bookingUpdateError } = await supabase
        .from('bookings')
        .update({ notes: updatedMeta } as any)
        .eq('id', bookingId);
      if (bookingUpdateError) throw bookingUpdateError;

      // System chat messages
      const { error: messageError } = await supabase.from('booking_messages' as any).insert([
        {
          booking_id: bookingId,
          sender_id: currentGuideUserId || null,
          sender_role: 'system',
          kind: 'system',
          content: `🔄 Guide ${currentGuideName} was unable to lead this hike (Reason: ${cleanReason}) and reassigned it to ${replacementGuideName}.`,
        },
        {
          booking_id: bookingId,
          sender_id: null,
          sender_role: 'system',
          kind: 'system',
          content: `📩 Assignment sent to new guide ${replacementGuideName}. Awaiting confirmation.`,
        },
      ] as any);
      if (messageError) throw messageError;

      await declineCurrentAssignment();

      // Notify replacement guide
      if (replacementGuideUserId) {
        await notifyUser(replacementGuideUserId, {
          title: '📋 New Hike Assignment Handover',
          body: `You were reassigned to lead Booking #${bookingId.slice(0, 8)} on ${effectiveDate} by ${currentGuideName}. Please review and accept.`,
          category: 'booking',
        });
      }

      // Notify hiker of guide replacement
      if (effectiveHikerId) {
        await notifyUser(effectiveHikerId, {
          title: '🔄 Tour Guide Update',
          body: `Your tour guide for ${effectiveDate} has been updated to ${replacementGuideName}${replacementGuidePhone ? ` (${replacementGuidePhone})` : ''} due to: ${cleanReason}.`,
          category: 'booking',
        });
      }
    } else {
      // 3B. Returned to Admin / Dispatch pool
      const updatedMeta = encodeMeta({
        ...meta,
        assignedGuide: null,
        assignedGuideId: null,
        guideStatus: 'declined',
        previousGuide: currentGuideName,
        previousGuideId: currentGuideId,
        guideDeclineReason: cleanReason,
        guideChangedAt: decidedAt,
      });

      const { error: bookingUpdateError } = await supabase
        .from('bookings')
        .update({ notes: updatedMeta } as any)
        .eq('id', bookingId);
      if (bookingUpdateError) throw bookingUpdateError;

      const { error: messageError } = await supabase.from('booking_messages' as any).insert({
        booking_id: bookingId,
        sender_id: currentGuideUserId || null,
        sender_role: 'system',
        kind: 'system',
        content: `⚠️ Guide ${currentGuideName} declined this assignment (Reason: ${cleanReason}). Returned to Admin Dispatch pool.`,
      } as any);
      if (messageError) throw messageError;

      await declineCurrentAssignment();

      // Notify hiker that admin is assigning a replacement
      if (effectiveHikerId) {
        await notifyUser(effectiveHikerId, {
          title: '⏳ Tour Guide Reassignment in Progress',
          body: `Your assigned guide was unable to take your hike on ${effectiveDate} (${cleanReason}). The LGU dispatch is assigning a replacement guide for you.`,
          category: 'booking',
        });
      }
    }

    return { success: true };
  } catch (err: any) {
    console.error('declineAndReassignGuide error:', err);
    return { success: false, error: err?.message || 'Failed to decline assignment' };
  }
}

/**
 * Admin reassigns a tour guide on any booking
 */
export async function reassignGuideByAdmin({
  bookingId,
  currentGuideId,
  currentGuideName,
  currentGuideUserId,
  newGuideId,
  newGuideName,
  newGuideUserId,
  newGuidePhone,
  reason,
  hikerUserId,
  bookingDate,
  locationId,
}: AdminReassignParams): Promise<{ success: boolean; error?: string }> {
  try {
    const changedAt = new Date().toISOString();
    const cleanReason = reason.trim() || 'Admin reassignment';

    // 1. Mark current guide assignment as declined/reassigned
    if (currentGuideId) {
      await supabase
        .from('booking_assignments' as any)
          .update({
            status: 'declined',
            decided_at: changedAt,
            reassignment_reason: `Reassigned by admin: ${cleanReason}`,
        } as any)
        .eq('booking_id', bookingId)
        .eq('guide_id', currentGuideId);

      // Free previous guide status if not on duty
      await supabase
        .from('guides')
        .update({ status: 'available' } as any)
        .eq('id', currentGuideId)
        .neq('status', 'on_duty');
    }

    // 2. Insert or update replacement guide assignment
    const { data: existingAss } = await supabase
      .from('booking_assignments' as any)
      .select('id')
      .eq('booking_id', bookingId)
      .eq('guide_id', newGuideId)
      .maybeSingle();

    if ((existingAss as any)?.id) {
      await supabase
        .from('booking_assignments' as any)
        .update({ status: 'pending', decided_at: null, reassignment_reason: null } as any)
        .eq('id', (existingAss as any).id);
    } else {
      await supabase
        .from('booking_assignments' as any)
        .insert({
          booking_id: bookingId,
          guide_id: newGuideId,
          location_id: locationId,
          status: 'pending',
        } as any);
    }

    // 3. Update booking metadata
    const { data: booking } = await supabase
      .from('bookings')
      .select('notes, user_id, booking_date')
      .eq('id', bookingId)
      .single();

    const effectiveHikerId = hikerUserId || booking?.user_id;
    const effectiveDate = bookingDate || booking?.booking_date || 'your scheduled date';
    const meta = parseMeta(booking?.notes);

    const updatedMeta = encodeMeta({
      ...meta,
      assignedGuide: newGuideName,
      assignedGuideId: newGuideId,
      guideStatus: 'reassigned_pending',
      previousGuide: currentGuideName || null,
      previousGuideId: currentGuideId || null,
      guideChangeReason: cleanReason,
      guideChangedAt: changedAt,
    });

    await supabase
      .from('bookings')
      .update({ notes: updatedMeta } as any)
      .eq('id', bookingId);

    // 4. System chat messages
    await supabase.from('booking_messages' as any).insert([
      {
        booking_id: bookingId,
        sender_role: 'system',
        kind: 'system',
        content: `🔄 Admin reassigned tour guide: ${currentGuideName ? `${currentGuideName} replaced by ${newGuideName}` : `Assigned ${newGuideName}`}. Reason: ${cleanReason}`,
      },
      {
        booking_id: bookingId,
        sender_role: 'system',
        kind: 'system',
        content: `📩 Assignment sent to ${newGuideName}. Awaiting guide confirmation.`,
      },
    ] as any);

    // 5. Notify previous guide
    if (currentGuideUserId) {
      await notifyUser(currentGuideUserId, {
        title: 'ℹ️ Booking Reassignment Notice',
        body: `Your assignment for Booking #${bookingId.slice(0, 8)} on ${effectiveDate} was reassigned to ${newGuideName} by the admin (Reason: ${cleanReason}).`,
        category: 'booking',
      });
    }

    // 6. Notify replacement guide
    if (newGuideUserId) {
      await notifyUser(newGuideUserId, {
        title: '📋 New Hike Booking Assignment',
        body: `You have been assigned to lead Booking #${bookingId.slice(0, 8)} on ${effectiveDate}. Please review and accept.`,
        category: 'booking',
      });
    }

    // 7. Notify hiker
    if (effectiveHikerId) {
      await notifyUser(effectiveHikerId, {
        title: '🔄 Tour Guide Changed',
        body: `Your tour guide for ${effectiveDate} is now ${newGuideName}${newGuidePhone ? ` (${newGuidePhone})` : ''}. Reason: ${cleanReason}.`,
        category: 'booking',
      });
    }

    return { success: true };
  } catch (err: any) {
    console.error('reassignGuideByAdmin error:', err);
    return { success: false, error: err?.message || 'Failed to reassign guide' };
  }
}
