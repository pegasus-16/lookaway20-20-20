package com.parth.lookaway;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

import android.content.IntentFilter;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONException;

@CapacitorPlugin(name = "TimerService")
public class TimerServicePlugin extends Plugin {
    private BroadcastReceiver stateReceiver;

    @Override
    public void load() {
        stateReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                String raw = intent == null ? null : intent.getStringExtra("state");
                if (raw == null) return;
                try {
                    notifyListeners("stateChanged", new JSObject(raw), true);
                } catch (JSONException ignored) {
                    // The service always writes valid JSON.
                }
            }
        };
        ContextCompat.registerReceiver(
                getContext(),
                stateReceiver,
                new IntentFilter(TimerService.ACTION_STATE),
                ContextCompat.RECEIVER_NOT_EXPORTED);
    }

    @Override
    protected void handleOnDestroy() {
        if (stateReceiver != null) {
            try {
                getContext().unregisterReceiver(stateReceiver);
            } catch (IllegalArgumentException ignored) {
                // Already unregistered.
            }
            stateReceiver = null;
        }
        super.handleOnDestroy();
    }

    @PluginMethod
    public void start(PluginCall call) {
        dispatch(call);
    }

    @PluginMethod
    public void update(PluginCall call) {
        dispatch(call);
    }

    private void dispatch(PluginCall call) {
        Intent intent = new Intent(getContext(), TimerService.class)
                .setAction(TimerService.ACTION_UPDATE);
        intent.putExtra("phase", call.getString("phase"));
        // JS numbers arrive as Integer or Long depending on size; PluginCall's
        // typed getters silently drop the other shape, so read the raw Number.
        intent.putExtra("endAt", longExtra(call, "endAt", 0L));
        Object paused = call.getData().opt("pausedRemainingMs");
        intent.putExtra("pausedRemainingMs", paused instanceof Number ? ((Number) paused).longValue() : -1L);
        intent.putExtra("durationMs", longExtra(call, "durationMs", 0L));
        intent.putExtra("focusMs", longExtra(call, "focusMs", 0L));
        intent.putExtra("breakMs", longExtra(call, "breakMs", 0L));
        Boolean notifications = call.getBoolean("notifications");
        intent.putExtra("notifications", notifications == null || notifications);

        try {
            ContextCompat.startForegroundService(getContext(), intent);
            call.resolve();
        } catch (Exception error) {
            call.reject("Could not start the timer service", error);
        }
    }

    private static long longExtra(PluginCall call, String name, long fallback) {
        Object value = call.getData().opt(name);
        return value instanceof Number ? ((Number) value).longValue() : fallback;
    }

    @PluginMethod
    public void stop(PluginCall call) {
        // Reset the mirror first: stopping the service alone would leave a
        // stale "running" state that the next launch would adopt.
        Context context = getContext();
        TimerStateStore state = TimerStateStore.load(context);
        state.phase = "idle";
        state.endAt = 0L;
        state.pausedRemainingMs = -1L;
        state.durationMs = 0L;
        state.updatedAt = System.currentTimeMillis();
        state.save(context);
        TimerService.cancelAlarm(context);
        TimerNotifications.cancelAll(context);
        BreakAlarm.stop();
        try {
            if (TimerService.running) {
                // Ask the service to stop itself. Calling stopService() while a
                // startForegroundService() is still in flight makes Android kill
                // the process for not calling startForeground() in time.
                context.startService(
                        new Intent(context, TimerService.class)
                                .setAction(TimerService.ACTION_STOP));
            }
        } catch (Exception ignored) {
            // The service is already gone; the saved idle state is enough.
        }
        call.resolve();
    }

    @PluginMethod
    public void getState(PluginCall call) {
        call.resolve(TimerStateStore.load(getContext()).toJson());
    }

    /**
     * Fallback for the visible countdown: ask the service to advance a phase
     * whose deadline has passed even if the system alarm arrives late (inexact
     * alarms can be delayed by seconds). The service decides whether anything
     * is due, so this can never double-count a break.
     */
    @PluginMethod
    public void tick(PluginCall call) {
        TimerService.handleAlarm(getContext());
        call.resolve();
    }

    @PluginMethod
    public void consumeEvents(PluginCall call) {
        JSONArray events = TimerStateStore.consumePending(getContext());
        JSObject result = new JSObject();
        result.put("events", events);
        call.resolve(result);
    }

    /**
     * The WebView reports whether it is on screen, and whether the timer screen
     * itself is showing. The service starts a due break only when the app is
     * visible and no sheet (settings, stats, guide) covers the timer; otherwise
     * the break waits for the user.
     */
    @PluginMethod
    public void setAppForeground(PluginCall call) {
        Boolean foreground = call.getBoolean("foreground");
        Boolean timerScreen = call.getBoolean("timerScreen");
        TimerService.setAppForeground(
                getContext(),
                Boolean.TRUE.equals(foreground),
                timerScreen == null || Boolean.TRUE.equals(timerScreen));
        call.resolve();
    }
}
