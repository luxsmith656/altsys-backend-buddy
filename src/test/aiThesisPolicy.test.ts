import { describe, expect, it } from 'vitest';
import {
  classifyAssistantIntent,
  isGuidePiiRequest,
  isMutationRequest,
  isDateAtLeastTomorrow,
  missingReservationFields,
  parseWeatherResponse,
  projectGuideBooking,
  unavailableFallback,
  validAssistantQuery,
} from '../../supabase/functions/_shared/ai-thesis-policy';

describe('thesis assistant policy cases', () => {
  it('validates ordinary, empty, and oversized queries', () => {
    expect(validAssistantQuery('weather tomorrow')).toBe(true);
    expect(validAssistantQuery('')).toBe(false);
    expect(validAssistantQuery('x'.repeat(4001))).toBe(false);
  });
  it('classifies weather and reservation intents', () => {
    expect(classifyAssistantIntent('Will it rain tomorrow?')).toBe('weather');
    expect(classifyAssistantIntent('Help me book 3 hikers')).toBe('reservation');
  });
  it('requires the reservation fields needed by the booking form', () => {
    expect(missingReservationFields({ date: '2026-10-15', startTime: '06:00 AM', groupSize: 3, hikeType: 'morning' })).toEqual([]);
    expect(missingReservationFields({ groupSize: 'three' })).toEqual(['date', 'start time', 'group size', 'hike type']);
  });
  it('rejects today and past booking dates while allowing tomorrow', () => {
    expect(isDateAtLeastTomorrow('2026-10-18', '2026-10-19')).toBe(false);
    expect(isDateAtLeastTomorrow('2026-10-19', '2026-10-19')).toBe(false);
    expect(isDateAtLeastTomorrow('2026-10-20', '2026-10-19')).toBe(true);
  });
  it('refuses mutations and unrelated guide home-address requests', () => {
    expect(isMutationRequest('delete this booking')).toBe(true);
    expect(isMutationRequest('what is the trail condition?')).toBe(false);
    expect(isGuidePiiRequest('Where does the hiker live?')).toBe(true);
    expect(isGuidePiiRequest('What is our start time and group size?')).toBe(false);
  });
  it('projects only the guide-safe assigned booking fields', () => {
    expect(projectGuideBooking({ id: 'b1', user_id: 'u1', location_id: 'l1', booking_date: '2026-10-15', group_size: 3, status: 'confirmed', created_at: 'now', contact_phone: 'secret', notes: JSON.stringify({ hikeTime: '06:00 AM', phoneNumber: 'secret' }) }, { full_name: 'Hiker One', phone: 'secret' })).toEqual({
      booking_id: 'b1', user_id: 'u1', location_id: 'l1', booking_date: '2026-10-15', start_time: '06:00 AM', group_size: 3, status: 'confirmed', created_at: 'now', lead_hiker_name: 'Hiker One', lead_hiker_phone: 'secret', lead_hiker_email: null, emergency_contact: null, emergency_phone: null, safety_notes: null,
    });
  });
  it('treats malformed weather and unavailable external data honestly', () => {
    expect(parseWeatherResponse({ temperatureC: '22' })).toMatchObject({ valid: true, temperatureC: 22 });
    expect(parseWeatherResponse(null).valid).toBe(false);
    expect(unavailableFallback('weather')).toContain("won’t guess");
  });
});
