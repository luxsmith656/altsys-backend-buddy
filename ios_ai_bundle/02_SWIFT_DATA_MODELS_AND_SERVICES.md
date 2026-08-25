# 02. SWIFT DATA MODELS & BACKEND SERVICES SPECIFICATION
## Native Swift 5.9+ / iOS 17+ Implementation

---

## 1. Swift Codable Data Models

### 1.1. `Booking.swift`
```swift
import Foundation

public struct Booking: Identifiable, Codable, Equatable {
    public let id: UUID
    public let userId: UUID?
    public let locationId: UUID?
    public var bookingDate: String
    public var hikeTime: String?
    public var groupSize: Int
    public var status: String // pending, confirmed, cancelled, adjustment_pending, completed
    public var paymentStatus: String // unpaid, partial, paid
    public var paymentMethod: String? // onsite, gcash, bank_transfer
    public var totalAmount: Double
    public var emergencyContactName: String?
    public var emergencyContactPhone: String?
    public var notes: String?
    public let createdAt: Date?
    public var updatedAt: Date?

    enum CodingKeys: String, CodingKey {
        case id
        case userId = "user_id"
        case locationId = "location_id"
        case bookingDate = "booking_date"
        case hikeTime = "hike_time"
        case groupSize = "group_size"
        case status
        case paymentStatus = "payment_status"
        case paymentMethod = "payment_method"
        case totalAmount = "total_amount"
        case emergencyContactName = "emergency_contact_name"
        case emergencyContactPhone = "emergency_contact_phone"
        case notes
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }

    public var parsedMeta: BookingMeta {
        guard let notes = notes, let data = notes.data(using: .utf8) else {
            return BookingMeta()
        }
        return (try? JSONDecoder().decode(BookingMeta.self, from: data)) ?? BookingMeta()
    }
}
```

### 1.2. `BookingMeta.swift`
```swift
import Foundation

public struct CompanionDetail: Codable, Equatable {
    public var name: String
    public var age: String?
    public var sex: String?
    public var nationality: String?
    public var city: String?
}

public struct BookingMeta: Codable, Equatable {
    public var fullName: String?
    public var phoneNumber: String?
    public var emailAddress: String?
    public var age: String?
    public var sex: String?
    public var nationality: String?
    public var province: String?
    public var city: String?
    public var hikeType: String? // "day" or "night"
    public var hikeTime: String? // "06:00 AM"
    public var companions: [String]?
    public var companionDetails: [CompanionDetail]?
    public var hasMinors: Bool?
    public var minorCount: Int?
    public var medicalNotes: String?
    public var preferredGuide: String?
    public var assignedGuide: String?
    public var assignedGuideId: String?
    public var assignedTrailName: String?
    public var assignedTrailZoneId: String?
    public var onsiteStartConfirmed: Bool?
    public var onsiteStartTime: String?
    public var groupPhase: String? // "ascent", "peak", "descent", "completed"
    public var peakReachedAt: String?
    public var peakDeadlineAt: String?
    public var peakExtensionHours: Int?
    public var peakExtensionFee: Double?
    public var emergencyHorseCount: Int?
    public var emergencyHorseFee: Double?
    public var hikeCompletedAt: String?
    public var paymentStatus: String?
    public var paymentMethod: String?
    public var amountPaid: Double?
    public var cashTendered: Double?
    public var changeReturned: Double?
    public var paymentSettledAt: String?
    public var paymentSettledBy: String?
    public var transactionId: String?

    public init() {}
}
```

### 1.3. `HikerSession.swift` & `HikerLocation.swift`
```swift
import Foundation

public struct HikerSession: Identifiable, Codable, Equatable {
    public let id: UUID
    public var clientSessionId: String?
    public let userId: UUID?
    public let bookingId: UUID?
    public let locationId: UUID?
    public var trailZoneId: UUID?
    public var participantRole: String // "hiker", "guide", "ranger"
    public var trackingPhase: String // "ascent", "peak", "descent", "completed"
    public var startTime: Date?
    public var endTime: Date?
    public var status: String // "active", "completed", "cancelled"
    public var totalDistanceKm: Double

    enum CodingKeys: String, CodingKey {
        case id
        case clientSessionId = "client_session_id"
        case userId = "user_id"
        case bookingId = "booking_id"
        case locationId = "location_id"
        case trailZoneId = "trail_zone_id"
        case participantRole = "participant_role"
        case trackingPhase = "tracking_phase"
        case startTime = "start_time"
        case endTime = "end_time"
        case status
        case totalDistanceKm = "total_distance_km"
    }
}

public struct HikerLocation: Identifiable, Codable {
    public let id: Int?
    public let sessionId: UUID
    public let latitude: Double
    public let longitude: Double
    public let altitude: Double?
    public let accuracy: Double?
    public let speedMS: Double?
    public let heading: Double?
    public let segment: String?
    public let timestamp: Date?

    enum CodingKeys: String, CodingKey {
        case id
        case sessionId = "session_id"
        case latitude, longitude, altitude, accuracy
        case speedMS = "speed_m_s"
        case heading, segment, timestamp
    }
}
```

---

## 2. Business Logic Services in Swift

### 2.1. `PaymentCalculationService.swift`
```swift
import Foundation

public struct FeeBreakdown {
    public let groupSize: Int
    public let regFeePerPerson: Double = 30.0
    public let guideFeePerUnit: Double = 800.0
    public let maxPaxPerGuide: Int = 8
    public let guidesNeeded: Int
    public let guideFee: Double
    public let totalRegFee: Double
    public let peakExtensionHours: Int
    public let peakExtensionFee: Double
    public let emergencyHorseCount: Int
    public let emergencyHorseFee: Double
    public let baseTotalFee: Double
    public let grandTotalFee: Double
}

public final class PaymentCalculationService {
    public static let shared = PaymentCalculationService()

    public func calculateFees(
        groupSize: Int,
        peakHours: Int = 0,
        horseCount: Int = 0
    ) -> FeeBreakdown {
        let size = max(1, groupSize)
        let guidesNeeded = Int(ceil(Double(size) / 8.0))
        let guideFee = Double(guidesNeeded) * 800.0
        let totalRegFee = Double(size) * 30.0
        let peakFee = Double(max(0, peakHours)) * 100.0
        let horseFee = Double(max(0, horseCount)) * 500.0
        let baseTotal = totalRegFee + guideFee
        let grandTotal = baseTotal + peakFee + horseFee

        return FeeBreakdown(
            groupSize: size,
            guidesNeeded: guidesNeeded,
            guideFee: guideFee,
            totalRegFee: totalRegFee,
            peakExtensionHours: peakHours,
            peakExtensionFee: peakFee,
            emergencyHorseCount: horseCount,
            emergencyHorseFee: horseFee,
            baseTotalFee: baseTotal,
            grandTotalFee: grandTotal
        )
    }

    public func calculateChange(cashTendered: Double, totalDue: Double, alreadyPaid: Double = 0.0) -> (balanceDue: Double, change: Double, isSufficient: Bool) {
        let balanceDue = max(0.0, totalDue - alreadyPaid)
        let change = cashTendered - balanceDue
        return (balanceDue: balanceDue, change: max(0.0, change), isSufficient: cashTendered >= balanceDue)
    }

    public func formatPeso(_ amount: Double) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencySymbol = "₱"
        formatter.maximumFractionDigits = 2
        formatter.minimumFractionDigits = 0
        return formatter.string(from: NSNumber(value: amount)) ?? "₱\(Int(amount))"
    }
}
```

### 2.2. `LocationTrackingService.swift` (CoreLocation Background GPS)
```swift
import Foundation
import CoreLocation
import Combine

public final class LocationTrackingService: NSObject, ObservableObject, CLLocationManagerDelegate {
    public static let shared = LocationTrackingService()

    private let locationManager = CLLocationManager()
    @Published public var currentLocation: CLLocation?
    @Published public var isTracking = false
    @Published public var totalDistanceMeters: Double = 0.0
    private var lastLocation: CLLocation?

    public override init() {
        super.init()
        locationManager.delegate = self
        locationManager.desiredAccuracy = kCLLocationAccuracyBestForNavigation
        locationManager.distanceFilter = 5.0 // 5 meters update
        locationManager.allowsBackgroundLocationUpdates = true
        locationManager.pausesLocationUpdatesAutomatically = false
    }

    public func requestPermissions() {
        locationManager.requestAlwaysAuthorization()
    }

    public func startTracking(sessionId: UUID) {
        isTracking = true
        totalDistanceMeters = 0.0
        lastLocation = nil
        locationManager.startUpdatingLocation()
    }

    public func stopTracking() {
        isTracking = false
        locationManager.stopUpdatingLocation()
    }

    public func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let location = locations.last, isTracking else { return }
        currentLocation = location

        if let last = lastLocation {
            let delta = location.distance(from: last)
            if delta > 3.0 && location.horizontalAccuracy < 20.0 {
                totalDistanceMeters += delta
            }
        }
        lastLocation = location
    }
}
```
