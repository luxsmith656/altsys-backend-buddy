import { parseMeta } from '@/lib/bookingMeta';

export const MDRRMO_CONSENT_VERSION = 'v1';

export const MDRRMO_CONSENT_TEXT =
  'I agree to use emergency directory information only for authorized rescue and emergency response. I will keep it confidential, will not share it, and will follow applicable privacy, safety, and data-protection laws.';

export interface MDRRMOPerson {
  name: string;
  age?: string | number | null;
  sex?: string | null;
  medicalNotes?: string | null;
}

export interface MDRRMOBookingRecord {
  bookingId: string;
  locationId: string | null;
  locationName: string;
  bookingDate: string;
  groupSize: number;
  leadName: string;
  contactNumber: string;
  age: string;
  sex: string;
  medicalNotes: string;
  people?: MDRRMOPerson[];
}

interface BookingDirectoryRow {
  id: string;
  location_id?: string | null;
  location_name?: string | null;
  booking_date: string;
  group_size?: number | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  notes?: string | null;
}

export function toMDRRMOBookingRecord(row: BookingDirectoryRow): MDRRMOBookingRecord {
  const meta = parseMeta(row.notes);
  return {
    bookingId: row.id,
    locationId: row.location_id ?? null,
    locationName: row.location_name ?? 'Unassigned location',
    bookingDate: row.booking_date,
    groupSize: Number(row.group_size ?? 1),
    leadName: meta.fullName || row.emergency_contact_name || 'Unnamed hiker',
    contactNumber: meta.phoneNumber || row.emergency_contact_phone || 'Not provided',
    age: meta.age || 'Not provided',
    sex: meta.sex || 'Not provided',
    medicalNotes: meta.medicalNotes || 'None recorded',
  };
}

export function hasMDRRMOConsent(profile: {
  mdrrmo_consent_at?: string | null;
  mdrrmo_consent_version?: string | null;
} | null | undefined): boolean {
  return Boolean(
    profile?.mdrrmo_consent_at && profile.mdrrmo_consent_version === MDRRMO_CONSENT_VERSION,
  );
}
