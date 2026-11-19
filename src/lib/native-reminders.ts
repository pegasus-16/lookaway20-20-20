import { Capacitor, type PermissionState } from "@capacitor/core";
import type {
  LocalNotificationSchema,
  LocalNotificationsPlugin,
  PendingLocalNotificationSchema,
} from "@capacitor/local-notifications";

import {
  MAX_RESTORE_AGE_MS,
  breakMs,
  focusMs,
  isPaused,
  isWithinWorkHours,
  type EyeSettings,
  type TimerState,
} from "@/lib/eye-timer";

export type ReminderPermission = NotificationPermission | "unsupported" | "error";

const REMINDER_ID_START = 71_000;
const MIN_INTERVAL_MS = 5 * 60_000 + 20_000;
const MAX_QUEUED_REMINDERS = Math.ceil(MAX_RESTORE_AGE_MS / MIN_INTERVAL_MS) + 1;

export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform();
}

function toPermissionState(permission: PermissionState): NotificationPermission {
  if (permission === "granted") return "granted";
  if (permission === "denied") return "denied";
  return "default";
}

async function loadNotifications() {
  return (await import("@capacitor/local-notifications")).LocalNotifications;
}

export async function checkNativeReminderPermission(): Promise<ReminderPermission> {
  if (!isNativePlatform()) return "unsupported";
  const notifications = await loadNotifications();
  return toPermissionState((await notifications.checkPermissions()).display);
}

export async function requestNativeReminderPermission(): Promise<ReminderPermission> {
  if (!isNativePlatform()) return "unsupported";
  const notifications = await loadNotifications();
  const current = toPermissionState((await notifications.checkPermissions()).display);
  if (current !== "default") return current;
  return toPermissionState((await notifications.requestPermissions()).display);
}

export interface ReminderSlot {
  id: number;
  at: number;
}

export function buildReminderSlots(
  state: TimerState,
  settings: EyeSettings,
  now: number,
  allowOutsideWorkHours = false,
): ReminderSlot[] {
  if (
    !settings.notifications ||
    state.phase === "idle" ||
    isPaused(state) ||
    state.endsAt === null ||
    (!allowOutsideWorkHours && !isWithinWorkHours(settings, new Date(now)))
  ) {
    return [];
  }

  const period = focusMs(settings) + breakMs(settings);
  let at = state.phase === "focus" ? state.endsAt : state.endsAt + focusMs(settings);
  if (at <= now || period <= 0) return [];

  const end = now + MAX_RESTORE_AGE_MS;
  const slots: ReminderSlot[] = [];
  while (at <= end && slots.length < MAX_QUEUED_REMINDERS) {
    if (!allowOutsideWorkHours && !isWithinWorkHours(settings, new Date(at))) break;
    slots.push({ id: REMINDER_ID_START + slots.length, at });
    at += period;
  }
  return slots;
}

function isLookawayNotification(notification: PendingLocalNotificationSchema): boolean {
  return (
    notification.id >= REMINDER_ID_START &&
    notification.id < REMINDER_ID_START + MAX_QUEUED_REMINDERS
  );
}

function timestamp(value: Date | undefined): number | undefined {
  if (!value) return undefined;
  const time = value instanceof Date ? value.getTime() : Date.parse(String(value));
  return Number.isFinite(time) ? time : undefined;
}

function makeNotification(slot: ReminderSlot, settings: EyeSettings): LocalNotificationSchema {
  return {
    id: slot.id,
    title: "Time to look away",
    body: `Look at something 20 feet (6 m) away for ${settings.breakSeconds} seconds.`,
    channelId: "default",
    autoCancel: true,
    isExactNotification: false,
    schedule: { at: new Date(slot.at), allowWhileIdle: true },
    extra: { lookawayReminder: true },
  };
}

export interface ReminderQueueResult {
  permission: NotificationPermission;
  scheduled: number;
}

export async function reconcileReminderQueue(
  notifications: Pick<
    LocalNotificationsPlugin,
    "checkPermissions" | "getPending" | "cancel" | "schedule"
  >,
  state: TimerState,
  settings: EyeSettings,
  now: number,
  allowOutsideWorkHours = false,
): Promise<ReminderQueueResult> {
  const permission = toPermissionState((await notifications.checkPermissions()).display);
  const slots =
    permission === "granted" ? buildReminderSlots(state, settings, now, allowOutsideWorkHours) : [];
  const pending = (await notifications.getPending()).notifications.filter(isLookawayNotification);
  const desired = new Map(slots.map((slot) => [slot.id, slot]));
  const pendingById = new Map(pending.map((item) => [item.id, item]));

  const toCancel = pending.filter((item) => {
    const slot = desired.get(item.id);
    return !slot || timestamp(item.schedule?.at) !== slot.at;
  });
  if (toCancel.length > 0) {
    await notifications.cancel({ notifications: toCancel.map(({ id }) => ({ id })) });
  }

  const cancelledIds = new Set(toCancel.map(({ id }) => id));
  const toSchedule = slots
    .filter((slot) => !pendingById.has(slot.id) || cancelledIds.has(slot.id))
    .map((slot) => makeNotification(slot, settings));
  if (toSchedule.length > 0) {
    await notifications.schedule({ notifications: toSchedule });
  }

  return { permission, scheduled: slots.length };
}

let reconciliation = Promise.resolve();

export function syncNativeReminders(
  state: TimerState,
  settings: EyeSettings,
  now: number,
  allowOutsideWorkHours = false,
): Promise<ReminderQueueResult | null> {
  if (!isNativePlatform()) return Promise.resolve(null);
  const operation = reconciliation.then(async () => {
    const notifications = await loadNotifications();
    return reconcileReminderQueue(notifications, state, settings, now, allowOutsideWorkHours);
  });
  reconciliation = operation.then(
    () => undefined,
    () => undefined,
  );
  return operation;
}
