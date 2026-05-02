export type AppRole = 'admin' | 'ranger' | 'hiker' | 'guide' | 'super_admin';
export type BookingStatus = 'pending' | 'confirmed' | 'cancelled' | 'adjustment_pending';

/** Companion with full demographic details */
export interface CompanionDetail {
  name: string;
  age?: string;
  sex?: 'male' | 'female' | 'prefer_not_to_say';
  nationality?: string;
  city?: string; // PH city/municipality
}

/** Structured data stored as JSON in the bookings.notes field */
export interface BookingMeta {
  userNotes?: string;
  assignedGuide?: string;       // Guide name assigned by admin
  adjustedDate?: string;        // Proposed new date (yyyy-MM-dd) from admin
  adjustedTime?: string;        // e.g. "07:00 AM"
  guidePhone?: string;
  fullName?: string;
  age?: string;
  nationality?: string;
  emailAddress?: string;
  phoneNumber?: string;
  province?: string;
  city?: string;
  companions?: string[];
  companionDetails?: CompanionDetail[]; // Rich companion info
  medicalNotes?: string;
  // Hiker profile additions
  sex?: 'male' | 'female' | 'prefer_not_to_say';
  hasMinors?: boolean;
  minorCount?: number;
  preferredGuide?: string;
  hikeType?: string;
  hikeTime?: string;
  // Payment screenshot (Firebase URL)
  paymentScreenshotUrl?: string;
  paymentScreenshotPath?: string; // Firebase storage path (for deletion)
  // Payment tracking
  paymentStatus?: 'unpaid' | 'partial' | 'paid';
  paymentMethod?: 'onsite' | 'gcash' | 'bank_transfer';
  amountPaid?: number;
  transactionId?: string;
  entryFee?: number;
  guideFee?: number;
  envFee?: number;
  totalFee?: number;
  actualGroupSize?: number;
  refundAmount?: number;
  refundReason?: string;
  // Onsite check-in
  onsiteStartConfirmed?: boolean;
  onsiteStartTime?: string;
  hikerSessionId?: string;
}

export interface Profile {
  id: string;
  user_id: string;
  full_name: string;
  phone: string;
  emergency_contact: string;
  avatar_url: string;
  created_at: string;
  updated_at: string;
}

export interface UserRole {
  id: string;
  user_id: string;
  role: AppRole;
}

export interface TrailZone {
  id: string;
  name: string;
  description: string;
  coordinates_json: { lat: number; lng: number }[];
  status: string;
  max_capacity: number;
  difficulty: string;
  elevation_meters: number;
  created_at: string;
}

export interface Booking {
  id: string;
  user_id: string;
  booking_date: string;
  group_size: number;
  status: string;
  qr_code_data: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  notes: string;
  created_at: string;
}

export interface HikerSession {
  id: string;
  user_id: string;
  booking_id: string | null;
  trail_zone_id: string | null;
  start_time: string;
  end_time: string | null;
  status: string;
  total_distance_km: number;
  created_at: string;
}

export interface HikerLocation {
  id: string;
  session_id: string;
  latitude: number;
  longitude: number;
  altitude: number;
  timestamp: string;
}

export interface TrailReport {
  id: string;
  ranger_id: string;
  zone_id: string;
  condition: string;
  description: string;
  created_at: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface DailyCapacity {
  id: string;
  date: string;
  max_capacity: number;
  current_count: number;
}
