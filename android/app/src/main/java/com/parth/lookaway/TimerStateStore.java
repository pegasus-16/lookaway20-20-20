package com.parth.lookaway;

import android.content.Context;
import android.content.SharedPreferences;

import com.getcapacitor.JSObject;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * The small native mirror of the timer that the foreground service needs.
 *
 * JavaScript still owns the timer rules. This store only remembers enough to
 * render the ongoing notification, advance the simple focus/break cycle while
 * the WebView is asleep, and hand completed breaks back to JavaScript on the
 * next launch.
 */
public final class TimerStateStore {
    private static final String PREFS = "lookaway_native_timer";
    private static final String KEY_STATE = "state";
    private static final int MAX_EVENTS = 200;
    /** Keeps two consumeEvents() calls from returning the same events. */
    private static final Object LOCK = new Object();

    public String phase = "idle";
    public long endAt = 0L;
    /** -1 while running; a non-negative value while paused. */
    public long pausedRemainingMs = -1L;
    public long durationMs = 0L;
    public long focusMs = 20L * 60_000L;
    public long breakMs = 20_000L;
    public boolean notifications = true;
    public long updatedAt = 0L;
    public long lastBreakKey = 0L;
    public JSONArray pendingEvents = new JSONArray();

    public boolean isRunning() {
        // A due break has no deadline but is still an active timer: the service
        // stays alive so its notification can ask the user to open the app.
        if ("break_due".equals(phase)) return true;
        return !"idle".equals(phase) && (pausedRemainingMs >= 0 || endAt > 0);
    }

    public boolean isPaused() {
        return !"idle".equals(phase) && pausedRemainingMs >= 0;
    }

    public static TimerStateStore load(Context context) {
        synchronized (LOCK) {
            SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            String raw = prefs.getString(KEY_STATE, null);
            TimerStateStore state = new TimerStateStore();
            if (raw == null) return state;
            try {
                JSONObject json = new JSONObject(raw);
                state.phase = json.optString("phase", "idle");
                state.endAt = json.optLong("endAt", 0L);
                state.pausedRemainingMs = json.optLong("pausedRemainingMs", -1L);
                state.durationMs = json.optLong("durationMs", 0L);
                state.focusMs = json.optLong("focusMs", 20L * 60_000L);
                state.breakMs = json.optLong("breakMs", 20_000L);
                state.notifications = json.optBoolean("notifications", true);
                state.updatedAt = json.optLong("updatedAt", 0L);
                state.lastBreakKey = json.optLong("lastBreakKey", 0L);
                state.pendingEvents = new JSONArray(json.optString("pendingEvents", "[]"));
            } catch (JSONException ignored) {
                // Corrupt state is treated as idle.
            }
            return state;
        }
    }

    public void save(Context context) {
        synchronized (LOCK) {
            JSONObject json = new JSONObject();
            try {
                json.put("phase", phase);
                json.put("endAt", endAt);
                json.put("pausedRemainingMs", pausedRemainingMs);
                json.put("durationMs", durationMs);
                json.put("focusMs", focusMs);
                json.put("breakMs", breakMs);
                json.put("notifications", notifications);
                json.put("updatedAt", updatedAt);
                json.put("lastBreakKey", lastBreakKey);
                json.put("pendingEvents", pendingEvents.toString());
            } catch (JSONException ignored) {
                return;
            }
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                    .edit()
                    .putString(KEY_STATE, json.toString())
                    .apply();
        }
    }

    public synchronized JSObject toJson() {
        JSObject json = new JSObject();
        json.put("phase", phase);
        json.put("endAt", endAt);
        json.put("pausedRemainingMs", isPaused() ? pausedRemainingMs : JSONObject.NULL);
        json.put("durationMs", durationMs);
        json.put("focusMs", focusMs);
        json.put("breakMs", breakMs);
        json.put("notifications", notifications);
        json.put("updatedAt", updatedAt);
        return json;
    }

    public synchronized boolean hasEventKey(long key) {
        if (key <= 0) return false;
        for (int i = 0; i < pendingEvents.length(); i++) {
            JSONObject event = pendingEvents.optJSONObject(i);
            if (event != null && event.optLong("key", 0L) == key) return true;
        }
        return false;
    }

    public synchronized void addEvent(String type, long at, long key) {
        try {
            JSONObject event = new JSONObject();
            event.put("type", type);
            event.put("at", at);
            event.put("key", key);
            pendingEvents.put(event);
            while (pendingEvents.length() > MAX_EVENTS) {
                pendingEvents.remove(0);
            }
        } catch (JSONException ignored) {
            // Ignore malformed event data.
        }
    }

    /** Records a completed break once per break start time. */
    public synchronized boolean recordBreak(long breakKey, long at) {
        if (breakKey <= 0 || breakKey == lastBreakKey || hasEventKey(breakKey)) {
            return false;
        }
        lastBreakKey = breakKey;
        addEvent("break", at, breakKey);
        return true;
    }

    /** Returns pending events and clears them, exactly once across callers. */
    public static JSONArray consumePending(Context context) {
        synchronized (LOCK) {
            TimerStateStore state = load(context);
            JSONArray events = state.pendingEvents;
            state.pendingEvents = new JSONArray();
            state.save(context);
            return events;
        }
    }
}
