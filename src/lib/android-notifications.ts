import { Capacitor } from "@capacitor/core";
import { LocalNotifications, type LocalNotificationSchema } from "@capacitor/local-notifications";

import type { EyeSettings, TimerState } from "./eye-timer";
import { isPaused, remainingMs, formatSpan, focusMs } from "./eye-timer";

export const TIMER_NOTIFICATION_ID = 20_2020;

/** Created natively in NotificationChannels.java; the native service plays the alarm. */
export const BREAK_CHANNEL_ID = "eye_breaks_v2";

export function isAndroidApp(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

export async function requestNativeNotificationPermission(): Promise<
  "granted" | "denied" | "prompt" | "unsupported"
> {
  if (!isAndroidApp()) return "unsupported";
  try {
    const status = await LocalNotifications.checkPermissions();
    if (status.display === "granted") return "granted";
    if (status.display === "denied") return "denied";
    const requested = await LocalNotifications.requestPermissions();
    return requested.display === "granted" ? "granted" : "denied";
  } catch {
    return "denied";
  }
}

export async function cancelTimerReminder(): Promise<boolean> {
  if (!isAndroidApp()) return false;
  try {
    await LocalNotifications.cancel({ notifications: [{ id: TIMER_NOTIFICATION_ID }] });
    return true;
  } catch {
    return false;
  }
}

export async function scheduleTimerReminder(
  state: TimerState,
  settings: EyeSettings,
  now = Date.now(),
): Promise<"scheduled" | "cancelled" | "denied" | "failed"> {
  if (!isAndroidApp()) return "cancelled";

  await cancelTimerReminder();
  if (!settings.notifications || state.phase === "idle" || isPaused(state)) return "cancelled";

  try {
    const permission = await LocalNotifications.checkPermissions();
    if (permission.display !== "granted") return "denied";
  } catch {
    return "failed";
  }

  const remaining = remainingMs(state, now);
  if (remaining <= 0) return "cancelled";
  const at = new Date(now + remaining);
  const notification: LocalNotificationSchema =
    state.phase === "focus"
      ? {
          id: TIMER_NOTIFICATION_ID,
          title: "Time to look away",
          body: `Look at something 20 feet (6 m) away for ${settings.breakSeconds} seconds.`,
          schedule: { at, allowWhileIdle: true, repeats: false },
          channelId: BREAK_CHANNEL_ID,
          isExactNotification: false,
          extra: { action: "break" },
          autoCancel: true,
        }
      : {
          id: TIMER_NOTIFICATION_ID,
          title: "Break complete",
          body: `Next break in ${formatSpan(focusMs(settings))}.`,
          schedule: { at, allowWhileIdle: true, repeats: false },
          channelId: BREAK_CHANNEL_ID,
          isExactNotification: false,
          extra: { action: "focus" },
          autoCancel: true,
        };

  try {
    await LocalNotifications.schedule({ notifications: [notification] });
    return "scheduled";
  } catch {
    return "failed";
  }
}

export async function reconcileTimerReminder(
  state: TimerState,
  settings: EyeSettings,
  now = Date.now(),
): Promise<void> {
  if (!isAndroidApp()) return;
  await scheduleTimerReminder(state, settings, now);
}

export function registerNativeNotificationTapHandler(): (() => void) | undefined {
  if (!isAndroidApp()) return undefined;
  let disposed = false;
  void LocalNotifications.addListener("localNotificationActionPerformed", () => {
    if (!disposed) window.location.href = "/";
  }).then((handle) => {
    if (disposed) void handle.remove();
  });
  return () => {
    disposed = true;
  };
}
