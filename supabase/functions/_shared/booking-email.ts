import { z } from 'zod';
import { bookingEmailTemplate, bookingEmailLogo } from './booking-email-template.ts';
import { sendEmailJs, type EmailJsConfig } from './emailjs.ts';

const text = z.string().trim().min(1);
const metaSchema = z.object({
  fullName: text, emailAddress: text.email().transform(value => value.toLowerCase()),
  assignedGuideId: text, guideStatus: z.literal('accepted'),
  hikeType: z.enum(['morning', 'day', 'night', 'overnight']), hikeTime: text,
  adjustedDate: z.string().optional(), adjustedTime: z.string().optional(), bookingChangeAcknowledgedAt: z.string().optional(),
  paymentStatus: z.enum(['unpaid', 'partial', 'paid']).default('unpaid'),
  assignedTrailName: z.string().optional(), assignedTrail: z.string().optional(),
});
export const bookingSchema = z.object({
  id: text, status: z.literal('confirmed'), notes: text, booking_date: text,
  group_size: z.number().int().positive(), location_id: text, qr_code_data: text,
});
export type ConfirmationBooking = z.infer<typeof bookingSchema>;
export function confirmationMeta(notes: string) { return metaSchema.parse(JSON.parse(notes)); }
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char);

export function makeBookingEmail(input: { booking: unknown; guide: unknown; location: unknown; from?: string }) {
  const booking = bookingSchema.parse(input.booking);
  const meta = confirmationMeta(booking.notes);
  const guide = z.object({ full_name: text, phone: text.regex(/^[+\d ()-]{7,30}$/) }).parse(input.guide);
  const location = z.object({ name: text }).parse(input.location);
  const from = input.from ? text.refine(value => !/[\r\n]/.test(value) && /@[^<>\s]+\.[^<>\s]+>?$/.test(value)).parse(input.from) : '';
  const rawTime = meta.bookingChangeAcknowledgedAt && meta.adjustedDate === booking.booking_date && meta.adjustedTime ? meta.adjustedTime : meta.hikeTime;
  const match = /^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i.exec(rawTime);
  const hour = Number(match?.[1]); const minute = Number(match?.[2]); const period = match?.[3]?.toUpperCase();
  if (!match || minute > 59 || (period ? hour < 1 || hour > 12 : hour > 23)) throw new Error('Invalid confirmed start time');
  const hour24 = period ? hour % 12 + (period === 'PM' ? 12 : 0) : hour;
  const hikeTime = `${String(hour24 % 12 || 12).padStart(2, '0')}:${match[2]} ${hour24 < 12 ? 'AM' : 'PM'} PHT (UTC+8)`;
  const date = new Date(`${booking.booking_date}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(booking.booking_date) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== booking.booking_date) throw new Error('Invalid confirmed date');
  const values: Record<string, string> = {
    to_name: meta.fullName, booking_reference: booking.id, guide_name: guide.full_name, guide_contact: guide.phone,
    hike_date: new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', year: 'numeric', month: 'long', day: 'numeric' }).format(date),
    hike_time: hikeTime, jump_off: location.name, pax: String(booking.group_size),
    route: meta.assignedTrailName || meta.assignedTrail || location.name,
    payment_status: { unpaid: 'Unpaid', partial: 'Partially paid', paid: 'Paid' }[meta.paymentStatus],
    hike_type: { morning: 'Morning', day: 'Morning', night: 'Night', overnight: 'Overnight' }[meta.hikeType],
    reminder: 'Please call your assigned guide the day before your hike to confirm your meeting arrangements.',
  };
  const qrValue = booking.qr_code_data;
  values.qr_code_url = `https://quickchart.io/qr?text=${encodeURIComponent(qrValue)}&size=220&margin=2`;
  const templateParams = {
    ...values,
    // The existing EmailJS reservation template uses these legacy names.
    to_email: meta.emailAddress,
    visitor_name: values.to_name,
    booking_id: values.booking_reference,
    trail_name: values.route,
    checkin_time: values.hike_time,
    name: 'Mt. Kalisungan System',
    email: meta.emailAddress,
  };
  return {
    from, to: [meta.emailAddress], subject: `Your Mt. Kalisungan hike is confirmed - ${values.hike_date}`,
    html: bookingEmailTemplate.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
      if (!(key in values)) throw new Error(`Unknown email template field: ${key}`);
      return escapeHtml(values[key]);
    }),
    text: `Hi ${meta.fullName}, your ${values.hike_type} hike is confirmed.\nDate: ${values.hike_date}\nStart: ${hikeTime}\nJump-off: ${location.name}\nRoute: ${values.route}\nGroup: ${booking.group_size} hikers\nGuide: ${guide.full_name}\nGuide contact: ${guide.phone}\nPayment status: ${values.payment_status}\n${values.reminder}\nBooking reference: ${booking.id}\nThis is a booking confirmation, not a payment receipt.`,
    attachments: [{ filename: 'kalisungan-logo.png', content: bookingEmailLogo, content_id: 'kalisungan-logo', content_type: 'image/png' }],
    templateParams,
  };
}

export type EmailPayload = ReturnType<typeof makeBookingEmail>;
export interface EmailJob {
  booking_id: string; status: string; attempts: number; payload: EmailPayload | null;
  provider_id: string | null; first_attempt_at: string | null;
}
export interface BookingEmailStore {
  claim(id: string): Promise<EmailJob | null>;
  getJob(id: string): Promise<EmailJob | null>;
  loadDetails(id: string): Promise<{ booking: unknown; guide: unknown; location: unknown }>;
  update(job: EmailJob, patch: Record<string, unknown>): Promise<void>;
}
export type SendResult = { success: true; status: 'sent' | 'already_sent' } | { success: false; code: string; error: string };

export async function dispatchBookingEmail(id: string, deps: {
  store: BookingEmailStore;
  apiKey: string;
  from: string;
  fetcher: typeof fetch;
  emailJs?: EmailJsConfig;
}): Promise<SendResult> {
  const emailJsConfigured = Boolean(deps.emailJs?.serviceId && deps.emailJs.templateId && deps.emailJs.publicKey);
  const resendConfigured = Boolean(deps.apiKey && deps.from);
  if (!emailJsConfigured && !resendConfigured) return { success: false, code: 'not_configured', error: 'Booking email sender is not configured. Contact the administrator.' };
  const { store } = deps;
  let job: EmailJob | null = null;
  try {
    job = await store.claim(id);
    if (!job) {
      const current = await store.getJob(id);
      if (current?.status === 'sent') return { success: true, status: 'already_sent' };
      if (!current) return { success: false, code: 'not_queued', error: 'No confirmation is queued for this booking.' };
      if (current.status === 'needs_review') return { success: false, code: 'needs_review', error: 'Email delivery needs an administrator to check Resend before retrying.' };
      return { success: false, code: 'queued', error: 'Confirmation email is waiting for delivery or retry.' };
    }
    // Recheck status and actual guide assignment even for retries. The message
    // snapshot stays immutable once sent to the provider for idempotent retries.
    let details;
    try { details = await store.loadDetails(id); }
    catch {
      await store.update(job, { status: 'needs_review', last_error: 'Confirmed booking or accepted guide details are unavailable.', lease_until: null });
      return { success: false, code: 'missing_details', error: 'Email requires a confirmed booking and an accepted guide with contact details.' };
    }
    let payload = job.payload;
    let currentPayload: EmailPayload;
    try { currentPayload = makeBookingEmail({ ...details, from: resendConfigured ? deps.from : undefined }); }
    catch {
      await store.update(job, { status: 'needs_review', last_error: 'Invalid confirmed schedule, recipient or guide contact.', lease_until: null });
      return { success: false, code: 'missing_details', error: 'Confirmation email has incomplete schedule, recipient or guide contact details.' };
    }
    if (payload && (payload.text !== currentPayload.text || JSON.stringify(payload.to) !== JSON.stringify(currentPayload.to))) {
      await store.update(job, { status: 'needs_review', lease_until: null, last_error: 'Booking details changed after an email attempt. Check provider delivery before sending an updated confirmation.' });
      return { success: false, code: 'details_changed', error: 'Booking details changed while email delivery was pending. An administrator must review the confirmation.' };
    }
    if (!payload) {
      payload = currentPayload;
      await store.update(job, { payload });
    }
    let providerId: string;
    try {
      providerId = emailJsConfigured && deps.emailJs
        ? await sendEmailJs(deps.fetcher, deps.emailJs, payload.templateParams)
        : await sendResend(deps.fetcher, deps.apiKey, payload, id);
    } catch (error) {
      const status = typeof (error as { status?: unknown })?.status === 'number' ? (error as { status: number }).status : null;
      const providerName = typeof (error as { providerName?: unknown })?.providerName === 'string' ? (error as { providerName: string }).providerName : '';
      // EmailJS has no provider idempotency key. Ambiguous acceptance must not
      // be blindly retried, or the same reservation could reach the inbox twice.
      if (emailJsConfigured && (status === null || status >= 500 || status === 200)) {
        await store.update(job, { status: 'needs_review', lease_until: null, last_error: 'EmailJS acceptance is uncertain; verify provider history before retrying.' });
        return { success: false, code: 'needs_review', error: 'Email delivery is uncertain; provider history must be checked before retrying.' };
      }
      const retry = status === null || status === 429 || status >= 500 || status === 409 && providerName === 'concurrent_idempotent_requests' || status === 200;
      if (retry) {
        await queueRetry(store, job, status === null ? 'Provider timeout or network failure; delivery unconfirmed.' : `Provider response ${status}; delivery unconfirmed.`);
        return { success: false, code: 'queued', error: 'Email delivery is unconfirmed; a retry is queued.' };
      }
      await store.update(job, { status: 'needs_review', lease_until: null, last_error: `Email provider rejected the request (${status}). Check the EmailJS or Resend account configuration.` });
      return { success: false, code: 'delivery_failed', error: 'Email provider rejected the confirmation. Check the configured email service.' };
    }
    try {
      await store.update(job, { status: 'sent', provider_id: providerId, sent_at: new Date().toISOString(), lease_until: null, last_error: null });
      return { success: true, status: 'sent' };
    } catch {
      return { success: false, code: 'storage_failed', error: 'Email delivery status could not be saved. Check the email queue before retrying.' };
    }
  } catch {
    // Do not mark sent if persistence failed. A leased job is retried with the
    // same provider key; no browser success toast hides this uncertainty.
    return { success: false, code: 'storage_failed', error: 'Email delivery status could not be saved. Check the email queue before retrying.' };
  }
}

async function sendResend(fetcher: typeof fetch, apiKey: string, payload: EmailPayload, id: string) {
  const response = await fetcher('https://api.resend.com/emails', {
    method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': `booking-confirmation/${id}` },
    body: JSON.stringify(payload), signal: AbortSignal.timeout(15000),
  });
  const result = await response.json().catch(() => null) as { id?: unknown; name?: unknown } | null;
  if (!response.ok || typeof result?.id !== 'string' || !result.id) {
    const error = new Error(`Resend rejected the request (${response.status})`);
    Object.assign(error, { status: response.status, providerName: result?.name });
    throw error;
  }
  return result.id;
}
async function queueRetry(store: BookingEmailStore, job: EmailJob, message: string) {
  const delay = Math.min(6 * 60 * 60, 60 * 3 ** Math.min(job.attempts, 6));
  await store.update(job, { status: 'pending', lease_until: null, last_error: message, next_attempt_at: new Date(Date.now() + delay * 1000).toISOString() });
}
