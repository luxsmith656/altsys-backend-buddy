import { describe, expect, it } from 'vitest';
import { MDRRMO_CONSENT_VERSION, toMDRRMOBookingRecord } from '@/lib/mdrrmo';

describe('MDRRMO emergency directory', () => {
  it('keeps only emergency-response fields and parses booking metadata', () => {
    const record = toMDRRMOBookingRecord({
      id: 'booking-1',
      location_id: 'location-1',
      location_name: 'Lamot 1',
      booking_date: '2026-08-31',
      group_size: 3,
      notes: JSON.stringify({
        fullName: 'Ana Santos',
        phoneNumber: '09170000001',
        age: '31',
        sex: 'female',
        medicalNotes: 'Asthma',
        emailAddress: 'private@example.com',
        userNotes: 'private booking note',
        companionDetails: [{ name: 'Companion', age: '30' }],
      }),
    });

    expect(record).toEqual({
      bookingId: 'booking-1',
      locationId: 'location-1',
      locationName: 'Lamot 1',
      bookingDate: '2026-08-31',
      groupSize: 3,
      leadName: 'Ana Santos',
      contactNumber: '09170000001',
      age: '31',
      sex: 'female',
      medicalNotes: 'Asthma',
    });
    expect(JSON.stringify(record)).not.toContain('private@example.com');
    expect(JSON.stringify(record)).not.toContain('private booking note');
  });

  it('exposes a versioned consent requirement', () => {
    expect(MDRRMO_CONSENT_VERSION).toMatch(/^v\d+$/);
  });
});
