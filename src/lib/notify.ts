import { Capacitor } from "@capacitor/core";

// Break reminders. Android only shows notifications that come from the service worker,
// so try that first and fall back to a page notification (desktop, editor preview).
export type ReminderResult = "native" | "worker" | "page" | "skipped" | "failed";

const OPTIONS = {
  tag: "lookaway",
  icon: "/icon-192.png",
  badge: "/icon-192.png",
  silent: false,
  renotify: true, // buzz again even though the tag replaces the previous reminder
  data: { url: "/" },
} as NotificationOptions;

export async function showReminder(title: string, body: string): Promise<ReminderResult> {
  if (Capacitor.isNativePlatform()) return "native";
  if (typeof Notification === "undefined" || Notification.permission !== "granted")
    return "skipped";
  const options = { ...OPTIONS, body };
  try {
    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      // getRegistration (not .ready) so this never hangs when no worker is installed.
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg?.active) {
        await reg.showNotification(title, options);
        return "worker";
      }
    }
  } catch {
    /* fall through to the page notification */
  }
  try {
    new Notification(title, options);
    return "page";
  } catch {
    return "failed"; // some mobile browsers only allow notifications from a service worker
  }
}
