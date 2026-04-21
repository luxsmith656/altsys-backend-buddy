# GPS & Path Recording + ML Predictive System Summary

**Date**: April 20, 2026  
**Project**: Mount Kalisungan Visitor Tracking System

---

## Executive Summary

This system combines two complementary ML/analytics pipelines:

### **Pipeline 1: GPS Path Enhancement** 
Transforms raw, noisy GPS points into accurate hiking paths through filtering, elevation correction, and trail snapping.

### **Pipeline 2: Predictive Analytics**
Learns from accumulated hike data to predict visitor counts, hiking times, and optimal scheduling.

Together, they create a system that **continuously improves as users hike**, providing better safety, recommendations, and trail insights over time.

---

## Part 1: GPS & Path Recording Enhancement

### Problem Statement

Raw GPS data from smartphones is noisy and unreliable:
- **±5-20m horizontal error** from multipath reflections
- **±10-50m vertical error** in altitude (especially under tree canopy)
- **Signal drops** in dense forest or valleys
- **Device variance** — different phones different accuracy

**Mount Kalisungan specifics**:
- Dense tropical forest canopy blocks ~40% of GPS signal
- High elevation changes confuse altitude sensors
- Rocky terrain causes multipath reflections
- Mix of Android/iOS devices with different chipsets

### Solution Architecture

```
INPUT: Raw GPS Points (lat, lng, altitude, accuracy, timestamp)
  ↓
[Layer 1] Quality Assessment
  └─ Score GPS reliability (0-1 scale)
  └─ Flag degraded periods
  └─ Alert hikers if signal too weak
  ↓
[Layer 2] Kalman Filtering
  └─ Remove noise & outliers
  └─ Preserve real movements
  └─ Output: Smooth trajectory
  ↓
[Layer 3] Elevation Correction
  └─ Blend GPS + Digital Elevation Model (DEM)
  └─ Use barometric pressure if available
  └─ Fix ±15m altitude errors → ±2m
  ↓
[Layer 4] Map Matching
  └─ Snap points to known trail geometry
  └─ Detect genuine off-trail events
  └─ Confidence-based snapping
  ↓
[Layer 5] Trail Analysis
  └─ Extract segment characteristics
  └─ Calculate elevation gain / difficulty
  └─ Identify hazards
  └─ Build trek knowledge database
  ↓
OUTPUT: Export-Ready Path
  └─ GeoJSON (web display)
  └─ GPX (Garmin, Strava import)
  └─ KML (Google Earth)
  └─ Public sharing (optional)
```

### Database Tables for GPS Enhancement

| Table | Purpose | Records Size |
|-------|---------|---|
| `hiker_location_raw` | Raw unfiltered GPS points | 1KB per point (~6MB per 1hr hike) |
| `gps_quality_metrics` | Quality scores + signal assessment | 1 record per 5min |
| `smoothed_trajectory` | Filtered + corrected path | 90% fewer points than raw |
| `elevation_corrections` | DEM + barometric blending | 1 record per segment |
| `off_trail_detection` | Safety alerts for deviations | Only when off-trail |
| `trail_segment_analysis` | Segment timing & difficulty | Grows with hike data |
| `path_export_ready` | Multi-format ready exports | 1 record per session |

### Key Features

#### 1. **Kalman Filtering**
- **Algorithm**: Standard Kalman filter for 2D position tracking
- **Effect**: Removes 80-95% of GPS noise while keeping real turns
- **Parameters**: Configurable process/measurement noise
- **Result**: Smooth, natural-looking path

#### 2. **Elevation Correction**
```
Blended Altitude = 
  0.4 × GPS altitude (live data, noisy)
  + 0.4 × DEM altitude (reference, accurate)
  + 0.2 × Barometric (if phone has sensor)
```
- **Source 1**: USGS Elevation API (free)
- **Source 2**: Barometric pressure formula (device sensor)
- **Result**: ±2m altitude accuracy (vs ±15m raw)

#### 3. **Map Matching**
- **Input**: Smoothed GPS trajectory
- **Process**: Find closest point on trail geometry
- **Threshold**: Only snap if ≤30m from trail (not actual deviation)
- **Output**: Accurate trail centerline path
- **Benefit**: Removes final ~2-3m error from GPS

#### 4. **Off-Trail Detection**
Real-time alerts when hikers deviate > threshold:
```
50-150m off-trail: Log event (could be GPS noise)
150m+ off-trail:   Alert hiker + ranger
300m+ off-trail + sustained: Emergency alert
```

#### 5. **Trail Segment Learning**
Accumulates segment data from all hikes:
```
After 100 hikes:
  ✓ Segment timing ±10%
  ✓ Hazard identification
  ✓ Difficulty assessment

After 1000 hikes:
  ✓ Demographic breakdowns (fitness level, age)
  ✓ Optimal routing algorithms
  ✓ Micro-variation mapping
```

### Quality Metrics

| Metric | Before | After | Target |
|--------|--------|-------|--------|
| Horizontal Accuracy | ±8m | ±2-3m | ±2m |
| Vertical Accuracy | ±15m | ±2m | ±2m |
| Path Smoothness | Jagged | Natural curves | Human-like |
| Off-trail Detection | Unknown | ±40m precision | ±30m |

---

## Part 2: Predictive ML Analytics

### Problem Statement

**Decision making for hikers**:
- "Will it be crowded?" 
- "How long will it take me?"
- "What's the best time to start?"

**Without data**: Guesswork + anecdotes  
**With ML**: Scientific predictions improving daily

### Three Predictive Models

#### **Model 1: Visitor Count Predictor**

**Purpose**: Forecast daily/weekly/monthly visitor volume

**Inputs**:
- Historical visitor counts (from bookings)
- Day-of-week patterns
- Seasonality (dry vs wet season)
- Weather forecast
- Holidays/weekends

**Output**:
```json
{
  "predicted_visitors_today": 65,
  "confidence": 0.87,
  "range_95_ci": [52, 78],
  "crowd_level": "medium",
  "peak_hour": "11:00-14:00"
}
```

**Algorithm**:
- **Months 1-3**: ARIMA (time-series baseline)
- **Months 4+**: XGBoost (captures non-linearities)
- **Error target**: <10% MAE

---

#### **Model 2: Hiking Duration Predictor**

**Purpose**: Estimate time-to-peak and descent time

**Inputs**:
- Hiker fitness level
- Group size
- Trail difficulty
- Weather conditions
- Trail condition (muddy, rocky, etc.)

**Output**:
```json
{
  "estimated_time_to_peak": 125,
  "confidence": 0.82,
  "range": [95, 155],
  "estimated_descent": 75,
  "total_duration": 200
}
```

**Training Data Source**: `hiking_duration_records` table  
**Algorithm**: Gradient Boosting or Linear Regression  
**Error target**: < 20 min RMSE

---

#### **Model 3: Peak Time Forecaster**

**Purpose**: Recommend optimal start time to avoid crowds

**Inputs**:
- Historical arrival patterns
- Booking distribution
- Day of week
- Weather

**Output**:
```json
{
  "peak_occupancy_window": "10:00-14:00",
  "recommended_start_time": "05:30 AM",
  "expected_crowd_level": "light",
  "confidence": 0.89
}
```

**Algorithm**: K-means clustering on arrival times + forecasting  
**Success Metric**: 20%+ adoption rate of recommendations

---

### ML Data Collection Pipeline

```
Live Data
├─ Daily visitor counts → daily_visitor_counts
├─ Hourly traffic → hourly_visitor_traffic
├─ Completed hikes → hiking_duration_records
├─ Demographics → visitor_demographics
├─ Weather data → visitor_demographics
└─ Trail reports → visitor_demographics
    ↓
Feature Engineering
├─ Extract trending patterns
├─ Calculate seasonality
├─ Compute rolling averages
└─ Aggregate by trail/day
    ↓
Training Data
├─ 60-90 days minimum for initial model
├─ 1+ year for seasonal patterns
└─ Growing = better predictions
    ↓
Model Training
├─ Daily data adds-up
├─ Weekly retraining
├─ Monthly hyperparameter tuning
└─ Auto-deploy if improves by 5%+
```

### Recommendation Engine

Combines all model outputs:

```python
def generate_hiker_recommendation(hiker_id, date, trail_id):
    visitor_pred = get_visitor_prediction(trail_id, date)
    duration_pred = get_duration_prediction(hiker_id, trail_id)
    peak_forecast = get_peak_time_forecast(trail_id, date)
    
    recommendation = {
        'recommended_date': date,
        'recommended_time': peak_forecast.best_start_time,
        'reason': f"{visitor_pred.crowd_level} crowd expected",
        'expected_duration': duration_pred.total_duration,
        'confidence': avg([
            visitor_pred.confidence,
            duration_pred.confidence,
            peak_forecast.confidence
        ])
    }
    
    return recommendation
```

### Continuous Improvement Via Feedback

```
1. Show recommendation to hiker
2. Hiker acts (books, ignores, dismisses)
3. Record feedback in recommendation_feedback table
4. Periodically recompute model using feedback as training signal
5. Models get better at identifying good recommendations
```

---

## Combined System: GPS + ML

### How They Work Together

```
Hiker starts trail
    ├─ GPS data collected (raw_location)
    ├─ Quality assessed (gps_quality_metrics)
    ├─ Path filtered (smoothed_trajectory)
    └─ Alerts triggered if off-trail
         ↓
Hike completes
    ├─ Extract hiking_duration_records
    ├─ Calculate segment timing
    ├─ Update trail_segment_analysis
    └─ Feed training data to ML models
         ↓
Models retrain weekly
    ├─ Visitor counts improve
    ├─ Duration predictions refine
    ├─ Peak times discovered
    └─ Recommendations get better
         ↓
Next hiker sees improved recommendations
    └─ Cycle repeats (virtuous loop)
```

### Growth Timeline

| Period | GPS Accuracy | ML Accuracy | Key Milestones |
|--------|---|---|---|
| Month 1-2 | Raw (±8m) | N/A (not enough data) | Data collection begins |
| Month 3-4 | Filtered (±4m) | Baseline model deployed | First predictions generated |
| Month 5-6 | Corrected (±2m) | ±20% error | Peak forecaster activated |
| Month 7-12 | Export-ready | ±15% error | Recommendations shown |
| Year 2+ | Real-time optimized | ±10% error | Automatic retraining active |

---

## Implementation Roadmap

### Phase 1: GPS Foundations (Weeks 1-4)
- [ ] Deploy new GPS tables to Supabase
- [ ] Implement real-time quality scoring
- [ ] Add Kalman filter to frontend
- [ ] Test with 10 beta hikers

### Phase 2: Enhancement (Weeks 5-8)
- [ ] Integrate DEM elevation API
- [ ] Implement map matching
- [ ] Add off-trail detection alerts
- [ ] Collect 50+ complete hike sessions

### Phase 3: ML Baseline (Weeks 9-12)
- [ ] Train visitor count predictor (ARIMA)
- [ ] Deploy as Supabase Edge Function
- [ ] Display predictions on booking page
- [ ] Collect user feedback

### Phase 4: Advanced ML (Months 4-6)
- [ ] Train hiking duration model
- [ ] Implement peak time forecaster
- [ ] Build recommendation engine
- [ ] A/B test recommendation impact

### Phase 5: Optimization (Months 7+)
- [ ] Migrate to external ML service if needed (AWS SageMaker, etc.)
- [ ] Advanced algorithms (LSTM, Neural Networks)
- [ ] Real-time retraining pipeline
- [ ] Multi-year seasonal analysis

---

## Key Performance Indicators (KPIs)

### GPS Quality
- **Horizontal error ≤2-3m**: 90%+ of points
- **Vertical error ≤2m**: 80%+ of points
- **Off-trail detection precision**: ±40m
- **Export quality score > 0.9**: 95%+ sessions

### ML Prediction Accuracy
- **Visitor count MAE < 10%**: Daily error rate
- **Hiking time RMSE < 20min**: Duration predictions
- **Peak hour ±1 hour**: 80%+ accuracy
- **Recommendation CTR > 15%**: User engagement

### System Health
- **Off-trail alert response < 5min**: Ranger reaction
- **Model retraining weekly**: Automation
- **Data collection > 95% hikes**: Session completeness
- **GPS export success > 99%**: Multi-format availability

---

## Technical Stack

### Frontend (React/TypeScript)
- Leaflet for map display
- Real-time GPS collection
- Kalman filter (TensorFlow.js)
- Local caching (IndexedDB)

### Backend (Supabase)
- PostgreSQL for all data storage
- Edge Functions for model serving
- Real-time subscriptions for live tracking
- Row-level security for privacy

### External APIs
- USGS Elevation API (free tier)
- Google Maps Elevation (optional, paid)
- Weather API (e.g., OpenWeatherMap)

### ML Tools (Recommended)
- **Phase 1**: scikit-learn (local Python)
- **Phase 2**: Supabase Edge Functions (Deno)
- **Phase 3+**: AWS SageMaker or Google Cloud AI

---

## Privacy & Security

✓ **GPS data**: Only stored per-session, deleted after export  
✓ **Shared paths**: Anonymous tokens (not linked to user ID)  
✓ **ML predictions**: Aggregated (no individual profiling)  
✓ **Real-time alerts**: Only sent to user + ranger (not public)  
✓ **Trail data**: Opt-in public sharing (user controls visibility)

---

## Success Metrics Timeline

**Month 3**: First visitor predictions deployed  
**Month 6**: ±15% prediction error achieved  
**Month 9**: 20%+ recommendation adoption  
**Year 1**: ±10% error, automatic retraining active  
**Year 2**: Multi-year patterns discovered, cross-seasonal recommendations  
**Year 3+**: Near real-time learning, adaptive routing

---

## References & Resources

### GPS Filtering
- Kalman Filter: https://kalman-filter.com/
- GPS Accuracy: https://www.gpsworld.com/what-exactly-is-gps-accuracy/
- Map Matching: https://en.wikipedia.org/wiki/Map_matching

### Time-Series ML
- ARIMA: https://otexts.com/fpp2/arima.html
- XGBoost: https://xgboost.readthedocs.io/
- Prophet: https://facebook.github.io/prophet/

### APIs
- USGS Elevation: https://nationalmap.gov/epqs/
- Google Elevation: https://developers.google.com/maps/documentation/elevation
- OpenWeatherMap: https://openweathermap.org/api

