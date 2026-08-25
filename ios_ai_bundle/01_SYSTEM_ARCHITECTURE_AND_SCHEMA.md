# 01. MT. KALISUNGAN TOURIST TRACKING SYSTEM — SYSTEM ARCHITECTURE & DATABASE SCHEMA
## Complete Specification for Native iOS (SwiftUI) Clone

---

## 1. Project Overview & Core Mission
**Mount Kalisungan Tourist Tracking & Safety System** is an enterprise-grade eco-tourism management platform designed for Mount Kalisungan (and multi-mountain locations) in Laguna, Philippines.

### Primary Capabilities:
1. **Smart Booking & Visitor Management**: Individual and group hike reservations with auto guide calculation, fee breakdown, companion registration, minor consent verification, and date adjustment.
2. **GPS Trail Tracking & Checkpoint Monitoring**: 2D/3D interactive terrain maps, real-time hiker sessions (Ascent -> Peak Stay -> Descent -> Base), and emergency SOS.
3. **QR Permit & Fast Trailhead Check-In**: Camera QR scanning, headcount audit, onsite start authorization, and session token generation.
4. **End Session & Payment Settlement**: Automatic online payment detection (GCash/Maya/Bank Transfer), cash change calculator for onsite payments, guide release, and audit logs.
5. **Prophet ML Visitor Forecasting**: Time-series demand forecasting with seasonality decomposition, capacity threshold alerts, and executive report export.
6. **Role-Based Access Control**: 5 distinct roles (`admin`, `super_admin`, `ranger`, `guide`, `hiker`).

---

## 2. Fee Calculation Rules & Business Logic

### Fee Rates:
* **Registration / Environmental Fee**: ₱30 per person.
* **Tour Guide Fee**: ₱800 per guide.
* **Guide Ratio**: Max 8 hikers per 1 tour guide. If group size is 9–16, 2 guides (₱1,600) are required; 17–24 requires 3 guides (₱2,400), etc.
  $$\text{Guides Needed} = \left\lceil \frac{\text{Group Size}}{8} \right\rceil$$
  $$\text{Guide Fee} = \text{Guides Needed} \times 800$$
* **Base Total Fee**: $(\text{Group Size} \times 30) + \text{Guide Fee}$.
* **Peak Stay Extension**: ₱100 per additional hour beyond the standard 2-hour summit stay.
* **Emergency Rescue / Horse Service**: ₱500 per horse / rescue request.
* **Payment Methods**: `onsite` (Cash), `gcash`, `bank_transfer`, `maya`.

---

## 3. Database Schema (PostgreSQL / Supabase)

### 3.1. `bookings` Table
```sql
CREATE TABLE public.bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    location_id UUID REFERENCES public.locations(id),
    booking_date DATE NOT NULL,
    hike_time TEXT DEFAULT '06:00 AM',
    group_size INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'confirmed', 'cancelled', 'adjustment_pending', 'completed'
    payment_status TEXT NOT NULL DEFAULT 'unpaid', -- 'unpaid', 'partial', 'paid'
    payment_method TEXT DEFAULT 'onsite', -- 'onsite', 'gcash', 'bank_transfer'
    total_amount NUMERIC(10,2) DEFAULT 0,
    emergency_contact_name TEXT,
    emergency_contact_phone TEXT,
    notes TEXT, -- Stores JSON BookingMeta (see structure below)
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
```

### 3.2. `BookingMeta` JSON Notes Specification
Stored as JSON in `bookings.notes`:
```json
{
  "fullName": "Juan Dela Cruz",
  "phoneNumber": "+63 912 345 6789",
  "emailAddress": "juan@example.com",
  "age": "28",
  "sex": "male",
  "nationality": "Filipino",
  "province": "Laguna",
  "city": "Calauan",
  "hikeType": "day",
  "hikeTime": "06:00 AM",
  "companions": ["Maria Santos", "Pedro Reyes"],
  "companionDetails": [
    { "name": "Maria Santos", "age": "26", "sex": "female", "nationality": "Filipino", "city": "Calauan" }
  ],
  "hasMinors": false,
  "minorCount": 0,
  "medicalNotes": "None",
  "preferredGuide": "Rodel Manalansan",
  "assignedGuide": "Rodel Manalansan",
  "assignedGuideId": "g1",
  "assignedTrailName": "Summit Trail",
  "assignedTrailZoneId": "zone-1",
  "onsiteStartConfirmed": true,
  "onsiteStartTime": "2026-08-25T06:15:00Z",
  "groupPhase": "ascent",
  "peakReachedAt": null,
  "peakDeadlineAt": null,
  "peakExtensionHours": 0,
  "peakExtensionFee": 0,
  "emergencyHorseCount": 0,
  "emergencyHorseFee": 0,
  "hikeCompletedAt": null,
  "paymentStatus": "paid",
  "paymentMethod": "onsite",
  "amountPaid": 1000,
  "cashTendered": 1000,
  "changeReturned": 0,
  "paymentSettledAt": "2026-08-25T11:30:00Z"
}
```

### 3.3. `hiker_sessions` Table (Active Live Hikes)
```sql
CREATE TABLE public.hiker_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_session_id TEXT UNIQUE,
    user_id UUID REFERENCES auth.users(id),
    booking_id UUID REFERENCES public.bookings(id) ON DELETE CASCADE,
    location_id UUID REFERENCES public.locations(id),
    trail_zone_id UUID REFERENCES public.trail_zones(id),
    participant_role TEXT DEFAULT 'hiker', -- 'hiker', 'guide', 'ranger'
    tracking_phase TEXT DEFAULT 'ascent', -- 'ascent', 'peak', 'descent', 'completed'
    start_time TIMESTAMPTZ DEFAULT now(),
    end_time TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'active', -- 'active', 'completed', 'cancelled'
    total_distance_km NUMERIC(6,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);
```

### 3.4. `hiker_locations` Table (Live GPS Track Points)
```sql
CREATE TABLE public.hiker_locations (
    id BIGSERIAL PRIMARY KEY,
    session_id UUID REFERENCES public.hiker_sessions(id) ON DELETE CASCADE,
    latitude NUMERIC(10,7) NOT NULL,
    longitude NUMERIC(10,7) NOT NULL,
    altitude NUMERIC(7,2),
    accuracy NUMERIC(5,2),
    speed_m_s NUMERIC(5,2),
    heading NUMERIC(5,2),
    segment TEXT DEFAULT 'ascent',
    timestamp TIMESTAMPTZ DEFAULT now()
);
```

### 3.5. `guides` Table
```sql
CREATE TABLE public.guides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id),
    location_id UUID REFERENCES public.locations(id),
    full_name TEXT NOT NULL,
    phone TEXT,
    status TEXT NOT NULL DEFAULT 'available', -- 'available', 'on-duty', 'off-duty'
    assigned_trail TEXT,
    total_hikes INTEGER DEFAULT 0,
    rating NUMERIC(3,2) DEFAULT 5.0,
    created_at TIMESTAMPTZ DEFAULT now()
);
```

### 3.6. `daily_capacity` Table
```sql
CREATE TABLE public.daily_capacity (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    location_id UUID REFERENCES public.locations(id),
    date DATE NOT NULL,
    max_capacity INTEGER NOT NULL DEFAULT 150,
    current_count INTEGER NOT NULL DEFAULT 0,
    is_closed BOOLEAN DEFAULT false,
    closure_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (location_id, date)
);
```

### 3.7. `activity_logs` Table (Audit Trail)
```sql
CREATE TABLE public.activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    action TEXT NOT NULL, -- 'booking_created', 'hike_started', 'hike_completed', 'payment_settled'
    entity_type TEXT NOT NULL,
    entity_id UUID,
    details JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);
```

---

## 4. User Roles & Navigation Architecture

| Role | Landing View | Primary Navigation Tabs / Screens |
| :--- | :--- | :--- |
| **Hiker** | `HikerDashboardView` | 🏠 Home, 🗺️ Live Trail Map, 📅 Book Hike, 📱 My QR Permit, 👤 Profile |
| **Admin** | `AdminDashboardView` | 📊 Overview, 📋 Operations (Bookings / QR Scanner / Live Map), 👥 Management (Guides / Capacity / Prophet Forecast), 💰 Finance |
| **Guide** | `GuideDashboardView` | 🥾 Active Assigned Hikes, 📋 Upcoming Trips, ⏱️ On-Duty Toggle |
| **Ranger** | `RangerDashboardView` | 🗺️ Live Checkpoint Monitor, 🚨 Emergency SOS Alert Dispatch |
