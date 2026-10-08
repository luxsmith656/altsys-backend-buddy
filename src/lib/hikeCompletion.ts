import { encodeMeta, parseMeta } from '@/lib/bookingMeta';
import { notifyUser } from '@/lib/firestoreNotifications';
import { supabase } from '@/integrations/supabase/client';

export type CompleteHikeResult = {
  success: boolean;
  alreadyCompleted?: boolean;
  error?: string;
};

type CompletionInput = {
  bookingId: string;
  notes: string;
  hikerUserId?: string | null;
  guideName?: string | null;
  completedBy?: string | null;
};

/**
 * Closes the shared booking/session/assignment transaction for either staff or
 * the assigned guide. The database function is idempotent, so double clicks
 * and realtime retries cannot create a second completion event.
 */
export async function completeHike({
  bookingId,
  notes,
  hikerUserId,
  guideName,
  completedBy,
}: CompletionInput): Promise<CompleteHikeResult> {
  const rpc = supabase.rpc as unknown as (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
  const { data, error } = await rpc('complete_hike_session', {
    p_booking_id: bookingId,
    p_notes: notes,
  });

  if (error) return { success: false, error: error.message };

  const result = (data || {}) as { already_completed?: boolean };
  if (!result.already_completed && hikerUserId) {
    await notifyUser(hikerUserId, {
      category: 'booking',
      title: 'Hike completed',
      body: `Your Mt. Kalisungan hike has been completed${guideName ? ` with guide ${guideName}` : ''}. Your final receipt is ready to review.`,
      link: '/hiker',
    }).catch(() => undefined);
  }

  return { success: true, alreadyCompleted: Boolean(result.already_completed) };
}

export function completionNotes(
  notes: string | null | undefined,
  completedBy: string,
  payment: { status: 'paid' | 'partial' | 'unpaid'; method: string; amountPaid: number; settledAt?: string },
): string {
  const meta = parseMeta(notes);
  return encodeMeta({
    ...meta,
    groupPhase: 'completed',
    hikeCompletedAt: meta.hikeCompletedAt || new Date().toISOString(),
    hikeCompletedBy: meta.hikeCompletedBy || completedBy,
    guideReviewRequestedAt: meta.guideReviewRequestedAt || new Date().toISOString(),
    guideStatus: 'completed',
    paymentStatus: payment.status,
    paymentMethod: payment.method as never,
    amountPaid: payment.amountPaid,
    ...(payment.settledAt ? { paymentSettledAt: payment.settledAt } : {}),
  });
}
