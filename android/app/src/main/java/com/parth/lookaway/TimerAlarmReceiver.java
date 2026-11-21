package com.parth.lookaway;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Alarm and notification callbacks; work even if the service was killed. */
public class TimerAlarmReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) return;
        if (TimerService.ACTION_TICK.equals(intent.getAction())) {
            TimerService.handleAlarm(context.getApplicationContext());
        } else if (TimerService.ACTION_DISMISS.equals(intent.getAction())) {
            TimerService.handleDismiss(context.getApplicationContext());
        }
    }
}
