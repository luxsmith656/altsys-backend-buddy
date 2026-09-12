import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';

export type BookingEmailResult =
  | { success: true; status: 'sent' | 'already_sent' }
  | { success: false; code: string; error: string };
const resultSchema = z.discriminatedUnion('success', [
  z.object({ success: z.literal(true), status: z.enum(['sent', 'already_sent']) }),
  z.object({ success: z.literal(false), code: z.string(), error: z.string().min(1) }),
]);
const pending = new Map<string, Promise<BookingEmailResult>>();

async function invokeConfirmation(id: string): Promise<BookingEmailResult> {
  try {
    const { data, error } = await supabase.functions.invoke('send-booking-confirmation', { body: { bookingId: id } });
    let response: unknown = data;
    if (error) {
      // Non-2xx function responses are carried on the SDK error's Response.
      if ('context' in error && error.context instanceof Response) response = await error.context.clone().json().catch(() => null);
      else return { success: false, code: 'unavailable', error: 'Booking email service could not be reached. Check the deployed function and email queue.' };
    }
    const parsed = resultSchema.safeParse(response);
    if (!parsed.success) return { success: false, code: 'invalid_response', error: 'Booking email delivery was not confirmed by the server.' };
    return parsed.data as BookingEmailResult;
  } catch {
    return { success: false, code: 'unavailable', error: 'Booking email delivery is unconfirmed. Check the email queue before retrying.' };
  }
}

/** The database queues confirmation; this authenticated call expedites it. */
export async function confirmReservation({ id }: { id: string }): Promise<BookingEmailResult> {
  const existing = pending.get(id);
  if (existing) return existing;
  const request = invokeConfirmation(id);
  pending.set(id, request);
  try { return await request; }
  finally { pending.delete(id); }
}
