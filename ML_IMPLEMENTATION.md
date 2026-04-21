# Machine Learning Implementation Guide

## Part 1: GPS & Path Recording Enhancement

### Overview

The GPS infrastructure improves path accuracy through multi-layer filtering and correction:

```
Raw GPS Data
    ↓
Quality Assessment (Is signal good?)
    ↓
Kalman Filter (Remove noise & jumps)
    ↓
Elevation Correction (Fix altitude errors)
    ↓
Map Matching (Snap to known trails)
    ↓
Smoothed Trajectory (Display-ready path)
    ↓
Export Ready (GPX, KML, GeoJSON)
```

---

## GPS Quality Management

### Why GPS Needs Enhancement

**GPS is noisy** due to:
- **Multipath errors**: Signals bouncing off rocks/trees (±5-20m)
- **Atmospheric interference**: Rain, thick canopy reduces signal (±10-50m)
- **Poor satellite geometry**: Few satellites visible = worse accuracy
- **Device variance**: Different phones/chipsets have different accuracy
- **Cold start**: First fix takes time, accuracy improves over seconds

**Mount Kalisungan challenges**:
- Dense forest canopy blocks signals → lower accuracy under trees
- Valley environment causes multipath reflections
- Highly variable elevation → poor barometric pressure estimates
- Mix of Android/iOS devices with different GPS chipsets

### Quality Scoring Algorithm

```
Raw Accuracy = device_reported_accuracy_m

Signal Quality Score (0-1):
  satellites_visible / 24  (max visible ≈ 12-24)
  × signal_strength_dbm / (-130)  (stronger = closer to 0 dBm)
  × (1 - points_above_100m_error / total_points)

Final Quality Score = Raw Accuracy / 100
  × Signal Quality Score
  × (1 - time_since_last_good_fix / 300_seconds)

Quality Status:
  1.0          = excellent (< 2m error)
  0.7-0.99     = good (2-5m)
  0.5-0.69     = fair (5-15m)
  0.3-0.49     = poor (15-50m)
  < 0.3        = degraded (> 50m, not reliable)
```

### Real-time Monitoring

```typescript
// Send quality alerts to hiker
if (quality_status === 'degraded') {
  showAlert("GPS signal weak. Move to open area.");
}

if (max_distance_from_trail > 100) {
  showAlert("You're 100m off trail. Course correction recommended.");
}

if (satellite_count < 5) {
  showAlert("Weak GPS. Switch to offline map mode.");
}
```

---

## Kalman Filtering for Path Smoothing

### What It Does

Kalman filter removes GPS noise while preserving real movements:

```
Before: [1000m, 1003m, 998m, 2050m (jump), 1005m, 1002m, ...]
After:  [1000m, 1001m, 1002m, 1003m (rejected jump), 1004m, ...]
```

### Implementation Concept

```python
def kalman_filter_gps_path(raw_points, process_noise=0.01, measurement_noise=25):
    """
    Kalman filter for GPS trajectory smoothing
    
    Args:
        raw_points: List of (lat, lng, accuracy_m) tuples
        process_noise: How much we expect position to change (m²)
        measurement_noise: GPS measurement accuracy (m²)
    
    Returns:
        smoothed_points: Filtered trajectory
    """
    smoothed = []
    x_prev = raw_points[0]  # Start state
    P_prev = measurement_noise  # Initial uncertainty
    
    for i, (lat, lng, accuracy) in enumerate(raw_points):
        # Predict: Where should we be?
        if i > 0:
            velocity = (raw_points[i] - raw_points[i-1]) / time_delta
            x_pred = x_prev + velocity * time_delta
        else:
            x_pred = x_prev
        
        P_pred = P_prev + process_noise
        
        # Update: Combine prediction with measurement
        K = P_pred / (P_pred + accuracy²)  # Kalman gain
        x_updated = x_pred + K * (raw_points[i] - x_pred)
        P_updated = (1 - K) * P_pred
        
        smoothed.append(x_updated)
        x_prev = x_updated
        P_prev = P_updated
    
    return smoothed
```

### Parameters

- **Process Noise** (Q): How much position can change between measurements
  - Small→ trusts previous position more (rejects real turns)
  - Large → trusts raw GPS more (keeps noise)
  - **Recommended**: 0.01-0.1 m²/s

- **Measurement Noise** (R): Device GPS accuracy
  - Use device's reported `accuracy_m` when available
  - Fallback to 10m for unknown devices
  - **Recommended**: 5-50 m²

### Acceptance Criteria

```
Distance jump between consecutive points:
  IF > 3 × average_speed × time_delta:
    REJECT (likely outlier)
    Use interpolation or skip
  
Vertical jump (altitude):
  IF > 50m between consecutive points:
    FLAG (requires barometric correction)
```

---

## Elevation Correction

### The Problem

GPS altitude is unreliable (±5-15m error typical):

```
Raw GPS path:
  Point 1: alt = 280m (actual 280m)
  Point 2: alt = 285m (actual 300m) ← GPS error
  Point 3: alt = 295m (actual 310m) ← GPS error
  Point 4: alt = 320m (actual 320m)
  Point 5: alt = 310m (actual 315m) ← GPS error
```

### Correction Method

**Blend three sources**:

```
corrected_altitude = 
  0.4 × gps_altitude  (GPS is noisy but real-time)
  + 0.4 × dem_altitude  (DEM is accurate but generic)
  + 0.2 × barometric_altitude  (Good if phone has barometer)
```

### Step 1: Get DEM Data

Digital Elevation Model provides accurate altitude for any lat/lng:

```python
import requests

def get_dem_altitude(latitude, longitude):
    """Query USGS elevation API"""
    url = f"https://nationalmap.gov/epqs/pqs.php"
    params = {
        'x': longitude,
        'y': latitude,
        'units': 'Meters',
        'output': 'json'
    }
    
    response = requests.get(url, params=params)
    data = response.json()
    
    if data['status'] == 'OK':
        return float(data['value'])
    return None

# Or use Google Maps Elevation API (paid)
def get_elevation_google(lat, lng, api_key):
    url = f"https://maps.googleapis.com/maps/api/elevation/json"
    params = {'locations': f'{lat},{lng}', 'key': api_key}
    response = requests.get(url, params=params)
    return response.json()['results'][0]['elevation']
```

### Step 2: Apply Kalman to Altitude Series

```python
def correct_elevation(gps_points, dem_provider, temp_c=25):
    """
    Correct elevation using DEM + barometric pressure
    """
    corrected = []
    
    for point in gps_points:
        # Get DEM altitude
        dem_alt = dem_provider.get_altitude(
            point['lat'], 
            point['lng']
        )
        
        # Blend GPS + DEM
        blended = (
            0.4 * point['altitude'] +
            0.4 * dem_alt
        )
        
        # If device has barometric sensor
        if 'pressure_pa' in point:
            # Barometric formula
            baro_alt = 44330 * (
                1 - (point['pressure_pa'] / 101325) ** (1/5.255)
            )
            blended = 0.8 * blended + 0.2 * baro_alt
        
        corrected.append(blended)
    
    return corrected
```

---

## Map Matching (Snap to Trail)

### Purpose

After filtering, snap smoothed points to known trail:

```
Before:  Hiker drifts 10m left of trail (due to GPS error)
After:   Points snapped to actual trail centerline
```

### Algorithm

```python
def map_match_to_trail(smoothed_trajectory, trail_geometry, max_distance_m=30):
    """
    Snap GPS trajectory to trail using map matching
    """
    matched_path = []
    
    for point in smoothed_trajectory:
        # Find closest point on trail
        closest = find_nearest_point_on_trail(
            point,
            trail_geometry
        )
        
        distance_to_trail = haversine(point, closest)
        
        # Only snap if close enough (not actually off-trail)
        if distance_to_trail < max_distance_m:
            matched_path.append(closest)
        else:
            # Keep original point (hiker is genuinely off-trail)
            matched_path.append(point)
    
    return matched_path

def find_nearest_point_on_trail(gps_point, trail_linestring):
    """Find closest point on LineString geometry"""
    # Using shapely geometry
    from shapely.geometry import Point, LineString
    
    p = Point(gps_point['lng'], gps_point['lat'])
    nearest = trail_linestring.interpolate(
        trail_linestring.project(p)
    )
    
    return {'lat': nearest.y, 'lng': nearest.x}
```

---

## Off-Trail Detection & Alerts

### How It Works

```
FOR each point in smoothed_trajectory:
  distance_to_nearest_trail = calculate_distance(point, trail_geometry)
  
  IF distance > THRESHOLD (e.g., 100m):
    IF duration > 2 minutes:
      trigger_alert(user, message="You are off-trail")
      send_to_ranger_dashboard()
```

### Severity Levels

| Distance | Duration | Severity | Action |
|----------|----------|----------|--------|
| 0-50m | Any | Minor | No alert (GPS error) |
| 50-150m | < 2 min | Moderate | Log event, Don't alert |
| 50-150m | > 2 min | Moderate | Send notification |
| 150-300m | Any | Major | Alert user + ranger |
| 300m+ | Any | Critical | Emergency notification |

### Frontend Alert UI
```typescript
const OFF_TRAIL_MESSAGE = "You're off trail! 
  Check your map and return to marked path.
  GPS accuracy: ±${accuracy}m";

if (off_trail_severity === 'critical') {
  // Show bright red warning
  // Option to call ranger
  // Share location with emergency contact
}
```

---

## Trail Segment Analysis

### Building Trail Knowledge Over Time

Each completed hike provides data to improve trail understanding:

```sql
-- Extract segment from completed hike
INSERT INTO trail_segment_analysis (zone_id, ...)
SELECT 
  zone_id,
  generate_segment_id(start_point, end_point),
  EXTRACT(EPOCH FROM (end_point.timestamp - start_point.timestamp))/60 as duration_minutes,
  elevation_rise,
  difficulty_assessment,
  hazards_detected
FROM smoothed_trajectory
WHERE completed_hike_id = $1;
```

### Continuous Improvement

```
After 100 hikes:
  ✓ Accurate segment timing (±10%)
  ✓ Know hazardous sections
  ✓ Identify difficult segments
  ✓ Predict hike duration with 90% confidence

After 1000 hikes:
  ✓ Demographic differences (age, fitness, group size)
  ✓ Seasonal variations
  ✓ Micro-routes (shortcuts, scenic alternatives)
  ✓ Real-time congestion detection
```

---

## Path Export & Sharing

### Multi-Format Export

```typescript
// Prepare export for different platforms
const path_export = {
  geojson: {
    type: "LineString",
    coordinates: [[lng, lat, altitude], ...]
  },
  
  gpx: `<gpx>...</gpx>`,  // For Garmin, Strava, etc.
  
  kml: `<kml>...</kml>`,  // For Google Earth
  
  metadata: {
    distance_m: 12500,
    elevation_gain_m: 620,
    duration_minutes: 180,
    avg_pace: "6.5 min/km"
  }
};
```

### Public Sharing (Optional)

```
Hiker opts to share route publicly:
✓ Anonymous token generated (not linked to user ID)
✓ Can be viewed/downloaded as GPX
✓ Rating/comment system on trail quality
✓ Contributes to trail mapping database
```

---

### Part 2: Predictive ML Models

## Overview of Three Core ML Models

## 9. Machine Learning & Predictive Analytics

```
┌─────────────────────────────────────────────────────────────────┐
│                    Real-World Data Collection                   │
└──────────────┬──────────────────────────────────────────────────┘
               │
               ├─ Booking confirmations → daily_visitor_counts
               ├─ Check-in/check-out logs → hourly_visitor_traffic
               ├─ Completed hikes → hiking_duration_records
               ├─ Weather data, demographics → visitor_demographics
               └─ Manual entry → trail_reports
               │
┌──────────────▼──────────────────────────────────────────────────┐
│                      Feature Engineering                        │
│  (Extract patterns, seasonal effects, day-of-week trends)      │
└──────────────┬──────────────────────────────────────────────────┘
               │
┌──────────────▼──────────────────────────────────────────────────┐
│                   Model Training (Supabase Edge)                │
│ ┌───────────────────┐ ┌──────────────┐ ┌─────────────────┐     │
│ │ Visitor Predictor │ │ Duration ML  │ │ Peak Forecaster │     │
│ │   (ARIMA/XGB)     │ │  (Linear/GB) │ │   (K-means/NN)  │     │
│ └───────────────────┘ └──────────────┘ └─────────────────┘     │
└──────────────┬──────────────────────────────────────────────────┘
               │
┌──────────────▼──────────────────────────────────────────────────┐
│              Model Configuration Storage                        │
│  - model_training_metadata (versions, metrics)                 │
│  - model_retraining_schedule (when to retrain)                 │
└──────────────┬──────────────────────────────────────────────────┘
               │
┌──────────────▼──────────────────────────────────────────────────┐
│              Prediction Output Tables                           │
│  - visitor_predictions                                         │
│  - hiking_duration_predictions                                │
│  - peak_time_forecasts                                        │
└──────────────┬──────────────────────────────────────────────────┘
               │
┌──────────────▼──────────────────────────────────────────────────┐
│          Frontend Display & Recommendations                    │
│  - Show predicted crowd levels during booking                  │
│  - Recommend optimal hiking times                              │
│  - Display time estimates (with confidence ranges)             │
│  - Collect user feedback on recommendations                    │
└──────────────┬──────────────────────────────────────────────────┘
               │
┌──────────────▼──────────────────────────────────────────────────┐
│            Feedback Loop (Continuous Improvement)               │
│  - User ratings on recommendations                              │
│  - Actual vs predicted accuracy tracking                        │
│  - Automatic retraining triggers                                │
└─────────────────────────────────────────────────────────────────┘
```

---

## Data Collection Strategy

### Phase 1: Bootstrap (Months 1-3)
**Goal**: Collect initial training data (minimum 60-90 days)

| Data Source | Collection Method | Frequency |
|---|---|---|
| Daily visitor counts | Auto-aggregate from `bookings` table | Daily at 23:59 |
| Check-in/exit times | Manual scans + GPS tracking | Real-time |
| Completion times | Calculated from `hiker_sessions` start/end | On completion |
| Demographics | Booking form (age, group size, region) | Per booking |
| Weather data | Integration with OpenWeatherMap API | Hourly |
| Trail conditions | Ranger report submissions | Ad-hoc |

**Data Volume Estimate**:
- 30 days × 3 trails × ~50 daily visitors = 4,500 records minimum
- ~100-200 completed hikes per trail for time-series

### Phase 2: Expansion (Months 4-12)
- Reach 1-2 years of data per model
- Capture seasonal patterns (dry season vs wet season)
- Build demographic-specific models

### Phase 3: Optimization (Ongoing)
- Continuous retraining weekly/monthly
- A/B test recommendations
- Incorporate external signal (weather forecasts, holidays)

---

## Model 1: Visitor Count Predictor

### Purpose
Forecast how many hikers will visit each trail on a given date (daily, weekly, monthly).

### Input Features
```
Time-based:
  - Day of week (Mon-Sun)
  - Week of year
  - Month
  - Is holiday (Boolean)
  - Seasons (dry/wet/transition)
  
External:
  - Weather forecast (rain probability, temperature)
  - Trail condition status
  
Historical:
  - Visitor count from similar dates (1 week ago, 1 month ago, 1 year ago)
  - 7-day moving average
  - 30-day moving average
  - Trend (increasing/decreasing/stable)
```

### Output
```
Metadata:
  - Predicted visitor count
  - Confidence score (0.0-1.0)
  - 95% confidence interval [lower_bound, upper_bound]
  - Model version & training date
```

### Recommended Models
1. **ARIMA** (good for seasonal time-series) — Start here
2. **XGBoost** (captures non-linear patterns) — Use after 6 months data
3. **Prophet** (handles seasonality well) — Alternative to ARIMA
4. **LSTM** (deep learning) — Only if data grows significantly

### Implementation Steps
1. **Extract training data** from `daily_visitor_counts`
2. **Create features** (day-of-week, seasonality, weather, etc.)
3. **Train/test split** (80/20 by date — don't shuffle!)
4. **Evaluate** on MAE, RMSE, MAPE
5. **Store results** in `visitor_predictions`
6. **Retrain monthly** with `model_retraining_schedule`

### Success Metrics
- **MAE < 10%** of mean daily visitors (e.g., if avg is 50/day, error < 5)
- **RMSE < 15%** 
- **95% CI coverage > 90%** (actual value falls in predicted range 90% of time)

---

## Model 2: Hiking Duration Predictor

### Purpose
Estimate time-to-peak and descent time based on individual characteristics and conditions.

### Input Features
```
User characteristics:
  - Fitness level (self-reported: beginner/intermediate/advanced)
  - Age group (from demographics)
  
Hike characteristics:
  - Group size
  - Trail selected (elevation, distance)
  - Start time (morning hikers pace differently than afternoon)
  
Environmental:
  - Weather (rainy = slower, clear = faster)
  - Trail condition (muddy, slippery, good)
  - Season
```

### Output
```
Predictions:
  - Estimated time to peak (minutes)
  - Confidence interval [lower, upper] at 95%
  - Estimated descent time
  - Total hike duration
  - Model confidence score
```

### Example Output
```json
{
  "estimated_time_to_peak_minutes": 120,
  "estimated_time_to_peak_lower_bound": 95,
  "estimated_time_to_peak_upper_bound": 145,
  "estimated_time_to_base_minutes": 75,
  "total_duration_minutes": 195,
  "confidence_score": 0.87
}
```

### Recommended Models
1. **Linear Regression** — Start with simple baseline
2. **Random Forest / Gradient Boosting** — Capture interactions
3. **Neural Network** — If >1000 training samples

### Implementation Steps
1. **Populate `hiking_duration_records`** from completed `hiker_sessions`
   - Calculate `time_to_peak_minutes` = peak_reached_at - started_at
   - Calculate `time_to_base_minutes` = completed_at - peak_reached_at
   - Extract fitness level from user profile or infer from historical data
2. **Create features** from `hiking_performance_stats`
3. **Train separate models** for time-to-peak and descent-time
4. **Evaluate** on holdout test set (95th percentile error within 20 min?)
5. **Personalize** by fitness level or group size subgroups
6. **Store predictions** in `hiking_duration_predictions`

### Success Metrics
- **RMSE < 20 minutes** for time-to-peak
- **50th percentile error < 15 minutes**
- **95th percentile error < 40 minutes**

---

## Model 3: Peak Time Forecaster

### Purpose
Predict when the trail will be busiest (peak arrival/departure hours) to recommend start times.

### Input Features
```
Date characteristics:
  - Day of week
  - Is weekend/holiday
  - Season
  - Weather forecast
  
Historical patterns:
  - Average arrival time for similar days
  - Peak occupancy window on similar dates
  - Median start time for bookings
```

### Output
```
Forecast:
  - Expected peak arrival hour (e.g., 10 AM)
  - Peak occupancy time window (e.g., "10:00 - 14:00")
  - Expected peak departure hour (e.g., 3 PM)
  - Recommendation: "Start at 05:30 AM to avoid crowds"
  - Confidence scores
```

### Logic
```
Peak arrival hour = Most common booking start time for similar dates
Peak occupancy = Average(time_to_peak) hours after arrival peak
Peak departure = Peak arrival + median(total_hike_duration)

Recommendation:
  IF peak_occupancy_expected:
    recommended_start_time = peak_arrival_hour - 2 hours
  ELSE:
    recommended_start_time = booking window opens (05:00 AM)
```

### Implementation Steps
1. **Aggregate hourly data** from `hourly_visitor_traffic`
2. **Identify peak arrival hour** using time-series decomposition
3. **Cluster similar dates** (same day-of-week, season, weather)
4. **Forecast peak hour** for upcoming dates
5. **Generate recommendations** in `peak_time_forecasts`
6. **Display to hikers** during booking with confidence

### Success Metrics
- **Predicted peak hour ± 1 hour** of actual (80% of time)
- **Recommendation adoption rate > 20%** (users book at recommended time)

---

## Recommendations Engine

### How It Works

After each model produces predictions, generate personalized recommendations:

```python
def generate_recommendation(user_id, zone_id, target_date):
    # Get predictions
    visitor_pred = get_visitor_predictions(zone_id, target_date)
    peak_forecast = get_peak_time_forecast(zone_id, target_date)
    duration_pred = get_hiking_duration_prediction(
        user_id, zone_id, target_date
    )
    
    # Assess crowd level
    if visitor_pred.predicted < visitor_pred.lower_75th_percentile:
        crowd_level = 'low'
        recommendation_type = 'good_time_to_visit'
        reason = f"Light crowd expected (~{visitor_pred.predicted} hikers)"
    elif visitor_pred.predicted > visitor_pred.upper_75th_percentile:
        crowd_level = 'high'
        recommendation_type = 'avoid_peak'
        reason = f"Heavy crowd expected (~{visitor_pred.predicted} hikers)"
    else:
        crowd_level = 'medium'
        recommendation_type = 'optimal_conditions'
        reason = "Good hiking conditions expected"
    
    # Add meta info
    recommend = {
        'user_id': user_id,
        'zone_id': zone_id,
        'recommended_date': target_date,
        'recommended_time': peak_forecast.recommended_start_time,
        'reason': reason,
        'predicted_crowd_level': crowd_level,
        'expected_hike_duration_minutes':
            duration_pred.estimated_total_duration_minutes,
        'confidence_score': avg(
            visitor_pred.confidence,
            peak_forecast.confidence,
            duration_pred.confidence
        ),
        'priority_score': calculate_priority(
            crowd_level,
            weather_forecast,
            user_preferences
        )
    }
    
    return recommend
```

### Reward Feedback Loop

```python
# Track if users act on recommendations
def record_recommendation_feedback(recommendation_id, action):
    """
    action: 'viewed' | 'clicked' | 'dismissed' | 'booked' | 'ignored'
    """
    # If user booked the recommended date/time:
    if action == 'booked':
        label = 1  # Good recommendation
    elif action == 'ignored':
        label = 0  # User ignored
    else:
        label = 0.5  # Neutral
    
    # Use as training signal to improve recommendation ranking
```

---

## Retraining Strategy

### Automatic Retraining Triggers

```
Daily (05:00 UTC):
  ✓ Aggregate yesterday's data
  ✓ Check model accuracy on yesterday's prediction
  ✓ If accumulated 50+ new records, mark for retraining

Weekly (Monday 02:00 UTC):
  ✓ Full retraining of all models
  ✓ Update model_training_metadata with new metrics
  ✓ If accuracy improves > 5%, auto-deploy to production

Monthly (1st, 02:00 UTC):
  ✓ Deep retraining with all historical data
  ✓ Hyperparameter tuning
  ✓ A/B test new model versions
```

### Monitoring & Alerts

```sql
-- Query: Model accuracy degradation
SELECT 
  model_name,
  model_version,
  AVG(ABS(prediction_error)) as current_mae,
  LAG(AVG(ABS(prediction_error))) 
    OVER (PARTITION BY model_name ORDER BY created_at) as previous_mae
FROM visitor_predictions
GROUP BY model_name, model_version
HAVING CURRENT_MAE > PREVIOUS_MAE * 1.2;  -- Alert if 20% worse
```

---

## Deployment & Infrastructure

### Two Approaches

#### Option A: Supabase Edge Functions (Recommended for early stages)
**Pros**:
- Zero infrastructure overhead
- Native Postgres integration
- Automatic scaling
- Built-in secrets management

**Cons**:
- Limited to Deno runtime (Python not available)
- Long-running operations timeout at 10min
- ML libraries limited

**Setup**:
```bash
# Supabase CLI
supabase functions new train_visitor_model
# Deploy: supabase functions deploy
```

**Implementation**: Use TensorFlow.js or simple statistical models (ARIMA via libraries)

---

#### Option B: External ML Service (Recommended after 6+ months)
**Services**:
- Google Cloud AI Platform
- AWS SageMaker
- Azure ML
- Hugging Face
- Modal.com (easy serverless)

**Pros**:
- Full Python ecosystem (scikit-learn, XGBoost, Prophet)
- Advanced models (LSTM, Transformers)
- GPU acceleration
- Better monitoring

**Cons**:
- Additional cost
- Network latency
- Credential management

---

## Implementation Timeline

### Month 1-2: Data Foundation
- [ ] Enable data collection in `daily_visitor_counts`
- [ ] Start collecting `hiking_duration_records`
- [ ] Store weather data in `visitor_demographics`

### Month 3-4: First Models (Baseline)
- [ ] Train simple Visitor Predictor (ARIMA or moving average)
- [ ] Train simple Duration Predictor (linear regression)
- [ ] Deploy to Supabase Edge Functions
- [ ] Display predictions on booking page

### Month 5-6: Refinement
- [ ] Collect 6+ months of data
- [ ] Train Peak Time Forecaster
- [ ] Implement recommendations engine
- [ ] Gather user feedback on accuracy

### Month 7-12: Production Optimization
- [ ] Migrate to external ML service if needed
- [ ] Advanced models (XGBoost, LSTM)
- [ ] Real-time retraining pipeline
- [ ] A/B test recommendations

### Year 2+: Continuous Improvement
- [ ] Multi-year seasonal patterns
- [ ] Demographic-specific models
- [ ] Integration with external APIs (weather, holidays)
- [ ] Real-time anomaly detection

---

## Example Queries for Feature Engineering

### Visitor Traffic Features
```sql
-- 7-day rolling average
SELECT 
  zone_id,
  date,
  AVG(confirmed_bookings) OVER (
    PARTITION BY zone_id 
    ORDER BY date ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
  ) as rolling_avg_7d
FROM daily_visitor_counts
ORDER BY zone_id, date;

-- Day-of-week seasonality
SELECT 
  to_char(date, 'Day') as day_of_week,
  AVG(confirmed_bookings) as avg_visitors,
  STDDEV(confirmed_bookings) as stddev_visitors
FROM daily_visitor_counts
GROUP BY day_of_week
ORDER BY day_of_week;
```

### Hiking Duration Features
```sql
-- Performance stats by difficulty level
SELECT 
  zone_id,
  DATE(completed_date) as completed_date,
  PERCENTILE_DISC(0.5) WITHIN GROUP (ORDER BY time_to_peak_minutes) 
    as median_pace,
  PERCENTILE_DISC(0.95) WITHIN GROUP (ORDER BY time_to_peak_minutes)
    as p95_time
FROM hiking_duration_records
GROUP BY zone_id, DATE(completed_date);

-- Fitness level impact
SELECT 
  fitness_level,
  group_size,
  AVG(time_to_peak_minutes) as avg_time,
  COUNT(*) as sample_size
FROM hiking_duration_records
GROUP BY fitness_level, group_size
HAVING COUNT(*) > 10;  -- Minimum sample size
```

---

## Success Metrics & KPIs

| Metric | Target | How Measured |
|--------|--------|--------------|
| **Model MAE** | <10% | `ABS(actual - predicted) / actual` |
| **Prediction Coverage** | >95% | % of dates with predictions |
| **Confidence Score** | Avg >0.85 | Mean confidence across all predictions |
| **Recommendation CTR** | >15% | Clicks / impressions |
| **Booking after recommendation** | >20% | Bookings on recommended dates / recommendations |
| **User feedback rating** | Avg >4/5 | Average star rating from `recommendation_feedback` |
| **Retraining frequency** | Weekly | Automated via `model_retraining_schedule` |
| **Model improvement** | +5% MAE quarterly | Compare to previous quarter |

---

## Privacy & Ethical Considerations

1. **Data Aggregation**: Never expose individual hiker times/fitness levels
2. **Anonymization**: Use aggregated demographics, not personal identifiers
3. **Fairness**: Test that models don't discriminate by age/gender
4. **Transparency**: Show users how predictions are made
5. **Opt-out**: Allow users to not provide feedback/recommendations

---

## Next Steps

1. **Database Migration**: Deploy the new ML tables from `DATABASE_SCHEMA.md`
2. **Data Collection**: Activate aggregation pipelines for daily visitor counts
3. **First Model**: Implement simple visitor predictor as Proof of Concept (PoC)
4. **Feedback Loop**: Begin capturing `hiking_duration_records` from existing hikes
5. **Frontend Integration**: Add recommendation display to booking UI

---

## References

- **ARIMA for time-series**: https://otexts.com/fpp2/arima.html
- **XGBoost tuning**: https://xgboost.readthedocs.io/
- **Prophet for forecasting**: https://facebook.github.io/prophet/
- **Recommendation systems**: https://developers.google.com/machine-learning/recommendation
- **ML pipeline best practices**: https://cloud.google.com/solutions/machine-learning-systems-design
