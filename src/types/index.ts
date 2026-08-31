export type AppRole = 'admin' | 'ranger' | 'hiker' | 'guide' | 'super_admin' | 'mdrrmo';
export type BookingStatus = 'pending' | 'confirmed' | 'cancelled' | 'adjustment_pending';
export type BookingPaymentMethod = 'onsite' | 'gcash' | 'bank_transfer' | 'cash' | 'online';

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
  assignedGuideId?: string;
  assignedAt?: string;
  guideAcceptedAt?: string;
  guideChangeReason?: string;
  guideDeclineReason?: string;
  guideChangedAt?: string;
  previousGuide?: string | null;
  previousGuideId?: string | null;
  bookingChange?: {
    changedAt: string;
    reason: string;
    before: { groupSize: number; leadName: string; companions: string[] };
    after: { groupSize: number; leadName: string; companions: string[] };
  };
  bookingChangeAcknowledgedAt?: string;
  assignedTrailZoneId?: string; // Official route assigned by admin or auto-assigned
  assignedTrailName?: string;
  assignedTrail?: string;
  assignedTrailAuto?: boolean;
  groupSize?: number;
  guideStatus?: 'pending' | 'accepted' | 'declined' | 'reassigned_pending' | 'completed' | string;
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
  paymentMethod?: BookingPaymentMethod;
  paymentReference?: string;
  amountPaid?: number;
  cashTendered?: number;
  changeReturned?: number;
  paymentSettledAt?: string;
  paymentSettledBy?: string;
  transactionId?: string;
  entryFee?: number;
  guideFee?: number;
  envFee?: number;
  peakExtensionFee?: number;
  totalFee?: number;
  actualGroupSize?: number;
  refundAmount?: number;
  refundReason?: string;
  // Onsite check-in
  onsiteStartConfirmed?: boolean;
  onsiteStartTime?: string;
  hikerSessionId?: string;
  /** Trailhead verification captured before staff authorise live tracking. */
  checkinHeadcount?: number;
  checkinVerifiedAt?: string;
  /** One group lifecycle shared by its hiker and guide sessions. */
  groupPhase?: 'ascent' | 'peak' | 'descent' | 'completed';
  peakReachedAt?: string;
  peakDeadlineAt?: string;
  peakExtensionHours?: number;
  descentStartedAt?: string;
  hikeCompletedAt?: string;
  hikeCompletedBy?: string;
  isWalkIn?: boolean;
  walkInRegisteredBy?: string;
  walkInRegisteredAt?: string;
  emergencyHorseCount?: number;
  emergencyHorseFee?: number;
  priceAdjustments?: {
    changedAt: string;
    changedBy: string;
    changedByName?: string;
    previousAmount: number;
    newAmount: number;
    reason: string;
    breakdown?: {
      entryFee: number;
      envFee: number;
      guideFee: number;
      peakExtensionFee?: number;
      emergencyHorseFee?: number;
      customAdjustment?: number;
    };
  }[];
  /** Stored with the booking so cancellation is auditable. */
  cancellationReason?: string;
  cancellationConfirmedAt?: string;
  /** Lets the booking owner be prompted to rate the guide after closeout. */
  guideReviewRequestedAt?: string;
  guideReviewRating?: number;
  guideReviewComment?: string;
  guideReviewSource?: 'hiker' | 'admin';
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
  day_max_capacity?: number;
  night_max_capacity?: number;
  day_current_count?: number;
  night_current_count?: number;
}

export interface GuestHikerSession {
  guestSessionId: string;
  bookingId: string;
  guestName: string;
  leadHikerName: string;
  hikeDate: string;
  assignedGuide?: string;
  assignedTrail?: string;
  joinedAt: string;
}

