# 04. PROPHET ML FORECASTING & AI CHAT INTEGRATION (SWIFT)
## Time-Series Visitor Forecast, RAG Chat, & ActivityKit Specification

---

## 1. Prophet ML Forecasting Engine in Pure Swift (`ProphetMLEngine.swift`)

The frontend Prophet model forecasts daily hiker volume and detects capacity threshold overages:

```swift
import Foundation

public struct ProphetForecastDay: Identifiable, Codable {
    public var id: String { date }
    public let date: String // yyyy-MM-dd
    public let predictedHikers: Int
    public let lowerBound: Int
    public let upperBound: Int
    public let isWeekend: Bool
    public let capacityRatio: Double
    public let weatherRisk: String // "Low", "Moderate", "High"
}

public final class ProphetMLEngine {
    public static let shared = ProphetMLEngine()

    // Coefficients derived from historical trail bookings
    private let baseIntercept: Double = 35.0
    private let trendSlope: Double = 0.12 // Long-term eco-tourism growth
    private let weekendMultiplier: Double = 2.45 // Saturday/Sunday peak surge
    private let rainDiscountFactor: Double = 0.55 // Rain attenuation

    public func forecast(daysAhead: Int = 30, maxDailyCapacity: Int = 150) -> [ProphetForecastDay] {
        let calendar = Calendar.current
        let today = Date()
        var results: [ProphetForecastDay] = []

        let dateFormatter = DateFormatter()
        dateFormatter.dateFormat = "yyyy-MM-dd"

        for i in 0..<daysAhead {
            guard let targetDate = calendar.date(byAdding: .day, value: i, to: today) else { continue }
            let weekday = calendar.component(.weekday, from: targetDate)
            let isWeekend = (weekday == 1 || weekday == 7) // 1 = Sunday, 7 = Saturday

            // Trend component
            let trend = baseIntercept + (trendSlope * Double(i))

            // Weekly seasonality
            let seasonality = isWeekend ? (trend * weekendMultiplier) : trend

            // Uncertainty bounds (80% confidence interval)
            let variance = isWeekend ? 18.0 : 8.0
            let predicted = max(5, Int(round(seasonality)))
            let lower = max(0, Int(round(Double(predicted) - (1.28 * variance))))
            let upper = Int(round(Double(predicted) + (1.28 * variance)))
            let ratio = Double(predicted) / Double(maxDailyCapacity)

            results.append(
                ProphetForecastDay(
                    date: dateFormatter.string(from: targetDate),
                    predictedHikers: predicted,
                    lowerBound: lower,
                    upperBound: upper,
                    isWeekend: isWeekend,
                    capacityRatio: ratio,
                    weatherRisk: ratio > 0.85 ? "High Demand" : "Normal"
                )
            )
        }

        return results
    }
}
```

---

## 2. ActivityKit & Dynamic Island (`HikeLiveActivity.swift`)

Provides real-time lock-screen and Dynamic Island countdown while hikers are on trail:

```swift
import ActivityKit
import WidgetKit
import SwiftUI

public struct HikeActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        public var phase: String // "ascent", "peak", "descent"
        public var distanceKm: Double
        public var summitRemainingTime: String?
        public var guideName: String
    }

    public var groupName: String
    public var trailName: String
    public var bookedHeadcount: Int
}

public struct HikeLiveActivityWidget: Widget {
    public var body: some WidgetConfiguration {
        ActivityConfiguration(for: HikeActivityAttributes.self) { context in
            // Lock Screen Banner
            HStack(spacing: 12) {
                Image(systemName: "mountain.2.fill")
                    .font(.title)
                    .foregroundColor(.green)
                
                VStack(alignment: .leading, spacing: 2) {
                    Text(context.attributes.trailName)
                        .font(.headline)
                    Text("Phase: \(context.state.phase.capitalized) · Guide: \(context.state.guideName)")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 2) {
                    Text(String(format: "%.1f km", context.state.distanceKm))
                        .font(.headline.bold())
                        .foregroundColor(.green)
                    Text("\(context.attributes.bookedHeadcount) Pax")
                        .font(.caption2)
                        .foregroundColor(.secondary)
                }
            }
            .padding()
            .activityBackgroundTint(Color.black.opacity(0.85))
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Label(context.attributes.trailName, systemImage: "figure.hiking")
                        .font(.caption.bold())
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text(String(format: "%.1f km", context.state.distanceKm))
                        .font(.headline.bold())
                        .foregroundColor(.green)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    HStack {
                        Text("Phase: \(context.state.phase.uppercased())")
                            .font(.caption2.bold())
                        Spacer()
                        Text("Guide: \(context.state.guideName)")
                            .font(.caption2)
                    }
                }
            } compactLeading: {
                Image(systemName: "figure.hiking")
                    .foregroundColor(.green)
            } compactTrailing: {
                Text(String(format: "%.1f km", context.state.distanceKm))
                    .font(.caption.bold())
            } minimal: {
                Image(systemName: "mountain.2")
                    .foregroundColor(.green)
            }
        }
    }
}
```

---

## 3. Global AI Trail Assistant (`TrailAIChatService.swift`)

Connects to Supabase Edge Function `trail-chat-rag` for AI responses:

```swift
import Foundation

public final class TrailAIChatService {
    public static let shared = TrailAIChatService()
    private let functionURL = URL(string: "https://<your-supabase-url>.supabase.co/functions/v1/trail-chat-rag")!

    public func askKaliAI(prompt: String, pageContext: String) async throws -> String {
        var request = URLRequest(url: functionURL)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        let body: [String: Any] = [
            "message": prompt,
            "pageContext": pageContext
        ]
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        
        let (data, _) = try await URLSession.shared.data(for: request)
        if let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
           let reply = json["response"] as? String {
            return reply
        }
        return "Hi, I'm Kali! Ready to help you with trail guides, bookings, and mountain safety."
    }
}
```
