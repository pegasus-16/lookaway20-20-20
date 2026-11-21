package com.parth.lookaway;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;

import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

/**
 * Keeps the single ongoing timer notification alive and advances the simple
 * focus/break cycle while the WebView is backgrounded or stopped.
 *
 * JavaScript remains the rules engine. This service mirrors only the current
 * phase and durations, and hands completed breaks back through
 * {@link TimerStateStore} so stats are not lost.
 */
public class TimerService extends Service {
    public static final String ACTION_START = "com.parth.lookaway.action.START";
    public static final String ACTION_UPDATE = "com.parth.lookaway.action.UPDATE";
    public static final String ACTION_PAUSE = "com.parth.lookaway.action.PAUSE";
    public static final String ACTION_RESUME = "com.parth.lookaway.action.RESUME";
    public static final String ACTION_BREAK_NOW = "com.parth.lookaway.action.BREAK_NOW";
    public static final String ACTION_SNOOZE = "com.parth.lookaway.action.SNOOZE";
    public static final String ACTION_SKIP = "com.parth.lookaway.action.SKIP";
    public static final String ACTION_STOP = "com.parth.lookaway.action.STOP";
    /** The user swiped the timer notification away; treat it as stopping. */
    public static final String ACTION_DISMISS = "com.parth.lookaway.action.DISMISS";
    public static final String ACTION_REFRESH = "com.parth.lookaway.action.REFRESH";
    public static final String ACTION_TICK = "com.parth.lookaway.action.TICK";
    public static final String ACTION_STATE = "com.parth.lookaway.action.STATE";

    private static final int ALARM_REQUEST_CODE = 1001;
    private static final long SNOOZE_MS = 5L * 60_000L;
    private static final Object LOCK = new Object();

    static volatile boolean running = false;
    static volatile boolean foregrounded = false;
    /** Current service instance, so static alarm callbacks can update the notification. */
    private static volatile TimerService instance = null;
    /**
     * True while the WebView is on screen. A focus phase that ends while this is
     * false becomes a due break and waits for the user to open the app.
     */
    static volatile boolean appForeground = false;
    /**
     * True while the app is showing the timer itself, rather than a sheet such
     * as Settings, Your week or the eye-care guide. A break overlay would be
     * hidden behind those sheets, so a due break waits until the user is back
     * on the timer screen.
     */
    static volatile boolean timerScreen = false;

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        running = true;
        foregrounded = false;
        NotificationChannels.ensure(this);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        NotificationChannels.ensure(this);
        String action = intent != null && intent.getAction() != null
                ? intent.getAction()
                : ACTION_REFRESH;

        synchronized (LOCK) {
            TimerStateStore state = TimerStateStore.load(this);
            long now = System.currentTimeMillis();
            if (ACTION_START.equals(action) || ACTION_UPDATE.equals(action)) {
                applyFromIntent(intent, state, now);
            } else if (ACTION_PAUSE.equals(action)) {
                pause(state, now);
                BreakAlarm.stop();
            } else if (ACTION_RESUME.equals(action)) {
                resume(state, now);
            } else if (ACTION_BREAK_NOW.equals(action)) {
                if (startBreak(state, now)) BreakAlarm.stop();
            } else if (ACTION_SNOOZE.equals(action)) {
                snooze(state, now);
                BreakAlarm.stop();
            } else if (ACTION_SKIP.equals(action)) {
                skip(state, now);
                BreakAlarm.stop();
            } else if (ACTION_TICK.equals(action)) {
                advanceIfDue(this, state, now);
            } else if (ACTION_STOP.equals(action)) {
                stopTimer(this, state, now);
                // A stop can arrive moments after startForegroundService(); the
                // system still expects startForeground() before the service dies.
                satisfyStartForeground();
                stopForegroundCompat();
                stopSelf();
                return START_NOT_STICKY;
            } else if (ACTION_DISMISS.equals(action)) {
                stopTimer(this, state, now);
                satisfyStartForeground();
                stopForegroundCompat();
                stopSelf();
                return START_NOT_STICKY;
            }

            if (!state.isRunning()) {
                stopTimer(this, state, now);
                satisfyStartForeground();
                stopForegroundCompat();
                stopSelf();
                return START_NOT_STICKY;
            }

            state.updatedAt = now;
            state.save(this);
            postForeground(state);
            cancelAlarm(this);
            scheduleAlarm(this, state);
            broadcastState(this, state);
        }

        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        BreakAlarm.stop();
        running = false;
        foregrounded = false;
        if (instance == this) instance = null;
        super.onDestroy();
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        // Keep running when the task is swiped away; the alarm is the safety net.
        TimerStateStore state = TimerStateStore.load(this);
        if (state.isRunning()) scheduleAlarm(this, state);
        super.onTaskRemoved(rootIntent);
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    /**
     * Posts the timer notifications. The foreground service always owns the
     * quiet status notification; a break alert is a separate, dismissible
     * high-importance notification grouped under it. A foreground-service
     * notification is pinned on many Android versions, so using it for the
     * reminder would make "swipe to dismiss" impossible; a normal notification
     * is also what produces a reliable heads-up banner.
     */
    private void postForeground(TimerStateStore state) {
        boolean alert = TimerNotifications.shouldAlert(state, appForeground);
        startForegroundCompat(
                TimerNotifications.STATUS_ID,
                TimerNotifications.buildStatus(this, state, alert));
        NotificationManagerCompat manager = NotificationManagerCompat.from(this);
        if (alert) {
            // Re-posting is harmless: the alert is only-alert-once.
            manager.notify(
                    TimerNotifications.ALERT_ID, TimerNotifications.buildAlert(this, state));
        } else {
            manager.cancel(TimerNotifications.ALERT_ID);
        }
    }

    private void startForegroundCompat(int id, Notification notification) {
        if (Build.VERSION.SDK_INT >= 34) {
            startForeground(
                    id,
                    notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
        } else {
            startForeground(id, notification);
        }
        foregrounded = true;
    }

    private void satisfyStartForeground() {
        if (!foregrounded) startForegroundCompat(
                TimerNotifications.STATUS_ID, TimerNotifications.buildStopped(this));
    }

    private void stopForegroundCompat() {
        stopForeground(STOP_FOREGROUND_REMOVE);
        foregrounded = false;
    }

    private static void applyFromIntent(Intent intent, TimerStateStore state, long now) {
        if (intent == null) return;
        String phase = intent.getStringExtra("phase");
        boolean known = "focus".equals(phase) || "break".equals(phase) || "break_due".equals(phase);
        state.phase = known ? phase : "idle";
        state.endAt = intent.getLongExtra("endAt", 0L);
        state.pausedRemainingMs = intent.getLongExtra("pausedRemainingMs", -1L);
        state.durationMs = Math.max(0L, intent.getLongExtra("durationMs", 0L));
        state.focusMs = Math.max(1L, intent.getLongExtra("focusMs", state.focusMs));
        state.breakMs = Math.max(1L, intent.getLongExtra("breakMs", state.breakMs));
        state.notifications = intent.getBooleanExtra("notifications", true);
        if ("break_due".equals(state.phase)) {
            // No countdown and no deadline: the break starts when the app opens.
            state.endAt = 0L;
            state.pausedRemainingMs = -1L;
            state.durationMs = 0L;
        }
        if (state.isPaused()) state.endAt = 0L;
        state.updatedAt = now;
    }

    private static void pause(TimerStateStore state, long now) {
        if (!state.isRunning() || state.isPaused() || "break_due".equals(state.phase)) return;
        state.pausedRemainingMs = Math.max(0L, state.endAt - now);
        state.endAt = 0L;
        state.updatedAt = now;
    }

    private static void resume(TimerStateStore state, long now) {
        if (!state.isPaused()) return;
        state.endAt = now + Math.max(0L, state.pausedRemainingMs);
        state.pausedRemainingMs = -1L;
        state.updatedAt = now;
    }

    private static boolean startBreak(TimerStateStore state, long now) {
        if (!"focus".equals(state.phase) && !"break_due".equals(state.phase)) return false;
        state.phase = "break";
        state.endAt = now + state.breakMs;
        state.durationMs = state.breakMs;
        state.pausedRemainingMs = -1L;
        state.updatedAt = now;
        return true;
    }

    /**
     * Called when the WebView becomes visible. Starts a break that is due, but
     * only when the timer itself is on screen: a break started behind a
     * settings or stats sheet would be counted without the user seeing it.
     */
    static void onAppForeground(Context context, boolean onTimerScreen) {
        synchronized (LOCK) {
            appForeground = true;
            timerScreen = onTimerScreen;
            // The user is here now; stop any repeating alarm and switch the
            // notification back to its quiet form.
            BreakAlarm.stop();
            if (!running) return;
            TimerStateStore state = TimerStateStore.load(context);
            if (!state.isRunning()) return;
            if (onTimerScreen && "break_due".equals(state.phase)) {
                long now = System.currentTimeMillis();
                if (!startBreak(state, now)) return;
                state.save(context);
                scheduleAlarm(context, state);
                broadcastState(context, state);
            }
            TimerService service = instance;
            if (service != null) service.postForeground(state);
        }
    }

    static void setAppForeground(Context context, boolean foreground, boolean onTimerScreen) {
        if (foreground) {
            onAppForeground(context, onTimerScreen);
        } else {
            appForeground = false;
            timerScreen = false;
        }
    }

    private static void snooze(TimerStateStore state, long now) {
        state.phase = "focus";
        state.endAt = now + SNOOZE_MS;
        state.durationMs = SNOOZE_MS;
        state.pausedRemainingMs = -1L;
        state.updatedAt = now;
    }

    private static void skip(TimerStateStore state, long now) {
        state.addEvent("skip", now, 0L);
        state.phase = "focus";
        state.endAt = now + state.focusMs;
        state.durationMs = state.focusMs;
        state.pausedRemainingMs = -1L;
        state.updatedAt = now;
    }

    private static void stopTimer(Context context, TimerStateStore state, long now) {
        BreakAlarm.stop();
        state.phase = "idle";
        state.endAt = 0L;
        state.pausedRemainingMs = -1L;
        state.durationMs = 0L;
        state.updatedAt = now;
        state.save(context);
        cancelAlarm(context);
        TimerNotifications.cancelAll(context);
        broadcastState(context, state);
    }

    /**
     * Stops the timer when its notification is cleared. The delete intent comes
     * from the notification itself, so this may run while the service is alive
     * (normal) or after it was killed (just clear the stored state).
     */
    static void handleDismiss(Context context) {
        synchronized (LOCK) {
            TimerStateStore state = TimerStateStore.load(context);
            if (!state.isRunning()) {
                TimerNotifications.cancelAll(context);
                return;
            }
            stopTimer(context, state, System.currentTimeMillis());
            TimerService service = instance;
            if (service != null) {
                service.satisfyStartForeground();
                service.stopForegroundCompat();
                service.stopSelf();
            } else {
                context.stopService(new Intent(context, TimerService.class));
            }
        }
    }

    /**
     * Moves the native mirror to the next phase when the deadline has passed.
     * Returns true when a transition happened.
     */
    static boolean advanceIfDue(Context context, TimerStateStore state, long now) {
        if (!state.isRunning() || state.isPaused()) return false;
        if ("break_due".equals(state.phase)) return false;
        if (state.endAt > now + 250L) return false;

        long phaseStart = state.endAt - state.durationMs;
        if ("focus".equals(state.phase)) {
            if (!appForeground) {
                // The app is not on screen. Do not run the break (and the next
                // focus phase) by itself: wait until the user opens the app.
                deferBreak(context, state, now);
                // Ring until the user starts, skips or snoozes the break.
                if (state.notifications) BreakAlarm.start();
                return true;
            }
            if (!timerScreen) {
                // The app is visible but a sheet (settings, week, working
                // hours, guide) covers the timer. Starting the overlay now
                // would hide it and count a break nobody took, so wait until
                // the user is back on the timer screen. No alarm: they are
                // already in the app.
                deferBreak(context, state, now);
                return true;
            }
            state.phase = "break";
            state.endAt = now + state.breakMs;
            state.durationMs = state.breakMs;
        } else if ("break".equals(state.phase)) {
            state.recordBreak(phaseStart, now);
            state.phase = "focus";
            state.endAt = now + state.focusMs;
            state.durationMs = state.focusMs;
            BreakAlarm.stop();
        } else {
            return false;
        }

        state.pausedRemainingMs = -1L;
        state.updatedAt = now;
        state.save(context);
        return true;
    }

    /** Parks a due break until the user is back on the timer screen. */
    private static void deferBreak(Context context, TimerStateStore state, long now) {
        state.phase = "break_due";
        state.endAt = 0L;
        state.pausedRemainingMs = -1L;
        state.durationMs = 0L;
        state.updatedAt = now;
        state.save(context);
    }

    static void handleAlarm(Context context) {
        synchronized (LOCK) {
            if (!running) {
                // Bring the foreground service back so the notification and the
                // repeating break alarm live in a process Android keeps alive.
                try {
                    ContextCompat.startForegroundService(
                            context,
                            new Intent(context, TimerService.class).setAction(ACTION_TICK));
                    return;
                } catch (RuntimeException ignored) {
                    // Fall through and advance the stored state at least.
                }
            }
            TimerStateStore state = TimerStateStore.load(context);
            if (!state.isRunning()) return;
            long now = System.currentTimeMillis();
            if (!advanceIfDue(context, state, now)) {
                if (!state.isPaused()) scheduleAlarm(context, state);
                return;
            }
            TimerService service = instance;
            if (running && service != null) {
                service.postForeground(state);
                broadcastState(context, state);
            }
            scheduleAlarm(context, state);
        }
    }

    static void scheduleAlarm(Context context, TimerStateStore state) {
        if (!state.isRunning() || state.isPaused() || state.endAt <= 0L) return;
        AlarmManager manager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (manager == null) return;

        Intent intent = new Intent(context, TimerAlarmReceiver.class).setAction(ACTION_TICK);
        PendingIntent pending = PendingIntent.getBroadcast(
                context,
                ALARM_REQUEST_CODE,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        if (Build.VERSION.SDK_INT >= 31 && !manager.canScheduleExactAlarms()) {
            manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, state.endAt, pending);
        } else {
            manager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, state.endAt, pending);
        }
    }

    static void cancelAlarm(Context context) {
        AlarmManager manager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (manager == null) return;
        Intent intent = new Intent(context, TimerAlarmReceiver.class).setAction(ACTION_TICK);
        PendingIntent pending = PendingIntent.getBroadcast(
                context,
                ALARM_REQUEST_CODE,
                intent,
                PendingIntent.FLAG_NO_CREATE | PendingIntent.FLAG_IMMUTABLE);
        if (pending != null) {
            manager.cancel(pending);
            pending.cancel();
        }
    }

    static void broadcastState(Context context, TimerStateStore state) {
        Intent intent = new Intent(ACTION_STATE)
                .setPackage(context.getPackageName())
                .putExtra("state", state.toJson().toString());
        context.sendBroadcast(intent);
    }
}
