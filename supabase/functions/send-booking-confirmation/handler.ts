import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { bookingSchema, confirmationMeta, dispatchBookingEmail, type BookingEmailStore, type EmailJob } from '../_shared/booking-email.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const bodySchema = z.object({ bookingId: z.string().uuid() }).strict();

export async function canSendBookingEmail(db: SupabaseClient, userId: string, bookingId: string) {
  const { data: booking, error } = await db.from('bookings').select('user_id,location_id').eq('id', bookingId).maybeSingle();
  if (error) throw error;
  if (!booking) return false;
  if (booking.user_id === userId) return true;
  const { data: roles, error: roleError } = await db.from('user_roles').select('role').eq('user_id', userId);
  if (roleError) throw roleError;
  if (roles?.some(row => row.role === 'super_admin')) return true;
  if (roles?.some(row => row.role === 'admin')) {
    const { data, error } = await db.from('user_locations').select('location_id').eq('user_id', userId).eq('location_id', booking.location_id).maybeSingle();
    if (error) throw error;
    if (data) return true;
  }
  if (roles?.some(row => row.role === 'guide')) {
    const { data: guide, error } = await db.from('guides').select('id').eq('user_id', userId).maybeSingle();
    if (error) throw error;
    if (!guide) return false;
    const { data: assignments, error: assignmentError } = await db.from('booking_assignments').select('id').eq('booking_id', bookingId).eq('guide_id', guide.id).eq('status', 'accepted');
    if (assignmentError) throw assignmentError;
    return Boolean(assignments?.length);
  }
  return false;
}

export function createBookingEmailStore(db: SupabaseClient): BookingEmailStore {
  return {
    async claim(id) {
      const { data, error } = await db.rpc('claim_booking_confirmation_email', { _booking_id: id });
      if (error) throw error;
      return (data?.[0] ?? null) as EmailJob | null;
    },
    async getJob(id) {
      const { data, error } = await db.from('booking_confirmation_emails').select('*').eq('booking_id', id).maybeSingle();
      if (error) throw error;
      return data as EmailJob | null;
    },
    async loadDetails(id) {
      const { data, error } = await db.from('bookings').select('id,status,notes,booking_date,group_size,location_id').eq('id', id).single();
      if (error) throw error;
      const booking = bookingSchema.parse(data);
      const meta = confirmationMeta(booking.notes);
      const { data: assignment, error: assignmentError } = await db.from('booking_assignments').select('id').eq('booking_id', id).eq('guide_id', meta.assignedGuideId).eq('status', 'accepted').limit(1).maybeSingle();
      if (assignmentError || !assignment) throw assignmentError || new Error('Guide has not accepted this booking');
      const { data: guide, error: guideError } = await db.from('guides').select('full_name,phone').eq('id', meta.assignedGuideId).single();
      if (guideError) throw guideError;
      const { data: location, error: locationError } = await db.from('locations').select('name').eq('id', booking.location_id).single();
      if (locationError) throw locationError;
      return { booking, guide, location };
    },
    async update(job, patch) {
      const { data, error } = await db.from('booking_confirmation_emails').update(patch).eq('booking_id', job.booking_id).eq('attempts', job.attempts).eq('status', 'processing').select('booking_id').single();
      if (error || !data) throw error || new Error('Email lease was lost');
    },
  };
}

export function bookingConfirmationHandler(deps: {
  apiKey: string; from: string; workerSecret: string; store: BookingEmailStore; fetcher: typeof fetch;
  userForToken: (token: string) => Promise<string | null>;
  authorize: (userId: string, bookingId: string) => Promise<boolean>;
  dueIds: () => Promise<string[]>;
}) {
  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
    if (req.method !== 'POST') return json({ success: false, error: 'Method not allowed' }, 405);
    try {
      if (Number(req.headers.get('content-length') ?? 0) > 2048) return json({ success: false, error: 'Request too large' }, 413);
      const raw = await req.text();
      if (raw.length > 2048) return json({ success: false, error: 'Request too large' }, 413);
      const body: unknown = JSON.parse(raw);
      const requestedWorker = req.headers.get('x-booking-email-worker');
      if (requestedWorker) {
        if (!deps.workerSecret || deps.workerSecret.length < 32 || !await sameSecret(requestedWorker, deps.workerSecret)) return json({ success: false, error: 'Unauthorized worker' }, 401);
        if (!z.object({ runQueue: z.literal(true) }).strict().safeParse(body).success) return json({ success: false, error: 'Invalid worker request' }, 400);
        const ids = (await deps.dueIds()).slice(0, 5);
        const results = [];
        for (const id of ids) results.push(await dispatchBookingEmail(id, deps));
        return json({ success: results.every(result => result.success), processed: results.length, results });
      }
      const token = req.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];
      if (!token) return json({ success: false, error: 'Sign in to request a booking email' }, 401);
      const userId = await deps.userForToken(token);
      if (!userId) return json({ success: false, error: 'Session is invalid or expired' }, 401);
      const parsed = bodySchema.safeParse(body);
      if (!parsed.success) return json({ success: false, error: 'A valid bookingId is required; recipient and content are server-managed' }, 400);
      if (!await deps.authorize(userId, parsed.data.bookingId)) return json({ success: false, error: 'This booking is outside your account or assigned location' }, 403);
      const result = await dispatchBookingEmail(parsed.data.bookingId, deps);
      const status = result.success === true ? 200 : result.code === 'queued' ? 202 : result.code === 'not_configured' ? 503 : result.code === 'storage_failed' ? 500 : result.code === 'delivery_failed' ? 502 : 422;
      return json(result, status);
    } catch (error) {
      return json({ success: false, error: error instanceof SyntaxError ? 'Invalid JSON' : 'Booking email service is unavailable' }, error instanceof SyntaxError ? 400 : 500);
    }
  };
}
async function sameSecret(a: string, b: string) {
  const bytes = new TextEncoder();
  const first = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes.encode(a)));
  const second = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes.encode(b)));
  let difference = 0;
  for (let i = 0; i < first.length; i++) difference |= first[i] ^ second[i];
  return difference === 0;
}
