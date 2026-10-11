import { supabase } from '@/integrations/supabase/client';
import { parseStoredHikeTime, parseStoredHikeType, timeToMinutes } from '@/lib/bookingCapacity';

type AvailabilityInput = {
  locationId: string;
  bookingDate: string;
  hikeTime?: string | null;
  hikeType?: string | null;
  excludeBookingId?: string | null;
};

type BookingRow = { id: string; booking_date: string; status: string | null; notes: string | null };

const HOLDING_STATUSES = new Set(['pending', 'confirmed', 'accepted', 'active', 'adjustment_pending', 'approved', 'started']);

function rangeFor(date: string, time: string | null | undefined, type: string | null | undefined): [number, number] {
  const start = time ? timeToMinutes(time) : null;
  const startMinutes = start ?? 0;
  const duration = type?.toLowerCase() === 'overnight' ? 20 * 60 : time ? 8 * 60 : 24 * 60;
  const day = Date.parse(`${date}T00:00:00Z`);
  return [day + startMinutes * 60_000, day + (startMinutes + duration) * 60_000];
}

function rangesOverlap(a: [number, number], b: [number, number]) {
  return a[0] < b[1] && b[0] < a[1];
}

async function localBusyGuideIds(input: AvailabilityInput): Promise<Set<string>> {
  const { data: bookings, error: bookingError } = await supabase
    .from('bookings')
    .select('id, booking_date, status, notes')
    .eq('location_id', input.locationId)
    .eq('booking_date', input.bookingDate)
    .not('status', 'in', '(cancelled,declined,completed)');
  if (bookingError) throw bookingError;

  const relevant = (bookings ?? []).filter((booking) =>
    booking.id !== input.excludeBookingId && HOLDING_STATUSES.has(String(booking.status ?? 'pending'))
      && rangesOverlap(
        rangeFor(input.bookingDate, input.hikeTime, input.hikeType),
        rangeFor(booking.booking_date, parseStoredHikeTime(booking.notes), parseStoredHikeType(booking.notes)),
      ),
  );
  if (relevant.length === 0) return new Set();

  const { data: assignments, error: assignmentError } = await supabase
    .from('booking_assignments' as any)
    .select('guide_id, booking_id, status')
    .in('booking_id', relevant.map((booking) => booking.id))
    .in('status', ['pending', 'accepted']);
  if (assignmentError) throw assignmentError;
  return new Set((assignments ?? []).map((assignment: any) => assignment.guide_id).filter(Boolean));
}

/**
 * The RPC is authoritative after migration. The small read fallback keeps the
 * UI usable while a hosted project is waiting for the migration to be applied;
 * it still scopes every query to the requested trailhead and time window.
 */
export async function getBusyGuideIdsForSlot(input: AvailabilityInput): Promise<Set<string>> {
  const { data, error } = await (supabase.rpc as any)('admin_available_guide_ids_for_slot', {
    p_location_id: input.locationId,
    p_booking_date: input.bookingDate,
    p_hike_time: input.hikeTime ?? null,
    p_hike_type: input.hikeType ?? null,
    p_exclude_booking_id: input.excludeBookingId ?? null,
  });
  if (!error && Array.isArray(data)) {
    const available = new Set(data.filter((id): id is string => typeof id === 'string'));
    const { data: scopedGuides, error: guideError } = await supabase
      .from('guides')
      .select('id')
      .eq('location_id', input.locationId)
      .eq('is_active', true);
    if (guideError) throw guideError;
    return new Set((scopedGuides ?? []).map((guide: any) => guide.id).filter((id: string) => !available.has(id)));
  }
  if (error && !['PGRST202', '42883'].includes(String(error.code ?? ''))) throw error;
  return localBusyGuideIds(input);
}
