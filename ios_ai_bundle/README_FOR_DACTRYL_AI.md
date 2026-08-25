# 📱 MT. KALISUNGAN — DACTRYL / AI SWIFTUI CONVERSION BUNDLE

This directory contains the complete, compressed specification of the **Mt. Kalisungan Eco-Tourism Tracking & Booking System** formatted for single-file upload into Dactryl, Cursor, Claude, or Xcode AI.

---

## 📂 File Breakdown & Upload Order

Upload these 4 files one by one to your AI assistant:

| File Name | Purpose | What the AI Learns |
| :--- | :--- | :--- |
| **`01_SYSTEM_ARCHITECTURE_AND_SCHEMA.md`** | Database Schema & Business Rules | Supabase PostgreSQL tables, RLS, fee math (₱800 guide / 8 pax, ₱30 reg, ₱100 peak, ₱500 horse), and user roles (`admin`, `ranger`, `guide`, `hiker`). |
| **`02_SWIFT_DATA_MODELS_AND_SERVICES.md`** | Swift Codable Models & Core Services | Ready-to-use Swift models (`Booking`, `BookingMeta`, `HikerSession`), `PaymentCalculationService`, and `LocationTrackingService` (CoreLocation). |
| **`03_SWIFTUI_VIEWS_AND_UI_SPEC.md`** | Screen Blueprints & UI Components | Complete SwiftUI code for `EndHikeSettlementView` (Change Calculator), `QRCheckInScannerView` (AVFoundation), `TrailMap2D3DView` (MapKit 3D), and Dashboards. |
| **`04_PROPHET_ML_AND_AI_ASSISTANT_SPEC.md`** | ML Forecasting & Native iOS Features | Pure Swift `ProphetMLEngine`, Dynamic Island / Live Activity widget (`ActivityKit`), and AI chat service. |

---

## 🤖 Master AI Prompt for Dactryl

Copy and paste this prompt when initiating the project in Dactryl or your AI coding tool:

```text
You are an expert Senior iOS Engineer. I am uploading 4 comprehensive specification files for the "Mount Kalisungan Tourist Tracking & Safety System".

Your goal is to build a production-grade, native iOS app using SwiftUI, MapKit, CoreLocation, ActivityKit, and Supabase Swift SDK based exactly on these specifications.

Key requirements to follow:
1. Strict adherence to the fee calculation logic (₱800 per 8 pax guide, ₱30 registration fee, ₱100/hr peak extension, ₱500 emergency horse).
2. End Session Flow: Verify headcount -> Check online vs onsite payment -> If cash, calculate cash tendered and return change -> Mark booking/session completed.
3. 2D/3D MapKit tracking with offline capability and checkpoint geofencing.
4. Native AVFoundation QR scanner for trailhead permit verification.
5. Clean MVVM architecture with @Observable / ObservableObject.

Please ingest the attached specification files and guide me step-by-step in generating the complete Xcode SwiftUI project.
```
