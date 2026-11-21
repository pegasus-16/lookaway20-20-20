import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";

import { focusMs as focusDurationMs, type EyeSettings, type TimerState } from "./eye-timer";

/**
 * Bridge to the Android foreground service that owns the ongoing countdown
 * notification. Everything here is a no-op on the web build.
 */

export type NativeTimerPhase = "idle" | "focus" | "break" | "break_due";

export interface NativeTimerState {
  phase: NativeTimerPhase;
  endAt: number;
  pausedRemainingMs: number | null;
  durationMs: number;
  focusMs: number;
  breakMs: number;
  notifications: boolean;
  /** Wall-clock time of the last native change; used to reconcile on launch. */
  updatedAt: number;
}

export interface NativeTimerEvent {
  type: "break" | "skip";
  at: number;
  key: number;
}

interface NativeTimerSync {
  phase: Exclude<NativeTimerPhase, "idle">;
  endAt: number;
  pausedRemainingMs: number | null;
  durationMs: number;
  focusMs: number;
  breakMs: number;
  notifications: boolean;
}

interface TimerServicePlugin {
  start(options: NativeTimerSync): Promise<void>;
  update(options: NativeTimerSync): Promise<void>;
  stop(): Promise<void>;
  getState(): Promise<NativeTimerState>;
  consumeEvents(): Promise<{ events: NativeTimerEvent[] }>;
  setAppForeground(options: { foreground: boolean; timerScreen: boolean }): Promise<void>;
  /** Ask the service to advance a deadline that has already passed. */
  tick(): Promise<void>;
  addListener(
    eventName: "stateChanged",
    listener: (state: NativeTimerState) => void,
  ): Promise<PluginListenerHandle>;
}

const TimerService = registerPlugin<TimerServicePlugin>("TimerService");

export function isNativeTimerAvailable(): boolean {
  return (
    Capacitor.isNativePlatform() &&
    Capacitor.getPlatform() === "android" &&
    Capacitor.isPluginAvailable("TimerService")
  );
}

function toPayload(state: TimerState, settings: EyeSettings): NativeTimerSync | null {
  if (state.phase === "idle") return null;
  return {
    phase: state.phase,
    endAt: state.endsAt ?? 0,
    pausedRemainingMs: state.pausedRemainingMs,
    durationMs: state.durationMs,
    focusMs: focusDurationMs(settings),
    breakMs: Math.max(1, Math.round(settings.breakSeconds * 1_000)),
    notifications: settings.notifications,
  };
}

/** Mirror the current timer into the Android service. Never throws. */
export async function syncNativeTimer(state: TimerState, settings: EyeSettings): Promise<void> {
  if (!isNativeTimerAvailable()) return;
  try {
    const payload = toPayload(state, settings);
    if (!payload) {
      await TimerService.stop();
      return;
    }
    await TimerService.update(payload);
  } catch {
    // Keep the in-app timer working if the native side is unavailable.
  }
}

export async function getNativeTimerState(): Promise<NativeTimerState | null> {
  if (!isNativeTimerAvailable()) return null;
  try {
    return await TimerService.getState();
  } catch {
    return null;
  }
}

export async function consumeNativeTimerEvents(): Promise<NativeTimerEvent[]> {
  if (!isNativeTimerAvailable()) return [];
  try {
    const result = await TimerService.consumeEvents();
    return Array.isArray(result.events) ? result.events : [];
  } catch {
    return [];
  }
}

/**
 * Tells the native service whether the app is on screen, and whether the timer
 * screen itself is showing. The service only starts a due break while both are
 * true; a sheet (settings, stats, working hours, guide) or a hidden app parks
 * the break until the user is back on the timer.
 */
export async function setNativeAppForeground(
  foreground: boolean,
  timerScreen = true,
): Promise<void> {
  if (!isNativeTimerAvailable()) return;
  try {
    await TimerService.setAppForeground({ foreground, timerScreen });
  } catch {
    // The service is optional; keep the in-app timer working.
  }
}

/**
 * Asks the service to advance the phase when its deadline has passed. This is
 * only a fallback for the visible app: the service and its alarm own background
 * transitions, and the service ignores a tick when nothing is due.
 */
export async function requestNativeTick(): Promise<void> {
  if (!isNativeTimerAvailable()) return;
  try {
    await TimerService.tick();
  } catch {
    // The next heartbeat retries.
  }
}

export async function registerNativeTimerListener(
  listener: (state: NativeTimerState) => void,
): Promise<() => void> {
  if (!isNativeTimerAvailable()) return () => {};
  try {
    const handle = await TimerService.addListener("stateChanged", listener);
    return () => {
      void handle.remove();
    };
  } catch {
    return () => {};
  }
}
