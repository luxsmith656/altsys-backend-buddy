import type { BookingMeta } from '@/types';
import { HORSE_HIGH_STATION_FEE, HORSE_EMERGENCY_SERVICE_FEE } from './payments';
import { parseMeta } from './bookingMeta';
import { supabase } from '@/integrations/supabase/client';
import { notifyUser } from './firestoreNotifications';
import { formatPeso } from './payments';

export const HORSE_HELP_OPTIONS = [
  { id: 'station-5-3', label: 'Station 5–3', fee: HORSE_HIGH_STATION_FEE },
  { id: 'station-2-1', label: 'Station 2–1', fee: HORSE_EMERGENCY_SERVICE_FEE },
] as const;

export type HorseHelpStation = (typeof HORSE_HELP_OPTIONS)[number]['id'];

export function getHorseHelpOption(station: string | null | undefined) {
  return HORSE_HELP_OPTIONS.find((option) => option.id === station);
}

export function addHorseHelpRequest(
  meta: BookingMeta,
  station: string,
  requestedBy: string,
  requestedAt: string,
): BookingMeta {
  const option = getHorseHelpOption(station);
  if (!option) throw new Error('Choose a valid horse-help station.');
  return {
    ...meta,
    horseHelpRequests: [
      ...(meta.horseHelpRequests ?? []),
      {
        station: option.id,
        stationLabel: option.label,
        fee: option.fee,
        requestedAt,
        requestedBy,
        status: 'requested',
      },
    ],
  };
}

export async function requestHorseHelpForBooking(params: {
  bookingId: string;
  station: HorseHelpStation;
  guideId: string;
  guideName: string;
  guideUserId: string;
  locationId: string | null;
}) {
  const option = getHorseHelpOption(params.station);
  if (!option) throw new Error('Choose a valid horse-help station.');

  const { data: booking, error: readError } = await supabase
    .from('bookings')
    .select('id,user_id,notes,status,location_id')
    .eq('id', params.bookingId)
    .single();
  if (readError || !booking) throw new Error(readError?.message || 'Booking not found.');
  if (['cancelled', 'completed'].includes(String(booking.status))) throw new Error('This hike is already closed.');

  const meta = parseMeta(booking.notes);
  const requests = meta.horseHelpRequests ?? [];
  if (requests.some((request) => request.station === option.id && request.status === 'requested')) {
    throw new Error(`${option.label} horse help is already requested.`);
  }
  const updatedMeta = addHorseHelpRequest(meta, option.id, params.guideId, new Date().toISOString());
  const additionalPaymentDue = requests
    .filter((request) => request.status === 'requested')
    .reduce((sum, request) => sum + Number(request.fee || 0), option.fee);
  updatedMeta.additionalPaymentStatus = 'pending';
  updatedMeta.additionalPaymentDue = additionalPaymentDue;

  const update = supabase.from('bookings').update({ notes: JSON.stringify(updatedMeta) } as any)
    .eq('id', params.bookingId).eq('status', booking.status);
  const { error: updateError } = booking.notes == null
    ? await update.is('notes', null)
    : await update.eq('notes', booking.notes);
  if (updateError) throw new Error(`Could not save horse help request: ${updateError.message}`);

  await supabase.from('booking_messages' as any).insert({
    booking_id: params.bookingId,
    sender_id: params.guideUserId,
    sender_role: 'guide',
    recipient_role: 'admin',
    kind: 'horse_help_request',
    content: `Horse help requested from ${option.label}. Additional payment due: ${formatPeso(option.fee)}.`,
  } as any);
  if (booking.user_id) {
    await notifyUser(booking.user_id, {
      title: 'Horse help requested',
      body: `${params.guideName} requested horse help from ${option.label}. Added fee: ${formatPeso(option.fee)}.`,
      category: 'alert',
    }).catch(() => null);
  }
  const { data: admins } = await supabase.from('user_locations').select('user_id').eq('location_id', params.locationId);
  const scopedIds = [...new Set(((admins as any[]) || []).map((row) => row.user_id).filter(Boolean))];
  const { data: adminRoles } = scopedIds.length
    ? await supabase.from('user_roles').select('user_id,role').in('user_id', scopedIds).in('role', ['admin', 'super_admin', 'mdrrmo'])
    : { data: [] };
  const adminIds = [...new Set(((adminRoles as any[]) || []).map((row) => row.user_id).filter(Boolean))];
  await Promise.all(adminIds.map((id) => notifyUser(id, {
    title: 'Horse help payment request',
    body: `${params.guideName} requested ${option.label}. Collect ${formatPeso(option.fee)} from the group.`,
    category: 'alert',
    link: '/admin?tab=live-map',
  }).catch(() => null)));
  return updatedMeta;
}
