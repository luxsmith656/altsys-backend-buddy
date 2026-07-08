package com.example.mtkalisungan.tracking;

import android.content.Context;
import android.content.SharedPreferences;
import com.getcapacitor.JSArray;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

public final class BackgroundTrailRecorderStore {
    private static final String PREFS = "background_trail_recorder";
    private static final String ACTIVE_SESSION = "active_session_id";
    private static final String ACTIVE_MODE = "active_mode";
    private static final Object LOCK = new Object();

    private BackgroundTrailRecorderStore() {}

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private static String pointsKey(String sessionId) {
        return "points:" + sessionId;
    }

    public static void setActive(Context context, String sessionId, String mode) {
        prefs(context).edit()
            .putString(ACTIVE_SESSION, sessionId)
            .putString(ACTIVE_MODE, mode)
            .apply();
    }

    public static void clearActive(Context context) {
        prefs(context).edit()
            .remove(ACTIVE_SESSION)
            .remove(ACTIVE_MODE)
            .apply();
    }

    public static String getActiveSessionId(Context context) {
        return prefs(context).getString(ACTIVE_SESSION, null);
    }

    public static String getActiveMode(Context context) {
        return prefs(context).getString(ACTIVE_MODE, null);
    }

    public static boolean isActive(Context context) {
        return getActiveSessionId(context) != null;
    }

    public static void appendPoint(Context context, String sessionId, JSONObject point) {
        synchronized (LOCK) {
            SharedPreferences shared = prefs(context);
            JSONArray points;
            try {
                points = new JSONArray(shared.getString(pointsKey(sessionId), "[]"));
                points.put(point);
                shared.edit().putString(pointsKey(sessionId), points.toString()).apply();
            } catch (JSONException ignored) {
                points = new JSONArray();
                points.put(point);
                shared.edit().putString(pointsKey(sessionId), points.toString()).apply();
            }
        }
    }

    public static JSArray getPoints(Context context, String sessionId) {
        try {
            return JSArray.from(new JSONArray(prefs(context).getString(pointsKey(sessionId), "[]")));
        } catch (JSONException ignored) {
            return new JSArray();
        }
    }

    public static void clearPoints(Context context, String sessionId) {
        prefs(context).edit().remove(pointsKey(sessionId)).apply();
    }
}
