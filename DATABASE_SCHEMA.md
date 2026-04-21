# Mt. Kalisungan Trail Booking System - Database Schema Documentation

## Project Overview
This is a comprehensive trail booking and management system for Mount Kalisungan (Rizal, Philippines) with role-based access control for admins, rangers, guides, and hikers. The system integrates Supabase (PostgreSQL) for primary data management and Firebase for media storage and supplementary data.

---

## Database Architecture

### Primary Database: Supabase (PostgreSQL)
- **Type**: Relational Database (PostgreSQL)
- **Authentication**: Supabase Auth (Firebase-compatible)
- **Security**: Row Level Security (RLS) policies
- **Real-time Capabilities**: Supabase realtime subscriptions

### Secondary Storage: Firebase
- **Type**: NoSQL (Cloud Firestore)
- **Purpose**: Media storage and supplementary data
- **Collections**: Booking metadata, notifications, activity logs

---

## Core Data Models

### 1. Authentication & User Management

#### `auth.users` (Supabase Auth)
Base authentication table managed by Supabase Auth service
```sql
-- Managed by Supabase - includes standard fields:
- id (UUID)
- email (TEXT)
- encrypted_password (TEXT)
- email_confirmed_at (TIMESTAMPTZ)
- raw_user_meta_data (JSONB)
- created_at (TIMESTAMPTZ)
- updated_at (TIMESTAMPTZ)
```

#### `app_role` (ENUM Type)
```sql
CREATE TYPE public.app_role AS ENUM ('admin', 'ranger', 'hiker', 'guide');
```
**Valid Values**: admin, ranger, hiker, guide

---

### 2. User Profile Management

#### `profiles` Table
Stores user profile information linked to authentication

```sql
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  full_name TEXT NOT NULL DEFAULT '',
  phone TEXT DEFAULT '',
  emergency_contact TEXT DEFAULT '',
  avatar_url TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Fields**:
- `id`: Unique profile identifier
- `user_id`: Foreign key to auth.users (one-to-one relationship)
- `full_name`: User's full name
- `phone`: Contact phone number
- `emergency_contact`: Emergency contact information
- `avatar_url`: URL to Firebase Storage avatar image
- `created_at`: Profile creation timestamp (auto-populated)
- `updated_at`: Last update timestamp (auto-updated via trigger)

**Indexes**: `user_id` (UNIQUE)

---

#### `user_roles` Table
Maps users to their roles (many-to-many relationship)

```sql
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);
```

**Fields**:
- `id`: Unique role assignment identifier
- `user_id`: Foreign key to auth.users
- `role`: One of {admin, ranger, hiker, guide}

**Constraints**:
- Each user can have each role at most once
- When user is deleted, all role assignments are cascaded

**Default Assignment**: New users are automatically assigned the 'hiker' role via `handle_new_user()` trigger

---

### 3. Trail & Location Management

#### `trail_zones` Table
Defines trail routes, difficulty levels, and capacity information

```sql
CREATE TABLE public.trail_zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  coordinates_json JSONB NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'active',
  max_capacity INT NOT NULL DEFAULT 50,
  difficulty TEXT NOT NULL DEFAULT 'moderate',
  elevation_meters INT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Fields**:
- `id`: Unique trail zone identifier
- `name`: Trail name (e.g., "Summit Trail", "River Trail")
- `description`: Detailed trail description
- `coordinates_json`: GeoJSON array of coordinate waypoints
  ```json
  [
    {"lat": 14.4833, "lng": 121.4167},
    {"lat": 14.4845, "lng": 121.4155},
    {"lat": 14.4860, "lng": 121.4148}
  ]
  ```
- `status`: Trail status (active, restricted, closed, maintenance)
- `max_capacity`: Maximum hikers allowed simultaneously
- `difficulty`: Difficulty level (easy, moderate, hard)
- `elevation_meters`: Peak elevation in meters
- `created_at`: Record creation timestamp

**Seeded Data** (Mount Kalisungan):
1. **Summit Trail** - 622m elevation, "hard" difficulty, capacity 30
2. **River Trail** - 350m elevation, "easy" difficulty, capacity 50
3. **Ridge Trail** - 480m elevation, "moderate" difficulty, capacity 40
4. **Camping Zone A** - 280m elevation, base camp area, capacity 20
5. **Restricted Zone** - Protected wildlife area, status 'restricted', capacity 0

---

#### `hiker_locations` Table
Real-time GPS tracking for active hiking sessions

```sql
CREATE TABLE public.hiker_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES public.hiker_sessions(id) ON DELETE CASCADE NOT NULL,
  latitude NUMERIC(10,7) NOT NULL,
  longitude NUMERIC(10,7) NOT NULL,
  altitude NUMERIC(7,2) DEFAULT 0,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Fields**:
- `id`: Unique location record identifier
- `session_id`: Foreign key to hiker_sessions (CASCADE delete)
- `latitude`: GPS latitude (high precision: 10 decimals ≈ 1.1mm accuracy)
- `longitude`: GPS longitude (high precision: 10 decimals)
- `altitude`: Elevation/altitude in meters
- `timestamp`: GPS location timestamp

**Features**:
- Enabled for Supabase real-time subscriptions
- High precision numeric types for accurate tracking
- Automatic cleanup when session is deleted

---

### 3.1 GPS & Path Recording Enhancement

#### `hiker_location_raw` Table
Raw unfiltered GPS points with full sensor data for denoising and analysis

```sql
CREATE TABLE public.hiker_location_raw (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES public.hiker_sessions(id) ON DELETE CASCADE NOT NULL,
  latitude NUMERIC(10,7) NOT NULL,
  longitude NUMERIC(10,7) NOT NULL,
  altitude NUMERIC(7,2),
  accuracy_m NUMERIC(6,2),
  speed_m_s NUMERIC(6,2),
  bearing NUMERIC(6,2),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  device_info JSONB DEFAULT '{}'
);
```

**Fields**:
- `id`: Unique raw location record
- `session_id`: Foreign key to hiker_sessions
- `latitude`: GPS latitude (10 decimals ≈ 1.1mm accuracy)
- `longitude`: GPS longitude
- `altitude`: Altitude from GPS (often inaccurate, needs correction)
- `accuracy_m`: GPS accuracy reported by device (meters; lower is better)
- `speed_m_s`: Speed calculated from consecutive points
- `bearing`: Direction of travel (0-360 degrees)
- `timestamp`: When GPS point was captured
- `device_info`: JSON with device type, OS, GPS chip (for quality assessment)

**Purpose**: Raw data for quality filtering and path smoothing algorithms

---

#### `gps_quality_metrics` Table
Quality assessment for GPS data to identify and flag poor accuracy periods

```sql
CREATE TABLE public.gps_quality_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES public.hiker_sessions(id) ON DELETE CASCADE NOT NULL,
  time_window_start TIMESTAMPTZ NOT NULL,
  time_window_end TIMESTAMPTZ NOT NULL,
  avg_accuracy_m NUMERIC(6,2),
  std_dev_accuracy NUMERIC(6,2),
  points_count INT,
  points_above_50m_error INT,
  points_above_100m_error INT,
  satellite_count INT DEFAULT 0,
  signal_strength_dbm INT,
  quality_score NUMERIC(3,2),
  quality_status TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Fields**:
- `id`: Unique metric record
- `session_id`: Foreign key to hiker_sessions
- `time_window_start`: Start time of analysis window (e.g., every 5 minutes)
- `time_window_end`: End time of window
- `avg_accuracy_m`: Average GPS accuracy in window
- `std_dev_accuracy`: Standard deviation (consistency check)
- `points_count`: Number of GPS points in window
- `points_above_50m_error`: Count of inaccurate points (>50m error)
- `points_above_100m_error`: Count of very inaccurate points (>100m error)
- `satellite_count`: Number of satellites available
- `signal_strength_dbm`: Signal strength in dBm (lower = weaker)
- `quality_score`: Calculated 0.0-1.0 (1.0 = perfect GPS)
- `quality_status`: 'excellent' | 'good' | 'fair' | 'poor' | 'degraded'
- `created_at`: Calculation timestamp

**Purpose**: Monitor GPS quality to determine when satellite coverage is insufficient

---

#### `smoothed_trajectory` Table
Filtered and smoothed GPS path using Kalman filter or spline fitting

```sql
CREATE TABLE public.smoothed_trajectory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES public.hiker_sessions(id) ON DELETE CASCADE NOT NULL,
  point_index INT NOT NULL,
  latitude NUMERIC(10,7) NOT NULL,
  longitude NUMERIC(10,7) NOT NULL,
  altitude_corrected NUMERIC(7,2),
  derived_accuracy_m NUMERIC(6,2),
  speed_smoothed_m_s NUMERIC(6,2),
  bearing_smoothed NUMERIC(6,2),
  distance_from_previous_m NUMERIC(8,2),
  timestamp TIMESTAMPTZ NOT NULL,
  smoothing_method TEXT,
  filter_quality_score NUMERIC(3,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(session_id, point_index)
);
```

**Fields**:
- `id`: Unique smoothed point record
- `session_id`: Foreign key to hiker_sessions
- `point_index`: Sequence number in path (0, 1, 2, ...)
- `latitude`: Filtered latitude (noise removed)
- `longitude`: Filtered longitude
- `altitude_corrected`: Altitude corrected using DEM or previous points
- `derived_accuracy_m`: Estimated accuracy after filtering
- `speed_smoothed_m_s`: Smoothed speed (removes spikes)
- `bearing_smoothed`: Smoothed direction of travel
- `distance_from_previous_m`: Distance between this and previous point
- `timestamp`: Original GPS timestamp
- `smoothing_method`: 'kalman' | 'savitzky_golay' | 'spline' | 'moving_average'
- `filter_quality_score`: How confident we are in this smoothed point (0-1)
- `created_at`: Processing timestamp

**Purpose**: High-quality path data for display and analysis

---

#### `elevation_corrections` Table
Altitude corrections using DEM (Digital Elevation Model) and past measurements

```sql
CREATE TABLE public.elevation_corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id UUID REFERENCES public.smoothed_trajectory(id) ON DELETE CASCADE,
  session_id UUID REFERENCES public.hiker_sessions(id) ON DELETE CASCADE NOT NULL,
  raw_altitude_m NUMERIC(7,2),
  gps_estimated_altitude_m NUMERIC(7,2),
  dem_altitude_m NUMERIC(7,2),
  atmospheric_pressure_pa INT,
  temperature_c NUMERIC(4,1),
  corrected_altitude_m NUMERIC(7,2),
  correction_method TEXT,
  confidence_score NUMERIC(3,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Fields**:
- `id`: Unique correction record
- `location_id`: Reference to smoothed_trajectory point
- `session_id`: Foreign key to hiker_sessions
- `raw_altitude_m`: Original GPS altitude (±5-10m error typical)
- `gps_estimated_altitude_m`: GPS elevation estimate
- `dem_altitude_m`: Altitude from Digital Elevation Model at lat/lng
- `atmospheric_pressure_pa`: Barometric pressure (if device has sensor)
- `temperature_c`: Temperature (affects barometric formula)
- `corrected_altitude_m`: Best estimate after corrections
- `correction_method`: 'dem_blend' | 'barometric' | 'kalman_trajectory'
- `confidence_score`: Confidence in correction (0-1)
- `created_at`: Correction timestamp

**Purpose**: Accurate elevation profiles for fitness analysis and trail mapping

---

#### `off_trail_detection` Table
Identifies when hikers deviate from known trails (safety alert)

```sql
CREATE TABLE public.off_trail_detection (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES public.hiker_sessions(id) ON DELETE CASCADE NOT NULL,
  zone_id UUID REFERENCES public.trail_zones(id) ON DELETE CASCADE NOT NULL,
  start_latitude NUMERIC(10,7),
  start_longitude NUMERIC(10,7),
  start_time TIMESTAMPTZ,
  end_latitude NUMERIC(10,7),
  end_longitude NUMERIC(10,7),
  end_time TIMESTAMPTZ,
  min_distance_to_trail_m INT,
  max_distance_to_trail_m INT,
  duration_minutes INT,
  area_covered_m2 INT,
  severity TEXT,
  alert_sent BOOLEAN DEFAULT false,
  hiker_corrected BOOLEAN,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Fields**:
- `id`: Unique off-trail event
- `session_id`: Foreign key to hiker_sessions
- `zone_id`: Foreign key to trail_zones
- `start_latitude`: Where hiker left trail
- `start_longitude`: Where hiker left trail
- `start_time`: When deviation started
- `end_latitude`: Where hiker returned to trail
- `end_longitude`: Where hiker returned to trail
- `end_time`: When back on trail
- `min_distance_to_trail_m`: Closest approach to trail during deviation
- `max_distance_to_trail_m`: Farthest from trail (e.g., 200m is concerning)
- `duration_minutes`: How long off-trail
- `area_covered_m2`: Total area covered while off-trail
- `severity`: 'minor' (<50m) | 'moderate' (50-150m) | 'major' (>150m)
- `alert_sent`: Whether safety alert was sent to ranger
- `hiker_corrected`: Whether hiker self-corrected or needed guidance
- `notes`: Reason for deviation (optional note from hiker)
- `created_at`: Detection timestamp

**Purpose**: Safety monitoring to prevent hikers from getting lost

---

#### `trail_segment_analysis` Table
Analyzes completed paths to improve trail quality estimates and update known routes

```sql
CREATE TABLE public.trail_segment_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id UUID REFERENCES public.trail_zones(id) ON DELETE CASCADE NOT NULL,
  segment_start_index INT,
  segment_end_index INT,
  segment_name TEXT,
  center_latitude NUMERIC(10,7),
  center_longitude NUMERIC(10,7),
  total_distance_m NUMERIC(8,2),
  elevation_gain_m INT,
  elevation_loss_m INT,
  avg_slope_percent NUMERIC(5,2),
  difficulty_level TEXT,
  surface_type TEXT,
  vegetation_type TEXT,
  hazards JSONB DEFAULT '[]',
  times_traversed INT,
  avg_time_minutes_forward NUMERIC(8,2),
  avg_time_minutes_reverse NUMERIC(8,2),
  median_group_size INT,
  last_updated TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Fields**:
- `id`: Unique segment analysis
- `zone_id`: Foreign key to trail_zones
- `segment_start_index`: Point index where segment starts
- `segment_end_index`: Point index where segment ends
- `segment_name`: Name of segment (e.g., "Steep ascent to ridge")
- `center_latitude`: Center point of segment
- `center_longitude`: Center point of segment
- `total_distance_m`: Length of segment
- `elevation_gain_m`: Uphill elevation in segment
- `elevation_loss_m`: Downhill elevation in segment
- `avg_slope_percent`: Average grade in segment
- `difficulty_level`: 'easy' | 'moderate' | 'hard' assessment
- `surface_type`: 'rock' | 'dirt' | 'mud' | 'roots' | 'gravel'
- `vegetation_type`: 'open' | 'light_forest' | 'dense_forest'
- `hazards`: JSON array ['exposed_edge', 'loose_rock', 'water_crossing', ...]
- `times_traversed`: Number of hikers who crossed this segment
- `avg_time_minutes_forward`: Average time to cross (uphill)
- `avg_time_minutes_reverse`: Average time to cross (downhill)
- `median_group_size`: Typical group size through segment
- `last_updated`: When segment analysis was updated
- `created_at`: Record creation timestamp

**Purpose**: Build ML training data and continuously improve trail understanding

---

#### `path_export_ready` Table
Preprocessed paths ready for visualization, export, or ML feature engineering

```sql
CREATE TABLE public.path_export_ready (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES public.hiker_sessions(id) ON DELETE CASCADE NOT NULL,
  zone_id UUID REFERENCES public.trail_zones(id) ON DELETE CASCADE,
  geojson_linestring JSONB NOT NULL,
  geojson_points JSONB NOT NULL,
  gpx_xml TEXT,
  kml_xml TEXT,
  total_distance_m NUMERIC(8,2),
  total_elevation_gain_m INT,
  total_elevation_loss_m INT,
  min_altitude_m INT,
  max_altitude_m INT,
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  duration_minutes INT,
  avg_speed_m_s NUMERIC(6,2),
  max_speed_m_s NUMERIC(6,2),
  export_quality_score NUMERIC(3,2),
  is_sharable BOOLEAN DEFAULT false,
  share_token TEXT UNIQUE,
  downloads_count INT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(session_id)
);
```

**Fields**:
- `id`: Unique export record
- `session_id`: Foreign key to hiker_sessions
- `zone_id`: Foreign key to trail_zones (if known)
- `geojson_linestring`: GeoJSON LineString of full path
- `geojson_points`: GeoJSON FeatureCollection of individual points with properties
- `gpx_xml`: GPX format file content (for Garmin, etc.)
- `kml_xml`: KML format file content (for Google Earth)
- `total_distance_m`: Total distance hiked
- `total_elevation_gain_m`: Total uphill elevation
- `total_elevation_loss_m`: Total downhill elevation
- `min_altitude_m`: Lowest elevation reached
- `max_altitude_m`: Highest elevation reached
- `start_time`: Hike start timestamp
- `end_time`: Hike end timestamp
- `duration_minutes`: Total hike duration
- `avg_speed_m_s`: Average hiking speed
- `max_speed_m_s`: Peak speed recorded
- `export_quality_score`: Quality of captured path (0-1)
- `is_sharable`: Whether hiker allows public sharing
- `share_token`: Public sharing token (for anonymous sharing)
- `downloads_count`: Number of downloads from public link
- `created_at`: Export preparation timestamp

**Purpose**: Multi-format export for sharing, import to other apps, or public trail mapping

---

### 4. Booking & Registration

#### `bookings` Table
Main booking records for trail activities

```sql
CREATE TABLE public.bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  booking_date DATE NOT NULL,
  group_size INT NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'pending',
  qr_code_data TEXT DEFAULT '',
  emergency_contact_name TEXT DEFAULT '',
  emergency_contact_phone TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Fields**:
- `id`: Unique booking identifier
- `user_id`: Foreign key to auth.users
- `booking_date`: Scheduled hiking date (DATE, not timestamp)
- `group_size`: Number of hikers in group
- `status`: Booking status - one of:
  - `pending`: Awaiting admin confirmation
  - `confirmed`: Approved booking
  - `cancelled`: User or admin cancelled
  - `adjustment_pending`: Admin proposed date change
- `qr_code_data`: QR code string for check-in verification
- `emergency_contact_name`: Emergency contact person name
- `emergency_contact_phone`: Emergency contact phone number
- `notes`: Extended metadata stored as JSON string (BookingMeta structure - see below)
- `created_at`: Booking creation timestamp

**Extended Metadata Structure** (`notes` field as JSON):
```typescript
interface BookingMeta {
  // User information
  fullName?: string;
  emailAddress?: string;
  phoneNumber?: string;
  age?: string;
  sex?: 'male' | 'female' | 'prefer_not_to_say';
  nationality?: string;
  province?: string;
  city?: string;
  
  // Hiker profile
  hasMinors?: boolean;
  minorCount?: number;
  medicalNotes?: string;
  preferredGuide?: string;
  hikeType?: string;
  hikeTime?: string;
  
  // Companion details (array of detailed companion objects)
  companionDetails?: CompanionDetail[];
  
  // Guide assignment
  assignedGuide?: string;
  guidePhone?: string;
  
  // Payment information
  paymentStatus?: 'unpaid' | 'partial' | 'paid';
  paymentMethod?: 'onsite' | 'gcash' | 'bank_transfer';
  amountPaid?: number;
  transactionId?: string;
  entryFee?: number;
  guideFee?: number;
  envFee?: number;
  totalFee?: number;
  
  // Payment screenshot (Firebase URL)
  paymentScreenshotUrl?: string;
  paymentScreenshotPath?: string;
  
  // Adjustment workflow
  adjustedDate?: string;
  adjustedTime?: string;
  
  // Check-in tracking
  onsiteStartConfirmed?: boolean;
  onsiteStartTime?: string;
  hikerSessionId?: string;
  actualGroupSize?: number;
  
  // Refund tracking
  refundAmount?: number;
  refundReason?: string;
  
  // User notes
  userNotes?: string;
}

interface CompanionDetail {
  name: string;
  age?: string;
  sex?: 'male' | 'female' | 'prefer_not_to_say';
  nationality?: string;
  city?: string;
}
```

---

#### `daily_capacity` Table
Tracks aggregate capacity limits and actual usage by date

```sql
CREATE TABLE public.daily_capacity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL UNIQUE,
  max_capacity INT NOT NULL DEFAULT 100,
  current_count INT NOT NULL DEFAULT 0
);
```

**Fields**:
- `id`: Unique capacity record identifier
- `date`: Calendar date (UNIQUE constraint prevents duplicates)
- `max_capacity`: Maximum allowed hikers for this date
- `current_count`: Current registration count

**Seeding**: Pre-populated for next 30 days with default capacity of 100, current_count = 0

---

### 5. Hiking Session Tracking

#### `hiker_sessions` Table
Active hiking sessions linked to bookings and trail zones

```sql
CREATE TABLE public.hiker_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
  trail_zone_id UUID REFERENCES public.trail_zones(id) ON DELETE SET NULL,
  start_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  end_time TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active',
  total_distance_km NUMERIC(8,2) DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Fields**:
- `id`: Unique session identifier
- `user_id`: Foreign key to auth.users (CASCADE delete)
- `booking_id`: Optional foreign key to bookings (SET NULL on booking delete)
- `trail_zone_id`: Optional foreign key to trail_zones (SET NULL on zone delete)
- `start_time`: Session start timestamp (defaults to now())
- `end_time`: Session end timestamp (NULL while active)
- `status`: Session status - typically:
  - `active`: Ongoing session
  - `completed`: Session finished
  - `paused`: Session temporarily paused
- `total_distance_km`: GPS-calculated distance (8.2 numeric precision)
- `created_at`: Session creation timestamp

**Features**:
- Enabled for Supabase real-time subscriptions
- Tracks actual hiking activity separate from booking records

---

### 6. Ranger & Administrative Functions

#### `trail_reports` Table
Filed by rangers for trail conditions and incidents

```sql
CREATE TABLE public.trail_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ranger_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  zone_id UUID REFERENCES public.trail_zones(id) ON DELETE CASCADE NOT NULL,
  condition TEXT NOT NULL DEFAULT 'good',
  description TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Fields**:
- `id`: Unique report identifier
- `ranger_id`: Foreign key to auth.users (ranger filing the report)
- `zone_id`: Foreign key to trail_zones
- `condition`: Trail condition status (good, fair, poor, hazardous, closed)
- `description`: Detailed condition notes and incident reports
- `created_at`: Report filing timestamp

---

### 7. AI Chat & Communication

#### `chat_messages` Table
Stores chat messages for trail information and booking assistance AI

```sql
CREATE TABLE public.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Fields**:
- `id`: Unique message identifier
- `user_id`: Foreign key to auth.users
- `role`: Message source - one of:
  - `user`: Message from hiker user
  - `assistant`: Response from AI assistant
- `content`: Message text content
- `created_at`: Message timestamp

---

### 8. Reviews & Ratings

#### `reviews` Table
User reviews for trails and guides (added in second migration)

```sql
CREATE TABLE public.reviews (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  reviewer_name TEXT NOT NULL DEFAULT '',
  rating INTEGER NOT NULL DEFAULT 5,
  trail_name TEXT NOT NULL DEFAULT '',
  review_text TEXT NOT NULL DEFAULT '',
  is_approved BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
```

**Fields**:
- `id`: Unique review identifier
- `user_id`: Original reviewer's user ID (not foreign key)
- `reviewer_name`: Public display name for review
- `rating`: Numerical rating (typically 1-5 stars)
- `trail_name`: Name of trail being reviewed
- `review_text`: Review content
- `is_approved`: Admin moderation flag (false = awaiting approval)
- `created_at`: Review submission timestamp

---

## 9. Machine Learning & Predictive Analytics

### 9.1 Visitor Traffic Collection

#### `daily_visitor_counts` Table
Tracks aggregate daily visitor traffic by trail zone and date

```sql
CREATE TABLE public.daily_visitor_counts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id UUID REFERENCES public.trail_zones(id) ON DELETE CASCADE NOT NULL,
  date DATE NOT NULL,
  confirmed_bookings INT NOT NULL DEFAULT 0,
  check_ins INT NOT NULL DEFAULT 0,
  check_outs INT NOT NULL DEFAULT 0,
  no_shows INT NOT NULL DEFAULT 0,
  total_hikers INT GENERATED ALWAYS AS (confirmed_bookings) STORED,
  peak_occupancy INT DEFAULT 0,
  collected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(zone_id, date)
);
```

**Fields**:
- `id`: Unique record identifier
- `zone_id`: Foreign key to trail_zones
- `date`: Calendar date for aggregation (UNIQUE compound key with zone_id)
- `confirmed_bookings`: Number of confirmed bookings for the date
- `check_ins`: Count of hikers who actually checked in
- `check_outs`: Count of hikers who checked out
- `no_shows`: Count of confirmed bookings that didn't show up
- `total_hikers`: Generated column (equals confirmed_bookings)
- `peak_occupancy`: Maximum concurrent hikers on trail that day
- `collected_at`: When data was last updated
- `created_at`: Record creation timestamp

**Purpose**: Raw material for monthly/daily visitor predictions

---

#### `hourly_visitor_traffic` Table
Granular hourly traffic patterns for refining peak-time analysis

```sql
CREATE TABLE public.hourly_visitor_traffic (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id UUID REFERENCES public.trail_zones(id) ON DELETE CASCADE NOT NULL,
  date DATE NOT NULL,
  hour INT NOT NULL CHECK (hour >= 0 AND hour < 24),
  active_hikers INT NOT NULL DEFAULT 0,
  arrivals INT NOT NULL DEFAULT 0,
  departures INT NOT NULL DEFAULT 0,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(zone_id, date, hour)
);
```

**Fields**:
- `id`: Unique record identifier
- `zone_id`: Foreign key to trail_zones
- `date`: Calendar date
- `hour`: Hour of day (0-23)
- `active_hikers`: Number of hikers on trail during this hour
- `arrivals`: Number of new hikers arriving during this hour
- `departures`: Number of hikers leaving during this hour
- `recorded_at`: Timestamp when data was recorded

**Purpose**: Time-series data for identifying peak hours, arrival patterns, descent timing

---

#### `visitor_demographics` Table
Track visitor patterns by demographic to improve predictions

```sql
CREATE TABLE public.visitor_demographics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date_recorded DATE NOT NULL,
  zone_id UUID REFERENCES public.trail_zones(id) ON DELETE CASCADE NOT NULL,
  day_of_week TEXT NOT NULL,
  age_group TEXT,
  group_size_avg NUMERIC(5,2),
  total_visitors INT,
  season TEXT,
  is_holiday BOOLEAN DEFAULT false,
  weather_condition TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Fields**:
- `id`: Unique record identifier
- `date_recorded`: Date of observation
- `zone_id`: Foreign key to trail_zones
- `day_of_week`: 'Monday', 'Tuesday', etc. for pattern analysis
- `age_group`: Aggregated age demographics
- `group_size_avg`: Average group size for bookings
- `total_visitors`: Total visitor count for the date
- `season`: Season classification (dry_season, wet_season, transition)
- `is_holiday`: Boolean flag for holiday periods
- `weather_condition`: Weather category (clear, cloudy, rainy, foggy)
- `created_at`: Timestamp of record creation

**Purpose**: Context features for ML models to improve prediction accuracy

---

### 9.2 Hiking Duration Records

#### `hiking_duration_records` Table
Captures actual hiking performance data (time-to-peak, descent time, etc.)

```sql
CREATE TABLE public.hiking_duration_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES public.hiker_sessions(id) ON DELETE CASCADE NOT NULL,
  zone_id UUID REFERENCES public.trail_zones(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  start_elevation_m INT,
  peak_elevation_m INT,
  total_elevation_gain_m INT,
  time_to_peak_minutes INT,
  time_to_base_minutes INT,
  total_hike_duration_minutes INT,
  group_size INT,
  fitness_level TEXT,
  weather_condition TEXT,
  trail_condition TEXT,
  completed_date DATE NOT NULL,
  started_at TIMESTAMPTZ,
  peak_reached_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Fields**:
- `id`: Unique record identifier
- `session_id`: Foreign key to hiker_sessions
- `zone_id`: Foreign key to trail_zones
- `user_id`: Foreign key to auth.users
- `start_elevation_m`: Starting elevation
- `peak_elevation_m`: Peak elevation reached
- `total_elevation_gain_m`: Total vertical distance gained
- `time_to_peak_minutes`: Minutes from start to summit (key prediction target)
- `time_to_base_minutes`: Minutes from peak back to base (descent prediction target)
- `total_hike_duration_minutes`: Total time from start to finish
- `group_size`: Number of hikers in group (affects pace)
- `fitness_level`: Self-reported or inferred fitness category
- `weather_condition`: Weather during the hike (clear, cloudy, rainy)
- `trail_condition`: Reported trail condition (good, slippery, muddy)
- `completed_date`: Date the hike occurred
- `started_at`: Actual start timestamp
- `peak_reached_at`: Timestamp when summit reached
- `completed_at`: Timestamp when hike completed
- `created_at`: Record creation timestamp

**Purpose**: Training data for hiking time prediction models

---

#### `hiking_performance_stats` Table
Aggregated performance statistics by trail zone for faster analysis

```sql
CREATE TABLE public.hiking_performance_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id UUID REFERENCES public.trail_zones(id) ON DELETE CASCADE NOT NULL,
  metric_date DATE NOT NULL,
  avg_time_to_peak_minutes NUMERIC(8,2),
  median_time_to_peak_minutes NUMERIC(8,2),
  std_dev_time_to_peak NUMERIC(8,2),
  min_time_to_peak_minutes INT,
  max_time_to_peak_minutes INT,
  avg_time_to_base_minutes NUMERIC(8,2),
  median_time_to_base_minutes NUMERIC(8,2),
  std_dev_time_to_base NUMERIC(8,2),
  total_records INT,
  avg_group_size NUMERIC(5,2),
  common_fitness_level TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(zone_id, metric_date)
);
```

**Fields**:
- `id`: Unique record identifier
- `zone_id`: Foreign key to trail_zones
- `metric_date`: Date these stats were calculated for
- `avg_time_to_peak_minutes`: Mean time to summit
- `median_time_to_peak_minutes`: Median time to summit (more robust)
- `std_dev_time_to_peak`: Standard deviation for confidence intervals
- `min_time_to_peak_minutes`: Fastest recorded time to peak
- `max_time_to_peak_minutes`: Slowest recorded time to peak
- `avg_time_to_base_minutes`: Mean descent time
- `median_time_to_base_minutes`: Median descent time
- `std_dev_time_to_base`: Standard deviation for descent
- `total_records`: Number of records used in calculation
- `avg_group_size`: Average group size for this period
- `common_fitness_level`: Most common fitness level
- `created_at`: Calculation timestamp

**Purpose**: Denormalized aggregates for fast performance queries

---

### 9.3 Predictive Models

#### `visitor_predictions` Table
Machine learning model predictions for visitor counts

```sql
CREATE TABLE public.visitor_predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id UUID REFERENCES public.trail_zones(id) ON DELETE CASCADE NOT NULL,
  prediction_date DATE NOT NULL,
  prediction_horizon_days INT NOT NULL,
  prediction_type TEXT NOT NULL,
  predicted_visitors INT NOT NULL,
  confidence_score NUMERIC(3,2),
  lower_bound_95_ci INT,
  upper_bound_95_ci INT,
  actual_visitors INT,
  prediction_error INT,
  model_version TEXT,
  model_name TEXT,
  training_data_points INT,
  features_used TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(zone_id, prediction_date, prediction_type)
);
```

**Fields**:
- `id`: Unique prediction identifier
- `zone_id`: Foreign key to trail_zones (what trail is this for)
- `prediction_date`: Date being predicted
- `prediction_horizon_days`: How far ahead (1 for daily, 7 for weekly, 30 for monthly)
- `prediction_type`: 'daily' | 'weekly' | 'monthly'
- `predicted_visitors`: ML model's prediction of visitor count
- `confidence_score`: Model confidence (0.0 to 1.0)
- `lower_bound_95_ci`: 95% confidence interval lower bound
- `upper_bound_95_ci`: 95% confidence interval upper bound
- `actual_visitors`: Actual count after the day occurred (for model evaluation)
- `prediction_error`: (actual - predicted) for tracking model performance
- `model_version`: Version identifier of the trained model
- `model_name`: Name of the model (e.g., 'arima_v2', 'xgboost_seasonal')
- `training_data_points`: Number of historical records used to train
- `features_used`: Array of feature names used in prediction
- `created_at`: When prediction was generated

**Purpose**: Store ML predictions for monthly/weekly/daily visitor forecasts

---

#### `hiking_duration_predictions` Table
Predictions for time-to-peak and descent time based on conditions

```sql
CREATE TABLE public.hiking_duration_predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id UUID REFERENCES public.trail_zones(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  prediction_date DATE NOT NULL,
  group_size INT,
  estimated_fitness_level TEXT,
  weather_condition TEXT,
  trail_condition TEXT,
  estimated_time_to_peak_minutes INT,
  estimated_time_to_peak_lower_bound INT,
  estimated_time_to_peak_upper_bound INT,
  estimated_time_to_base_minutes INT,
  estimated_time_to_base_lower_bound INT,
  estimated_time_to_base_upper_bound INT,
  estimated_total_duration_minutes INT,
  confidence_score NUMERIC(3,2),
  model_version TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Fields**:
- `id`: Unique prediction identifier
- `zone_id`: Foreign key to trail_zones
- `user_id`: Optional foreign key to hikers (for personalized predictions)
- `prediction_date`: Date of predicted hike
- `group_size`: Size of hiking group
- `estimated_fitness_level`: Fitness level of user
- `weather_condition`: Expected weather
- `trail_condition`: Expected trail condition
- `estimated_time_to_peak_minutes`: ML estimate of time to reach summit
- `estimated_time_to_peak_lower_bound`: Conservative estimate (95% CI)
- `estimated_time_to_peak_upper_bound`: Optimistic estimate (95% CI)
- `estimated_time_to_base_minutes`: ML estimate of descent time
- `estimated_time_to_base_lower_bound`: Conservative descent time
- `estimated_time_to_base_upper_bound`: Optimistic descent time
- `estimated_total_duration_minutes`: Total hike duration estimate
- `confidence_score`: Model confidence (0.0 to 1.0)
- `model_version`: Version of the trained model
- `created_at`: Prediction creation timestamp

**Purpose**: Personalized time estimates shown to hikers during booking

---

#### `peak_time_forecasts` Table
Predictions for peak arrival and exit times (when most hikers arrive/leave)

```sql
CREATE TABLE public.peak_time_forecasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id UUID REFERENCES public.trail_zones(id) ON DELETE CASCADE NOT NULL,
  forecast_date DATE NOT NULL,
  expected_peak_arrival_hour INT CHECK (expected_peak_arrival_hour >= 0 AND expected_peak_arrival_hour < 24),
  peak_arrival_confidence NUMERIC(3,2),
  expected_peak_occupancy_time_range TEXT,
  expected_peak_departure_hour INT CHECK (expected_peak_departure_hour >= 0 AND expected_peak_departure_hour < 24),
  peak_departure_confidence NUMERIC(3,2),
  recommended_start_time TEXT,
  model_version TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(zone_id, forecast_date)
);
```

**Fields**:
- `id`: Unique forecast identifier
- `zone_id`: Foreign key to trail_zones
- `forecast_date`: Date being forecasted
- `expected_peak_arrival_hour`: Predicted hour when most hikers arrive (0-23)
- `peak_arrival_confidence`: Confidence in arrival prediction
- `expected_peak_occupancy_time_range`: Time range when trail is busiest (e.g., "10:00-14:00")
- `expected_peak_departure_hour`: Predicted hour when most hikers leave
- `peak_departure_confidence`: Confidence in departure prediction
- `recommended_start_time`: Suggested start time to avoid peak (e.g., "05:30 AM")
- `model_version`: Version of the model
- `created_at`: Forecast creation timestamp

**Purpose**: Recommend best times to hike for minimizing crowds

---

### 9.4 Recommendations Engine

#### `user_recommendations` Table
Personalized recommendations shown to hikers based on predictions

```sql
CREATE TABLE public.user_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  zone_id UUID REFERENCES public.trail_zones(id) ON DELETE CASCADE NOT NULL,
  recommendation_type TEXT NOT NULL,
  recommended_date DATE,
  recommended_time TEXT,
  reason TEXT,
  predicted_crowd_level TEXT,
  expected_wait_time_minutes INT,
  expected_hike_duration_minutes INT,
  confidence_score NUMERIC(3,2),
  priority_score NUMERIC(5,2),
  is_displayed BOOLEAN DEFAULT false,
  clicked BOOLEAN DEFAULT false,
  acted_on BOOLEAN DEFAULT false,
  feedback_score INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ
);
```

**Fields**:
- `id`: Unique recommendation identifier
- `user_id`: Foreign key to hiker
- `zone_id`: Foreign key to trail_zones
- `recommendation_type`: 'best_time' | 'avoid_peak' | 'good_weather' | 'optimal_group_size'
- `recommended_date`: Suggested date for hike
- `recommended_time`: Suggested start time
- `reason`: Human-readable explanation (e.g., "Light crowd predicted, good weather")
- `predicted_crowd_level`: 'low' | 'medium' | 'high' | 'very_high'
- `expected_wait_time_minutes`: Predicted time waiting for peak conditions
- `expected_hike_duration_minutes`: Total hike time estimate
- `confidence_score`: ML model confidence
- `priority_score`: Ranking for user (higher = more important)
- `is_displayed`: Whether recommendation was shown to user
- `clicked`: Whether user clicked on recommendation
- `acted_on`: Whether user booked the recommended date/time
- `feedback_score`: User feedback (1-5 stars if provided)
- `created_at`: Recommendation creation timestamp
- `expires_at`: When recommendation expires (e.g., after 7 days)

**Purpose**: Drive engagement and improve UX by suggesting optimal times

---

#### `recommendation_feedback` Table
Track user interaction with recommendations for continuous improvement

```sql
CREATE TABLE public.recommendation_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recommendation_id UUID REFERENCES public.user_recommendations(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  action TEXT NOT NULL,
  rating INT CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  was_helpful BOOLEAN,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Fields**:
- `id`: Unique feedback identifier
- `recommendation_id`: Foreign key to user_recommendations
- `user_id`: Foreign key to user giving feedback
- `action`: 'viewed' | 'clicked' | 'dismissed' | 'booked' | 'ignored'
- `rating`: User rating of recommendation quality (1-5 stars)
- `comment`: Freeform feedback text
- `was_helpful`: Boolean indicator of recommendation helpfulness
- `created_at`: Feedback timestamp

**Purpose**: Collect training labels to improve recommendation model accuracy

---

### 9.5 Model Training & Metadata

#### `model_training_metadata` Table
Tracks model versions, training dates, accuracy metrics for model versioning

```sql
CREATE TABLE public.model_training_metadata (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_name TEXT NOT NULL,
  model_type TEXT NOT NULL,
  model_version TEXT NOT NULL UNIQUE,
  model_purpose TEXT,
  training_start_date DATE,
  training_end_date DATE,
  training_data_points INT,
  features_count INT,
  hyperparameters JSONB,
  accuracy_metrics JSONB,
  mean_absolute_error NUMERIC(8,4),
  root_mean_squared_error NUMERIC(8,4),
  r_squared NUMERIC(5,4),
  test_set_performance NUMERIC(5,4),
  deployment_status TEXT DEFAULT 'development',
  is_active BOOLEAN DEFAULT false,
  deployed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Fields**:
- `id`: Unique metadata identifier
- `model_name`: Human-readable name (e.g., 'Visitor Count ARIMA')
- `model_type`: Model algorithm (arima, xgboost, lstm, linear_regression, etc.)
- `model_version`: Version string (e.g., 'v1.0.0', 'v1.2.1')
- `model_purpose`: What the model predicts (visitor_count | hiking_duration | peak_time)
- `training_start_date`: Date range of training data
- `training_end_date`: End date of training data
- `training_data_points`: Number of records used
- `features_count`: Number of features/variables in model
- `hyperparameters`: JSON of model configuration (learning rate, regularization, etc.)
- `accuracy_metrics`: JSON of all performance metrics
- `mean_absolute_error`: MAE for regression models
- `root_mean_squared_error`: RMSE for regression models
- `r_squared`: R² goodness of fit
- `test_set_performance`: Performance on holdout test set
- `deployment_status`: 'development' | 'staging' | 'production' | 'archived'
- `is_active`: Whether this is the current active model
- `deployed_at`: When model was deployed to production
- `created_at`: Metadata creation timestamp
- `updated_at`: Last update timestamp

**Purpose**: Maintain model versioning, track performance, enable rollback if needed

---

#### `model_retraining_schedule` Table
Define when/how models should be automatically retrained

```sql
CREATE TABLE public.model_retraining_schedule (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_version TEXT REFERENCES public.model_training_metadata(model_version),
  retraining_frequency TEXT NOT NULL,
  last_retrained_at TIMESTAMPTZ,
  next_retraining_at TIMESTAMPTZ,
  retrain_on_new_data_count INT,
  min_accuracy_threshold NUMERIC(5,4),
  auto_deploy_if_improved BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Fields**:
- `id`: Unique schedule identifier
- `model_version`: Foreign key to model
- `retraining_frequency`: 'daily' | 'weekly' | 'monthly' | 'manual'
- `last_retrained_at`: Timestamp of last retraining
- `next_retraining_at`: Scheduled retraining date
- `retrain_on_new_data_count`: Retrain when N new records collected
- `min_accuracy_threshold`: Don't deploy if accuracy drops below this
- `auto_deploy_if_improved`: Auto-deploy improved model to production
- `created_at`: Schedule creation timestamp
- `updated_at`: Last update timestamp

**Purpose**: Orchestrate automatic model maintenance and improvement

---

## Database Relationships (Diagram)

```
auth.users (Supabase Auth)
    ├── 1:1 → profiles (user_id)
    ├── 1:M → user_roles (user_id) [Many roles per user]
    ├── 1:M → bookings (user_id)
    ├── 1:M → hiker_sessions (user_id)
    ├── 1:M → hiker_locations (via hiker_sessions)
    ├── 1:M → trail_reports (ranger_id)
    ├── 1:M → chat_messages (user_id)
    ├── 1:M → reviews (user_id)
    ├── 1:M → hiking_duration_records (user_id) [ML DATA]
    ├── 1:M → hiking_duration_predictions (user_id) [ML PREDICTIONS]
    ├── 1:M → user_recommendations (user_id) [ML RECOMMENDATIONS]
    └── 1:M → recommendation_feedback (user_id) [ML FEEDBACK]

bookings (user_id)
    └── 1:M → hiker_sessions (booking_id)

trail_zones
    ├── 1:M → hiker_sessions (trail_zone_id)
    ├── 1:M → trail_reports (zone_id)
    ├── 1:M → daily_visitor_counts (zone_id) [ML DATA]
    ├── 1:M → hourly_visitor_traffic (zone_id) [ML DATA]
    ├── 1:M → visitor_demographics (zone_id) [ML DATA]
    ├── 1:M → hiking_duration_records (zone_id) [ML DATA]
    ├── 1:M → hiking_performance_stats (zone_id) [ML STATS]
    ├── 1:M → visitor_predictions (zone_id) [ML PREDICTIONS]
    ├── 1:M → hiking_duration_predictions (zone_id) [ML PREDICTIONS]
    ├── 1:M → peak_time_forecasts (zone_id) [ML FORECASTS]
    └── 1:M → user_recommendations (zone_id) [ML RECOMMENDATIONS]

hiker_sessions
    ├── 1:M → hiker_locations (session_id)
    └── 1:M → hiking_duration_records (session_id) [ML DATA]

user_recommendations
    └── 1:M → recommendation_feedback (recommendation_id) [ML FEEDBACK]

model_training_metadata
    └── 1:M → model_retraining_schedule (model_version) [ML METADATA]
```

---

## Row Level Security (RLS) Policies

### Access Control by Role

| Table | Admin | Ranger | Guide | Hiker |
|-------|-------|--------|-------|-------|
| **profiles** | View all, Update all | View all | View own | View own, Update own |
| **user_roles** | View all, Manage all | View own | View own | View own |
| **trail_zones** | View all, Manage all | View all | View all | View all |
| **daily_capacity** | View all, Manage all | View all | View all | View all |
| **bookings** | View all, Manage all | View all | View all | View own, Create own, Update own |
| **hiker_sessions** | View all | View all | - | View own, Create own |
| **hiker_locations** | View all | View all | - | Insert own, View own |
| **trail_reports** | View all, Manage all | Create own, Update own, View all | - | View all (anyone can view) |
| **chat_messages** | - | - | - | View own, Create own |
| **reviews** | View all, Manage all | - | - | View own, Create own (any authenticated) |
| **daily_visitor_counts** [ML] | View all | View all | - | View all |
| **hourly_visitor_traffic** [ML] | View all | View all | - | View all |
| **visitor_demographics** [ML] | View all | View all | - | View all |
| **hiking_duration_records** [ML] | View all | View all | - | View own |
| **hiking_performance_stats** [ML] | View all | View all | - | View all |
| **visitor_predictions** [ML] | View all | View all | - | View all |
| **hiking_duration_predictions** [ML] | View all | - | - | View own |
| **peak_time_forecasts** [ML] | View all | View all | - | View all |
| **user_recommendations** [ML] | View all | - | - | View own |
| **recommendation_feedback** [ML] | View all | - | - | Create own, Update own |
| **model_training_metadata** [ML] | View all, Manage all | - | - | View all |
| **model_retraining_schedule** [ML] | View all, Manage all | - | - | View all |

### Helper Function
```sql
CREATE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;
```

---

## Triggers & Automation

### 1. Profile Auto-Creation
```sql
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```
**Action**: Automatically creates profile and assigns 'hiker' role on user signup

### 2. Updated Timestamp Auto-Update
```sql
CREATE TRIGGER update_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
```
**Action**: Sets `updated_at` to current timestamp on every profile update

---

## Real-Time Subscriptions

Supabase realtime is enabled for:
- `hiker_locations`: Real-time GPS tracking updates
- `hiker_sessions`: Session status changes
- Other tables can be subscribed to on demand

---

## Indexes & Performance

**Primary Indexes**:
- `profiles.user_id` (UNIQUE)
- `user_roles.user_id` + `role` (UNIQUE compound)
- `daily_capacity.date` (UNIQUE)
- Foreign keys create implicit indexes

**Query Optimization**:
- User role lookups use `has_role()` function for consistency
- Trail zone GeoJSON coordinates stored as JSONB for flexible querying
- Hiker location timestamps enable chronological queries

---

## Firebase Integration (Secondary Storage)

### Collections
1. **Activity Logs**: User activity audit trail
2. **Notifications**: User notification records
3. **Announcements**: System announcements and alerts
4. **Trail Offline KB**: Offline trail knowledge base
5. **Guide Ratings**: Supplementary guide performance metrics
6. **Booking Metadata**: Extended booking information

### Storage Buckets
- **User Avatars**: Profile images stored at Firebase Storage URLs (referenced in `profiles.avatar_url`)
- **Payment Screenshots**: Payment proof images (referenced in `bookings.notes.paymentScreenshotUrl`)

---

## Data Types & Constraints

| Type | Usage | Example |
|------|-------|---------|
| UUID | All primary & foreign keys | gen_random_uuid() |
| TEXT | Names, descriptions, content | "summit_trail" |
| INT | Counts, capacities, ratings | 50, 100, 5 |
| DATE | Date-only fields (no time) | 2026-04-16 |
| TIMESTAMPTZ | Timestamps with timezone | "2026-04-16T14:30:00Z" |
| NUMERIC(8,2) | Precise decimal (distance, altitude) | 12345.67 |
| NUMERIC(10,7) | Precise decimals (GPS) | 14.4833, 121.4167 |
| JSONB | Complex nested data | Coordinates, BookingMeta |
| BOOLEAN | Boolean flags | true, false |

---

## Constraints & Referential Integrity

- **Foreign Key Constraints**: ON DELETE CASCADE (auto-delete dependent records)
- **Unique Constraints**: `profiles.user_id`, `user_roles(user_id, role)`, `daily_capacity.date`
- **Not Null**: Enforced on critical fields (user_id, status, dates)
- **Defaults**: Sensible defaults for optional fields (e.g., status='pending')

---

## Scalability Considerations

1. **Partitioning**: `hiker_locations` and `trail_reports` could be partitioned by date for large datasets
2. **Archival**: Old completed sessions and chat messages can be archived to cold storage
3. **Denormalization**: Daily/monthly aggregates could be cached for performance
4. **Connection Pooling**: Supabase handles connection pooling automatically
5. **Real-time Limitations**: Monitor hiker_locations subscription load at scale

---

## Security Features

1. **Row Level Security**: All tables protected with RLS policies
2. **Authentication**: Supabase Auth with email/password
3. **Audit Trail**: `created_at`/`updated_at` timestamps on all records
4. **Authorization**: Role-based access control via `user_roles` + `has_role()` function
5. **Data Validation**: Enums and type constraints in database layer
6. **Cascading Deletes**: Orphaned data automatically cleaned up

---

## Conclusion

This database schema supports a comprehensive trail management system with:
- **Multi-role access control** (Admin, Ranger, Guide, Hiker)
- **Real-time GPS tracking and location monitoring**
- **Booking and capacity management**
- **Trail condition reporting and safety features**
- **Review and rating system**
- **Extensible metadata storage for complex booking scenarios**

### ML/Predictive Analytics Capabilities
Additionally, the schema includes dedicated infrastructure for machine learning features that **grow stronger over time**:
- **Visitor traffic prediction** (daily, weekly, monthly) based on historical patterns and seasonality
- **Hiking duration prediction** (time-to-peak, descent time) personalized by fitness level, group size, and conditions
- **Peak time forecasting** to recommend optimal times for hikers to minimize crowds
- **Smart recommendations** suggesting best dates/times based on crowd predictions and weather
- **Automatic model retraining** that improves predictions as more data is collected
- **Feedback loops** to continuously refine model accuracy through user interactions

### Technical Advantages
The use of PostgreSQL (Supabase) provides:
- **ACID guarantees and strong consistency** for transactional data
- **Complex query capabilities** for analytics and ML feature engineering
- **Time-series optimization** for daily/hourly aggregations
- **Denormalized aggregates** (`hiking_performance_stats`) for fast model serving
- **Model versioning and deployment tracking** for reliable ML operations

Firebase supplements with media storage and NoSQL flexibility for semi-structured data, while the ML infrastructure enables data-driven decision-making that continuously improves with system usage.

