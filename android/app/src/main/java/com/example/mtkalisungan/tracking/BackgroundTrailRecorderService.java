package com.example.mtkalisungan.tracking;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.os.IBinder;
import android.os.Looper;
import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;
import com.example.mtkalisungan.MainActivity;
import com.example.mtkalisungan.R;
import org.json.JSONException;
import org.json.JSONObject;

public class BackgroundTrailRecorderService extends Service implements LocationListener {
    public static final String ACTION_START = "com.example.mtkalisungan.tracking.START";
    public static final String ACTION_STOP = "com.example.mtkalisungan.tracking.STOP";
    public static final String EXTRA_SESSION_ID = "sessionId";
    public static final String EXTRA_MODE = "mode";
    private static final String CHANNEL_ID = "trail_recording";
    private static final int NOTIFICATION_ID = 4407;

    private LocationManager locationManager;
    private String sessionId;
    private String mode;

    @Override
    public void onCreate() {
        super.onCreate();
        locationManager = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
        createNotificationChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            stopRecorder();
            return START_NOT_STICKY;
        }

        sessionId = intent != null ? intent.getStringExtra(EXTRA_SESSION_ID) : null;
        mode = intent != null ? intent.getStringExtra(EXTRA_MODE) : "hike";
        if (sessionId == null || sessionId.trim().isEmpty()) {
            stopSelf();
            return START_NOT_STICKY;
        }

        BackgroundTrailRecorderStore.setActive(this, sessionId, mode);
        startForeground(NOTIFICATION_ID, buildNotification());
        requestLocationUpdates();
        return START_STICKY;
    }

    private void requestLocationUpdates() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            stopRecorder();
            return;
        }
        try {
            if (locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                locationManager.requestLocationUpdates(LocationManager.GPS_PROVIDER, 2000L, 1f, this, Looper.getMainLooper());
            }
            if (locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                locationManager.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 5000L, 5f, this, Looper.getMainLooper());
            }
        } catch (SecurityException ignored) {
            stopRecorder();
        }
    }

    @Override
    public void onLocationChanged(Location location) {
        if (sessionId == null || location == null) return;
        JSONObject point = new JSONObject();
        try {
            point.put("sessionId", sessionId);
            point.put("mode", mode);
            point.put("lat", location.getLatitude());
            point.put("lng", location.getLongitude());
            point.put("alt", location.hasAltitude() ? location.getAltitude() : 0);
            point.put("accuracy", location.hasAccuracy() ? location.getAccuracy() : 999);
            point.put("speed", location.hasSpeed() ? location.getSpeed() : 0);
            point.put("heading", location.hasBearing() ? location.getBearing() : JSONObject.NULL);
            point.put("ts", location.getTime() > 0 ? location.getTime() : System.currentTimeMillis());
            point.put("provider", location.getProvider());
            BackgroundTrailRecorderStore.appendPoint(this, sessionId, point);
        } catch (JSONException ignored) {}
    }

    @Override
    public void onProviderEnabled(String provider) {}

    @Override
    public void onProviderDisabled(String provider) {}

    @Override
    public void onStatusChanged(String provider, int status, Bundle extras) {}

    private Notification buildNotification() {
        Intent openIntent = new Intent(this, MainActivity.class);
        PendingIntent pendingIntent = PendingIntent.getActivity(
            this,
            0,
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        String title = "Trail recording active";
        String text = "GPS path is being recorded, even while the screen is off.";
        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(text)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setOngoing(true)
            .setContentIntent(pendingIntent)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            "Trail recording",
            NotificationManager.IMPORTANCE_LOW
        );
        channel.setDescription("Keeps GPS recording active while hiking.");
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        manager.createNotificationChannel(channel);
    }

    private void stopRecorder() {
        if (locationManager != null) {
            try {
                locationManager.removeUpdates(this);
            } catch (SecurityException ignored) {}
        }
        BackgroundTrailRecorderStore.clearActive(this);
        stopForeground(true);
        stopSelf();
    }

    @Override
    public void onDestroy() {
        if (locationManager != null) {
            try {
                locationManager.removeUpdates(this);
            } catch (SecurityException ignored) {}
        }
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
