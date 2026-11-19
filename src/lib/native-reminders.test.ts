import { describe, expect, it, vi } from "vitest";
import type {
  LocalNotificationSchema,
  LocalNotificationsPlugin,
  PendingLocalNotificationSchema,
} from "@capacitor/local-notifications";

import {
  DEFAULT_SETTINGS,
  IDLE,
  MAX_RESTORE_AGE_MS,
  pause,
  resume,
  restoreTimer,
  serializeTimer,
  startBreak,
  startFocus,
} from "@/lib/eye-timer";
import { buildReminderSlots, reconcileReminderQueue } from "./native-reminders";

const T0 = 10_000_000;

function createPlugin(permission: "granted" | "denied" = "granted") {
  const pending: PendingLocalNotificationSchema[] = [];
  const plugin: Pick<
    LocalNotificationsPlugin,
    "checkPermissions" | "getPending" | "cancel" | "schedule"
  > = {
    checkPermissions: vi.fn(async () => ({ display: permission })),
    getPending: vi.fn(async () => ({ notifications: [...pending] })),
    cancel: vi.fn(async ({ notifications }: { notifications: { id: number }[] }) => {
      const ids = new Set(notifications.map(({ id }) => id));
      for (let i = pending.length - 1; i >= 0; i--) {
        if (ids.has(pending[i]!.id)) pending.splice(i, 1);
      }
    }),
    schedule: vi.fn(async ({ notifications }: { notifications: LocalNotificationSchema[] }) => {
      pending.push(...notifications);
      return { notifications: notifications.map(({ id }) => ({ id })) };
    }),
  };
  return { plugin, pending };
}

describe("native reminder scheduling", () => {
  it("schedules the first focus deadline and subsequent focus-break intervals", () => {
    const state = startFocus(DEFAULT_SETTINGS, T0);
    const slots = buildReminderSlots(state, DEFAULT_SETTINGS, T0);

    expect(slots[0]?.at).toBe(T0 + 20 * 60_000);
    expect(slots[1]?.at).toBe(T0 + 20 * 60_000 + 20_000 + 20 * 60_000);
    expect(slots.at(-1)!.at).toBeLessThanOrEqual(T0 + MAX_RESTORE_AGE_MS);
  });

  it("schedules the next focus deadline after an active break", () => {
    const state = startBreak(DEFAULT_SETTINGS, T0);
    expect(buildReminderSlots(state, DEFAULT_SETTINGS, T0)[0]?.at).toBe(T0 + 20_000 + 20 * 60_000);
  });

  it("honors working hours unless the user chose to continue outside them", () => {
    const now = new Date(2026, 0, 1, 20).getTime();
    const settings = {
      ...DEFAULT_SETTINGS,
      workHoursEnabled: true,
      workStart: "09:00",
      workEnd: "18:00",
      workDays: [4],
    };
    const state = startFocus(settings, now);

    expect(buildReminderSlots(state, settings, now)).toHaveLength(0);
    expect(buildReminderSlots(state, settings, now, true).length).toBeGreaterThan(0);
  });

  it("starts, pauses, resumes, and stops without leaving stale reminders", async () => {
    const { plugin, pending } = createPlugin();
    const started = startFocus(DEFAULT_SETTINGS, T0);
    await reconcileReminderQueue(plugin, started, DEFAULT_SETTINGS, T0);
    expect(pending.length).toBeGreaterThan(0);

    const paused = pause(started, T0 + 60_000);
    await reconcileReminderQueue(plugin, paused, DEFAULT_SETTINGS, T0 + 60_000);
    expect(pending).toHaveLength(0);

    const resumed = resume(paused, T0 + 5 * 60_000);
    await reconcileReminderQueue(plugin, resumed, DEFAULT_SETTINGS, T0 + 5 * 60_000);
    expect(pending[0]?.schedule?.at).toEqual(new Date(T0 + 24 * 60_000));

    await reconcileReminderQueue(plugin, IDLE, DEFAULT_SETTINGS, T0 + 6 * 60_000);
    expect(pending).toHaveLength(0);
  });

  it("does not duplicate pending reminders when reconciled repeatedly", async () => {
    const { plugin, pending } = createPlugin();
    const state = startFocus(DEFAULT_SETTINGS, T0);
    await reconcileReminderQueue(plugin, state, DEFAULT_SETTINGS, T0);
    const initialCount = pending.length;
    await reconcileReminderQueue(plugin, state, DEFAULT_SETTINGS, T0);

    expect(pending).toHaveLength(initialCount);
    expect(plugin.schedule).toHaveBeenCalledTimes(1);
  });

  it("uses inexact alarms that may fire during Doze without exact-alarm access", async () => {
    const { plugin } = createPlugin();
    await reconcileReminderQueue(plugin, startFocus(DEFAULT_SETTINGS, T0), DEFAULT_SETTINGS, T0);

    const scheduled = vi.mocked(plugin.schedule).mock.calls[0]?.[0].notifications[0];
    expect(scheduled?.isExactNotification).toBe(false);
    expect(scheduled?.schedule?.allowWhileIdle).toBe(true);
  });

  it("replaces future reminders when the configured interval changes", async () => {
    const { plugin, pending } = createPlugin();
    const state = startFocus(DEFAULT_SETTINGS, T0);
    await reconcileReminderQueue(plugin, state, DEFAULT_SETTINGS, T0);
    const changed = { ...DEFAULT_SETTINGS, focusMinutes: 25 };
    await reconcileReminderQueue(plugin, state, changed, T0);

    expect(pending[0]?.schedule?.at).toEqual(new Date(T0 + 20 * 60_000));
    expect(pending[1]?.schedule?.at).toEqual(new Date(T0 + 20 * 60_000 + 25 * 60_000 + 20_000));
    expect(plugin.cancel).toHaveBeenCalled();
    expect(plugin.schedule).toHaveBeenCalledTimes(2);
  });

  it("reconciles an active timer restored from storage", async () => {
    const { plugin, pending } = createPlugin();
    const saved = serializeTimer(startFocus(DEFAULT_SETTINGS, T0), T0);
    const restored = restoreTimer(saved, DEFAULT_SETTINGS, T0 + 5 * 60_000).state;
    await reconcileReminderQueue(plugin, restored, DEFAULT_SETTINGS, T0 + 5 * 60_000);

    expect(pending[0]?.schedule?.at).toEqual(new Date(T0 + 20 * 60_000));
  });

  it("cancels reminders and does not schedule when Android permission is denied", async () => {
    const { plugin, pending } = createPlugin();
    const state = startFocus(DEFAULT_SETTINGS, T0);
    await reconcileReminderQueue(plugin, state, DEFAULT_SETTINGS, T0);
    const denied = createPlugin("denied");
    denied.pending.push(...pending);

    const result = await reconcileReminderQueue(denied.plugin, state, DEFAULT_SETTINGS, T0);

    expect(result.permission).toBe("denied");
    expect(denied.pending).toHaveLength(0);
    expect(denied.plugin.schedule).not.toHaveBeenCalled();
  });

  it("cancels the queue when reminders are disabled", async () => {
    const { plugin, pending } = createPlugin();
    const state = startFocus(DEFAULT_SETTINGS, T0);
    await reconcileReminderQueue(plugin, state, DEFAULT_SETTINGS, T0);
    await reconcileReminderQueue(plugin, state, { ...DEFAULT_SETTINGS, notifications: false }, T0);

    expect(pending).toHaveLength(0);
  });
});
