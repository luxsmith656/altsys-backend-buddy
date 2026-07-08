package com.example.mtkalisungan.tracking;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "BackgroundTrailRecorder")
public class BackgroundTrailRecorderPlugin extends Plugin {
    @PluginMethod
    public void start(PluginCall call) {
        String sessionId = call.getString("sessionId");
        String mode = call.getString("mode", "hike");
        if (sessionId == null || sessionId.trim().isEmpty()) {
            call.reject("sessionId is required");
            return;
        }
        if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            call.reject("Precise location permission is required before background recording can start.");
            return;
        }
        Intent intent = new Intent(getContext(), BackgroundTrailRecorderService.class);
        intent.setAction(BackgroundTrailRecorderService.ACTION_START);
        intent.putExtra(BackgroundTrailRecorderService.EXTRA_SESSION_ID, sessionId);
        intent.putExtra(BackgroundTrailRecorderService.EXTRA_MODE, mode);
        ContextCompat.startForegroundService(getContext(), intent);
        JSObject ret = new JSObject();
        ret.put("active", true);
        ret.put("sessionId", sessionId);
        ret.put("mode", mode);
        call.resolve(ret);
    }

    @PluginMethod
    public void stop(PluginCall call) {
        Intent intent = new Intent(getContext(), BackgroundTrailRecorderService.class);
        intent.setAction(BackgroundTrailRecorderService.ACTION_STOP);
        getContext().startService(intent);
        JSObject ret = new JSObject();
        ret.put("active", false);
        call.resolve(ret);
    }

    @PluginMethod
    public void status(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("active", BackgroundTrailRecorderStore.isActive(getContext()));
        ret.put("sessionId", BackgroundTrailRecorderStore.getActiveSessionId(getContext()));
        ret.put("mode", BackgroundTrailRecorderStore.getActiveMode(getContext()));
        call.resolve(ret);
    }

    @PluginMethod
    public void getPoints(PluginCall call) {
        String sessionId = call.getString("sessionId", BackgroundTrailRecorderStore.getActiveSessionId(getContext()));
        JSObject ret = new JSObject();
        ret.put("points", sessionId == null ? new com.getcapacitor.JSArray() : BackgroundTrailRecorderStore.getPoints(getContext(), sessionId));
        call.resolve(ret);
    }

    @PluginMethod
    public void clear(PluginCall call) {
        String sessionId = call.getString("sessionId");
        if (sessionId != null) BackgroundTrailRecorderStore.clearPoints(getContext(), sessionId);
        JSObject ret = new JSObject();
        ret.put("cleared", sessionId != null);
        call.resolve(ret);
    }
}
