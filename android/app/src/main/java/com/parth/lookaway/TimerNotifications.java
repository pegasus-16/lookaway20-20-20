package com.parth.lookaway;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.text.format.DateUtils;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

/**
 * Builds the single timer notification shown by the foreground service.
 *
 * The same service notification is either quiet ("Focus time") or an alert
 * ("Time to look away"). They use different ids so switching between them
 * replaces the old notification instead of leaving a second, silent one
 * behind. Android requires a foreground service to keep one notification.
 */
public final class TimerNotifications {
    public static final int STATUS_ID = 2020201;
    public static final int ALERT_ID = 2020202;
    /**
     * The alert is a normal, dismissible notification that groups with the
     * service notification. This matters on Android versions/ROMs that pin
     * foreground-service notifications: the reminder itself can still be swiped
     * away (which stops the timer), and a normal high-importance notification is
     * what reliably produces a heads-up banner.
     */
    private static final String GROUP = "lookaway_timer";

    private TimerNotifications() {}

    private static PendingIntent serviceAction(Context context, String action, int requestCode) {
        Intent intent = new Intent(context, TimerService.class).setAction(action);
        return PendingIntent.getService(
                context,
                requestCode,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static PendingIntent openApp(Context context) {
        Intent intent = new Intent(context, MainActivity.class)
                .setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(
                context,
                100,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /**
     * Fired when the user swipes the timer notification away. Removing the
     * notification is treated as stopping the timer, so a dismissed reminder
     * can never leave a silent timer running.
     */
    private static PendingIntent dismissIntent(Context context) {
        Intent intent = new Intent(context, TimerAlarmReceiver.class)
                .setAction(TimerService.ACTION_DISMISS);
        return PendingIntent.getBroadcast(
                context,
                31,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static NotificationCompat.Builder base(Context context, String channel) {
        return new NotificationCompat.Builder(context, channel)
                .setSmallIcon(R.drawable.ic_stat_timer)
                // The app name already labels the notification. Avoid repeating
                // "Lookaway · 20-20-20" in the subtext.
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setContentIntent(openApp(context))
                .setDeleteIntent(dismissIntent(context))
                .setOnlyAlertOnce(true)
                .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE);
    }

    /**
     * True when the notification should be the loud, high-importance one.
     * Breaks that start while the app is on screen never alert here: the
     * overlay and the in-app chime already tell the user.
     */
    public static boolean shouldAlert(TimerStateStore state, boolean appForeground) {
        if (!state.notifications) return false;
        if ("break_due".equals(state.phase)) return true;
        return "break".equals(state.phase) && !appForeground;
    }

    /** Quiet ongoing notification: focus, a visible break, or a paused timer. */
    public static android.app.Notification buildStatus(
            Context context, TimerStateStore state, boolean groupWithAlert) {
        NotificationCompat.Builder builder = base(context, NotificationChannels.STATUS)
                .setCategory(NotificationCompat.CATEGORY_STOPWATCH)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                // Dismissible so clearing it can stop the timer (delete intent).
                // A foreground-service notification is still pinned by Android
                // below 14; on newer versions the swipe is delivered to us.
                .setOngoing(false)
                .setSilent(true)
                // No chronometer: a late phase change used to leave Android
                // ticking below zero ("-1"). The next break time is stable.
                .setUsesChronometer(false)
                .setShowWhen(false);
        if (groupWithAlert) {
            builder.setGroup(GROUP).setGroupAlertBehavior(NotificationCompat.GROUP_ALERT_SUMMARY);
        }

        if ("break_due".equals(state.phase)) {
            long seconds = Math.max(1L, Math.round(state.breakMs / 1000.0));
            builder.setContentTitle("Eye break due")
                    .setContentText("Open Lookaway to start your " + seconds + "-second break.");
            builder.addAction(0, "Open", openApp(context));
        } else if ("break".equals(state.phase)) {
            builder.setContentTitle("Eye break")
                    .setContentText("Look at something 20 feet (6 m) away");
            builder.addAction(0, "Skip", serviceAction(context, TimerService.ACTION_SKIP, 23));
        } else if (state.isPaused()) {
            long remaining = Math.max(0L, state.pausedRemainingMs);
            builder.setContentTitle("Paused")
                    .setContentText(
                            "Timer paused · " + DateUtils.formatElapsedTime(remaining / 1000) + " left");
            builder.addAction(0, "Resume", serviceAction(context, TimerService.ACTION_RESUME, 12));
        } else {
            builder.setContentTitle("Focus time");
            if (state.endAt > 0L) {
                String at = DateUtils.formatDateTime(
                        context, state.endAt, DateUtils.FORMAT_SHOW_TIME);
                builder.setContentText("Next eye break at " + at);
            } else {
                builder.setContentText("Until your next eye break");
            }
            builder.addAction(0, "Take break", serviceAction(context, TimerService.ACTION_BREAK_NOW, 11));
            builder.addAction(0, "Pause", serviceAction(context, TimerService.ACTION_PAUSE, 13));
        }

        if ("break_due".equals(state.phase)) {
            builder.addAction(0, "Skip", serviceAction(context, TimerService.ACTION_SKIP, 15));
        }
        builder.addAction(0, "Stop", serviceAction(context, TimerService.ACTION_STOP, 14));

        return builder.build();
    }

    /** High-importance notification posted when screen time ends out of sight. */
    public static android.app.Notification buildAlert(Context context, TimerStateStore state) {
        boolean due = "break_due".equals(state.phase);
        long seconds = Math.max(1L, Math.round(state.breakMs / 1000.0));
        NotificationCompat.Builder builder = base(context, NotificationChannels.BREAKS)
                .setCategory(NotificationCompat.CATEGORY_REMINDER)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                // A normal notification (not the foreground-service one) so the
                // reminder can be swiped away on every Android version and shows
                // as a heads-up banner. It groups with the quiet service
                // notification so the shade still looks like one timer.
                .setGroup(GROUP)
                .setGroupSummary(true)
                .setGroupAlertBehavior(NotificationCompat.GROUP_ALERT_SUMMARY)
                // Clearing the alert is a stop: the delete intent cancels the
                // alarm and the timer instead of leaving them running unseen.
                .setOngoing(false);

        if (due) {
            builder.setContentTitle("Eye break due")
                    .setContentText("Open Lookaway to start your " + seconds + "-second break.")
                    .addAction(0, "Start break", openApp(context))
                    .addAction(0, "Snooze 5 min", serviceAction(context, TimerService.ACTION_SNOOZE, 22))
                    .addAction(0, "Skip", serviceAction(context, TimerService.ACTION_SKIP, 23));
        } else {
            builder.setContentTitle("Time to look away")
                    .setContentText(
                            "Look at something 20 feet (6 m) away for " + seconds + " seconds.")
                    .addAction(0, "Open", openApp(context))
                    .addAction(0, "Skip", serviceAction(context, TimerService.ACTION_SKIP, 23))
                    .addAction(0, "Stop", serviceAction(context, TimerService.ACTION_STOP, 14));
        }

        return builder.build();
    }

    /**
     * Minimal notification used only to satisfy the startForegroundService()
     * contract when a start and a stop race each other.
     */
    public static android.app.Notification buildStopped(Context context) {
        return new NotificationCompat.Builder(context, NotificationChannels.STATUS)
                .setSmallIcon(R.drawable.ic_stat_timer)
                .setContentTitle("Timer stopped")
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setSilent(true)
                .build();
    }

    public static void cancelAll(Context context) {
        NotificationManagerCompat.from(context).cancel(STATUS_ID);
        NotificationManagerCompat.from(context).cancel(ALERT_ID);
    }
}
