package com.parth.lookaway;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.os.Build;

/**
 * Notification channels owned by the app.
 *
 * The foreground service uses {@link #STATUS} for its quiet ongoing
 * notification. A break alert is posted as a separate normal notification on
 * {@link #BREAKS}: foreground-service notifications are pinned on many Android
 * versions, so they cannot be swiped away or reliably show a heads-up banner.
 * The alert channel deliberately has no sound because {@link BreakAlarm} plays
 * a repeating alarm tone until the user acts, just like the Clock app. Channel
 * settings are immutable: if they ever need to change, create a new versioned
 * id instead of editing these.
 */
public final class NotificationChannels {
    public static final String BREAKS = "eye_breaks_v2";
    public static final String STATUS = "timer_status_v1";
    /** The first break channel played a single system tone; replaced by v2. */
    private static final String LEGACY_BREAKS = "eye_breaks_v1";

    private NotificationChannels() {}

    public static void ensure(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null) return;

        NotificationChannel breaks = new NotificationChannel(
                BREAKS,
                "Eye break alerts",
                NotificationManager.IMPORTANCE_HIGH);
        breaks.setDescription("Alerts when screen time is over and an eye break is due");
        // The repeating alarm tone is played by BreakAlarm, not the channel, so
        // the user hears one continuous alarm instead of a single notification
        // beep followed by silence.
        breaks.setSound(null, null);
        breaks.enableVibration(true);
        breaks.setVibrationPattern(new long[] { 0, 250, 200, 250 });
        breaks.enableLights(true);
        breaks.setShowBadge(true);
        breaks.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);

        NotificationChannel status = new NotificationChannel(
                STATUS,
                "Timer status",
                NotificationManager.IMPORTANCE_LOW);
        status.setDescription("Ongoing timer while a focus session is running");
        status.setSound(null, null);
        status.enableVibration(false);
        status.setShowBadge(false);
        status.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);

        manager.createNotificationChannels(java.util.Arrays.asList(breaks, status));
        // Remove the old single-beep channel so its settings don't linger.
        manager.deleteNotificationChannel(LEGACY_BREAKS);
    }
}
