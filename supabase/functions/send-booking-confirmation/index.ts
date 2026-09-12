import { createClient } from '@supabase/supabase-js';
import { bookingConfirmationHandler, canSendBookingEmail, createBookingEmailStore } from './handler.ts';

const env = (name: string) => (Deno.env.get(name) ?? '').trim();
const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
Deno.serve(bookingConfirmationHandler({
  apiKey: env('RESENDAPI') || env('RESEND_API_KEY'),
  from: env('RESEND_FROM_EMAIL'),
  workerSecret: env('BOOKING_EMAIL_WORKER_SECRET'),
  store: createBookingEmailStore(db), fetcher: fetch,
  async userForToken(token) {
    const { data, error } = await db.auth.getUser(token);
    return error ? null : data.user?.id ?? null;
  },
  authorize: (userId, bookingId) => canSendBookingEmail(db, userId, bookingId),
  async dueIds() {
    const { data, error } = await db.from('booking_confirmation_emails').select('booking_id,bookings!inner(status)').eq('bookings.status', 'confirmed')
      .in('status', ['pending', 'processing']).lte('next_attempt_at', new Date().toISOString())
      .or(`lease_until.is.null,lease_until.lt.${new Date().toISOString()}`).order('next_attempt_at').limit(5);
    if (error) throw error;
    return (data ?? []).map(row => row.booking_id);
  },
}));
