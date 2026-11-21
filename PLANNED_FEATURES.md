# Planned features — feasibility and implementation report

Status: **features 2 and 3 implemented; feature 1 (calendar) still planned.**

Last updated: 2026-11-20  
Target: Android app (`com.parth.lookaway`, min SDK 24, target SDK 36)  
Test device: CPH2487 (rooted, Android/ColorOS)

## Summary

| #   | Feature                                                       | Feasibility                  | Main constraint                                         | Effort    | Status      |
| --- | ------------------------------------------------------------- | ---------------------------- | ------------------------------------------------------- | --------- | ----------- |
| 1   | Calendar for streak visualization                             | **High**                     | None; data already exists                               | 0.5–1 day | Planned     |
| 2   | Persistent notification with ongoing timer                    | **Medium**                   | Needs native Android code (foreground service)          | 2–4 days  | Implemented |
| 3   | Use Android notifications for all alerts (system tone/volume) | **High**, with native polish | Channel sound is immutable and must be created natively | 1–2 days  | Implemented |

Features 2 and 3 should be built together: both need one small native
notification layer. Feature 1 is independent and can ship first.

## Implementation status (2026-11-20)

Features **2 (ongoing timer)** and **3 (Android notification behavior)** are
implemented and tested on CPH2487:

- `TimerService` is a `specialUse` foreground service. It mirrors the running
  phase, advances focus/break with `AlarmManager`, and keeps the quiet ongoing
  status notification. The status text shows the next break time instead of a
  countdown chronometer, which could tick below zero ("-1") before the service
  updated.
- `NotificationChannels` creates `eye_breaks_v2` (high importance, vibration,
  no channel sound) and `timer_status_v1` (low importance, silent). A break
  alert is a normal notification grouped under the service notification, not a
  second foreground-service notification: foreground-service notifications are
  pinned on many Android versions, cannot be swiped away, and do not reliably
  show a heads-up banner. The alert is dismissible, and its delete intent stops
  the alarm and the timer.
- `BreakAlarm` synthesises a repeating Clock-like tone on `USAGE_ALARM` until
  the user starts, snoozes or skips the break (with a 60-second safety stop).
  The alarm volume, silent mode and Do Not Disturb rules apply; no audio files
  are shipped.
- Break reminders have Start break / Snooze 5 min / Skip actions. The status
  notification has Pause/Resume/Stop and Take break.
- The manifest removes Bluetooth, nearby Wi-Fi and UWB permissions with
  `tools:node="remove"`; the app has no nearby-device features.
- `TimerStateStore` persists the native mirror and records completed breaks and
  skips. JavaScript drains those events into `DayStats` exactly once, and does
  not run its own phase transitions while the native timer is available.
- The service survives the app being swiped away; alarms are exact when the OS
  permits and fall back to inexact allow-while-idle otherwise.
- The visible countdown nudges the service when a deadline just passed, so a
  late system alarm cannot leave a break at `00:00`; the service still decides
  the transition, so nothing is counted twice. Screen-time stats are batched to
  one save per second, and the break photo is preloaded, which smooths the
  focus → break change.
- The one-shot `@capacitor/local-notifications` reminder remains as a fallback
  only when the native plugin is unavailable.
- `npm run android:install` / `android:build-install` retries a failed install,
  falls back to a non-streamed install, and uninstalls only for a signing-key
  mismatch (documenting that local data is erased).

The "Current state (audit)" and the option/design sections below describe the
app **before** this implementation and the original plan; they are kept as the
rationale. Where they conflict with the summary above, the summary and the
shipped code win (for example: a dismissible alert grouped with the service
notification, no countdown chronometer, and a synthesized repeating alarm
instead of the system notification tone).

Feature **1 (calendar)** is still not implemented.

---

## Current state (audit, before the native implementation)

What exists today:

- `src/lib/android-notifications.ts` schedules **one** local notification
  (`TIMER_NOTIFICATION_ID = 202020`) at the end of the current phase.
- It is reconciled whenever the timer changes, when the app becomes visible,
  and on `pageshow`.
- Notifications are **inexact** (`isExactNotification: false`), so Doze can
  delay them.
- No `channelId` is passed, so the plugin's generic `default` channel is used.
- The notification has no actions (take break / snooze / skip).
- `src/lib/notify.ts` skips the Web Notification API on native, so there is no
  duplicate web notification.
- `playSound()` still plays the synthesized Web Audio chime in the Android
  WebView whenever `settings.sound` is on.
- `settings.volume` only affects that synthesized chime. It does not affect
  Android notification loudness.
- Notification permission is requested on Start when notifications are enabled.
- The app already has `POST_NOTIFICATIONS`, `SCHEDULE_EXACT_ALARM`,
  `RECEIVE_BOOT_COMPLETED`, `WAKE_LOCK`, and the plugin's boot receiver.

Verified on the installed debug build on CPH2487:

```
AppSettings: com.parth.lookaway (10346) importance=DEFAULT
  NotificationChannel{mId='default', mName=Default, mImportance=3,
    mSound=content://settings/system/notification_sound,
    mVibrationEnabled=false, mAudioAttributes=usage=USAGE_NOTIFICATION ...}
```

So the current channel **does** use the system default notification tone on
this device. That happens implicitly (the plugin leaves the sound unset), not
because the app configures it. It is not guaranteed on every Android version or
OEM, and the channel is generic.

Two visible consequences:

1. **Possible double alert.** At break start the OS notification fires and the
   WebView also plays the synthesized chime. Both are triggered from the same
   event. This should be confirmed on the device, but the code path allows it.
2. **Reminders stop when the app is killed.** After the currently scheduled
   notification fires, nothing schedules the next focus/break unless the app is
   reopened to reconcile.

---

## Feature 1 — Calendar for streak visualization

**Feasibility: high.** No backend, no new dependency, no storage change.

### Why it is easy

`lookaway:stats` already stores one `DayStats` entry per calendar day forever:

```ts
interface DayStats {
  breaks: number;
  skipped: number;
  screenMs: number;
}
```

`computeStreak()` already walks the full history and is not capped at one week.
Only the current UI is capped: `lastDays(..., 7)` and `weekInsights(..., 7)`.

### Design

- Add a **Streak calendar** dialog, opened by tapping the streak card or a
  "Calendar" link beside the week dots.
- Show one month at a time in a 7-column grid, Sunday-first to match
  `DAY_LETTER`.
- Each day has one state:
  - **done** — at least one completed break
  - **today, not done** — dashed outline, neutral (matches current rule)
  - **rest day** — muted, not counted as missed
  - **missed** — working day with no break
  - **no data** — before the first stored day or in the future
- Month header: month name, previous/next arrows (next disabled past the
  current month).
- Month summary: days rested, breaks, skips, screen time, best run in that
  month.
- Optional: tap a day to show a small popover with exact counts.
- Keep the existing "Your week" dialog; add a "Full calendar" link to it.

The important detail is **no-data vs missed**. A new user should not see a wall
of red for days before they installed the app. Compute the first stored day and
treat anything earlier as no-data.

### Implementation

1. Add a pure helper in `src/lib/eye-timer.ts`:

   ```ts
   export interface CalendarCell {
     key: string | null;      // null = leading/trailing blank
     day: number | null;
     done: boolean;
     restDay: boolean;
     isToday: boolean;
     hasData: boolean;
     inMonth: boolean;
   }

   export function monthCalendar(
     all: Record<string, DayStats>,
     month: Date,
     isWorkDay: (d: Date) => boolean,
     today?: Date,
   ): { cells: CalendarCell[]; summary: {...} };
   ```

   - Build 5 or 6 weeks with leading blanks from `new Date(y, m, 1).getDay()`.
   - Use local dates only (`dayKey` / `parseDayKey`), never UTC parsing.
   - Reuse the `computeStreak` rules for the month's best run, or add a small
     `bestRunInRange()` helper. Do not duplicate streak logic.

2. Add tests in `src/lib/eye-timer.test.ts`:
   - month starting on Sunday and on Saturday
   - February in a leap year
   - first stored day vs earlier no-data
   - rest days and today
   - DST transition month
3. Add `src/components/eye/StreakCalendarDialog.tsx` using the existing
   `PanelDialog` for consistent styling.
4. Make `StreakCard` tappable (button semantics + focus ring) and render the
   dialog from `src/routes/index.tsx`.
5. Accessibility: `role="grid"`, each cell has
   `aria-label="17 November: 3 breaks"`, and arrows/Enter work on the grid.

### Risks

- Timezone/day-key mistakes. Already handled by local-date helpers; add tests.
- Very long history: rendering one month is constant work, so no issue.
- Working-hours changes: past rest days are judged with the **current**
  working-day settings, same as the existing streak card. Acceptable, but note
  it in the UI ("rest day" is based on current schedule).

**Effort:** 4–8 hours including tests.

---

## Feature 2 — Persistent notification with an ongoing timer

**Feasibility: medium.** A JS-only version is easy but not a real solution. A
foreground service is the correct approach and is fully supported on this app's
min SDK.

### Option A — JS-only ongoing notification (not recommended as the final state)

- Schedule a notification with `ongoing: true` from the WebView and rewrite its
  text every few seconds.
- Works only while the app is running and visible. Android throttles/suspends
  WebView timers in the background, so the countdown freezes.
- Updating a delivered notification means re-posting it (the plugin's `update`
  only updates pending notifications), which can buzz repeatedly unless the
  channel is silent.
- Useful as a 1-hour prototype, not as the shipped behavior.

### Option B — native foreground service (recommended)

Use a small custom Capacitor plugin plus an Android foreground service. The
shipped version deliberately avoids the OS countdown chronometer: Android kept
ticking below zero ("-1") between the deadline and the service update. The
collapsed text shows the next break time instead, and no per-second JS updates
are needed.

#### Notification layout

- **One foreground notification**, posted under two ids so switching between
  them replaces the old one instead of leaving a duplicate:
  - quiet status (`timer_status_v1`, `IMPORTANCE_LOW`, silent, no badge):
    "Focus time" with the next break time, or "Eye break"/"Paused"; actions
    **Pause/Resume**, **Take break now**, **Stop**
  - break alert (`eye_breaks_v2`, `IMPORTANCE_HIGH`, vibration, no channel
    sound): "Time to look away" or "Eye break due"; actions **Start break**,
    **Snooze 5 min**, **Skip**
  - `setOngoing(true)`, `setOnlyAlertOnce(true)`; tapping opens the app
- `BreakAlarm` plays a repeating synthesised tone on `USAGE_ALARM` while the
  alert is showing, so it rings like the Clock app rather than beeping once.

```kotlin
NotificationCompat.Builder(this, NotificationChannels.STATUS)
    .setSmallIcon(R.drawable.ic_stat_timer)
    .setContentTitle(if (phase == FOCUS) "Focus time" else "Eye break")
    .setContentText("Next break at 14:32")
    .setOngoing(true)
    .setOnlyAlertOnce(true)
    .setSilent(true)
    .setWhen(endAt)
    .setUsesChronometer(true)
    .setChronometerCountDown(true)
    .addAction(0, "Pause", pauseIntent)
    .addAction(0, "Take break", breakIntent)
    .addAction(0, "Stop", stopIntent)
    .setContentIntent(openAppIntent)
    .build()
```

#### Native pieces

1. `TimerService` (`android/app/src/main/java/com/parth/lookaway/TimerService.kt`)
   - `startForeground()` on `ACTION_START`
   - action intents for pause/resume/break/stop
   - `START_STICKY`; `stopForeground(STOP_FOREGROUND_REMOVE)` on stop
   - no wakelock: the chronometer is render-only
2. `TimerServicePlugin` (Capacitor plugin)
   - `start({ phase, endAt, pausedRemainingMs, focusMs, breakMs })`
   - `update(...)` on phase/pause/resume changes only
   - `stop()`
   - emits an `action` event to JS
   - register in `MainActivity.onCreate()` **before** `super.onCreate()`:
     `registerPlugin(TimerServicePlugin.class);`
3. `NotificationChannels` helper (see feature 3) called from
   `MainActivity.onCreate()` and from the service.
4. Manifest additions:

   ```xml
   <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
   <uses-permission android:name="android.permission.FOREGROUND_SERVICE_SPECIAL_USE" />

   <service
       android:name=".TimerService"
       android:exported="false"
       android:foregroundServiceType="specialUse">
       <property
           android:name="android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE"
           android:value="eye_break_timer" />
   </service>
   ```

   `specialUse` is the right type for a timer. `dataSync` has a 6-hour/24-hour
   cap on Android 15 and does not fit. Play Store review requires a
   justification for `specialUse`; sideloaded builds are unaffected.

5. JS wrapper `src/lib/timer-service.ts`:
   - no-op on web and iOS
   - `isAndroidApp()` guard, same pattern as `android-notifications.ts`
   - called from the existing timer effects, but only on state changes, not on
     every 250 ms tick

#### Keeping JS as the source of truth

The project rule is that timer rules stay pure in `src/lib/eye-timer.ts`. The
service must not become a second timer engine.

Recommended split:

- **JS owns** focus/break decisions, working hours, kids mode, auto-pause, and
  stats.
- **Native owns** the visual countdown and notification actions while the app
  is alive.
- If the app process is killed, the service can still count down the current
  phase and post the next reminder using the last `endAt`/durations. It should
  **not** try to reimplement working hours or kids mode.
- Persist the last native snapshot (`phase`, `endAt`, `pausedRemainingMs`,
  `updatedAt`) in `SharedPreferences`. On next launch, JS restores
  localStorage and, if the native snapshot is newer, adopts it once and then
  reconciles normally. This is a narrow, documented exception to "localStorage
  is the only source"; it is required to survive process death.

An alternative is to move the whole timer to native. That is a large rewrite
and is not recommended.

#### Actions when the app is dead

- Pause/Resume/Take break/Stop intents go to `TimerService`.
- If the WebView is alive, forward the action to JS and let it run the existing
  `actions` functions.
- If it is not alive, update the native snapshot and show the new phase. The
  next app launch merges the snapshot.
- Keep the exact break alarm as the authoritative reminder; the service is for
  display and controls.

#### Scheduling beyond the current phase

Even without the service, reliability improves a lot by pre-scheduling the next
few notifications (absolute times, alternating focus/break) and cancelling them
when the user pauses/skips/stops. The plugin persists schedules and restores
them after boot. This covers "phone in pocket for an hour" without a service.
The foreground service adds the live countdown and controls on top.

### Android constraints to plan for

- **Android 13+**: `POST_NOTIFICATIONS` can be denied. The FGS still runs, but
  the user may not see the notification. Show an in-app banner with a link to
  system settings.
- **Android 12+**: starting an FGS from the background throws
  `ForegroundServiceStartNotAllowedException`. Only start it from the user's
  Start tap (or another visible action).
- **Android 14+**: a foreground service type is mandatory; missing it crashes
  on `startForeground`.
- **Android 15+**: `specialUse` has no short-service timeout, unlike `dataSync`.
- **Exact alarms**: with target SDK 36, `SCHEDULE_EXACT_ALARM` is not granted by
  default. The plugin can open "Alarms & reminders" settings when
  `isExactNotification: true`. Without it, Doze can delay a 20-minute reminder
  by many minutes. Add a clear in-app prompt and fall back gracefully.
- **ColorOS/OPPO**: aggressive battery management can kill background work.
  Provide a "Battery optimization" help row that opens the app's battery
  settings; do not assume the service survives without it.
- **Notification channels are immutable**: once created, sound/importance
  cannot be changed by the app. Use versioned IDs (`eye_breaks_v2`,
  `timer_status_v1`) and bump the version if the configuration changes.

### Testing

- 10 s focus / 20 s break debug build, screen locked
- app in background, app swiped away from recents
- pause/resume/stop from the notification
- reboot with a timer running
- battery saver and Doze (`adb shell dumpsys deviceidle force-idle`)
- permission denied, then granted from settings
- ColorOS autostart/battery restrictions on and off

**Effort:** 2–4 days, plus device testing.

---

## Feature 3 — Use Android notifications for all alerts (system tone/volume)

**Feasibility: high** for the core behavior, **medium** for full parity. The app
already posts OS notifications and, on this device, already plays the system
tone. What is missing is explicit configuration, no double sound, actions, and
reliable scheduling.

### Target behavior

- Every reminder is an Android notification.
- Sound, loudness, vibration, DND, and per-app notification settings are owned
  by Android, not by a Web Audio gain slider.
- The in-app synthesized chime is either disabled on Android or offered as an
  explicit alternative ("App chime" vs "System notification tone").
- Notification actions work from the lock screen and from a cold start.

### Implementation

1. **Create explicit channels natively** in
   `android/app/src/main/java/com/parth/lookaway/NotificationChannels.kt`:

   ```kotlin
   val attrs = AudioAttributes.Builder()
       .setUsage(AudioAttributes.USAGE_NOTIFICATION)
       .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
       .build()

   val breaks = NotificationChannel(
       "eye_breaks_v1",
       "Eye break reminders",
       NotificationManager.IMPORTANCE_HIGH,
   ).apply {
       description = "Look 20 feet away for 20 seconds"
       setSound(Settings.System.DEFAULT_NOTIFICATION_URI, attrs)
       enableVibration(true)
   }

   val status = NotificationChannel(
       "timer_status_v1",
       "Timer status",
       NotificationManager.IMPORTANCE_LOW,
   ).apply {
       setSound(null, null)
       setShowBadge(false)
   }
   ```

   Call `NotificationChannels.ensure(this)` from `MainActivity.onCreate()`.

   **Why native and not `LocalNotifications.createChannel`:** the plugin's
   channel API accepts only a raw-resource filename, not a URI, and its default
   channel path uses `USAGE_ALARM` when a custom sound is set. `USAGE_ALARM`
   follows alarm volume, not notification volume. Creating the channel in
   Kotlin with `Settings.System.DEFAULT_NOTIFICATION_URI` and
   `USAGE_NOTIFICATION` is the only way to guarantee the default notification
   stream.

2. **Pass `channelId` on every notification** in `android-notifications.ts`:
   - break reminder → `eye_breaks_v1`
   - future status notification → `timer_status_v1`
   - never rely on the implicit `default` channel again

3. **Remove the double alert.** On Android, when native notifications are
   enabled, do not also call `playSound()` for the same event. Options:
   - simplest: gate `playSound` with `!isAndroidApp()` when
     `settings.notifications` is on
   - nicer: add `soundMode: "system" | "app" | "off"` to settings.
     `system` is the default on Android; `app` keeps the current chime for
     people who prefer it; `off` is silent.
   - Keep the existing `soundKind`/`volume` for web/PWA and for `"app"` mode.
   - Relabel the Android settings row accordingly: "Notification sound"
     (system) vs "App chime" (synthesized). The volume slider must not pretend
     to control system notification volume.

4. **Add notification actions** with
   `LocalNotifications.registerActionTypes()`:
   - **Take break** → `breakNow`
   - **Snooze 5 min** → `snooze`
   - **Skip** → `skipBreak`
   - Handle `localNotificationActionPerformed` in
     `registerNativeNotificationTapHandler()`, match on `extra.action`, and
     route to the existing hook actions.
   - On a cold start, the action is delivered after the listener is attached;
     make sure the handler is registered before reconciling.

5. **Make timing punctual.** Set `isExactNotification: true` when the user has
   granted exact alarms; otherwise fall back to inexact and tell the user.
   Add a one-time prompt that opens the system "Alarms & reminders" screen.
   Keep `allowWhileIdle: true`.

6. **Schedule a short chain, not just one notification.** Compute the next N
   phase boundaries (for example the next 6) and schedule them with stable IDs.
   Cancel and recompute on pause/resume/skip/stop/settings changes. This keeps
   reminders working for a while after the app is killed, without a service.
   The foreground service from feature 2 can replace this chain later.

7. **Use a proper status-bar icon.** Add `res/drawable/ic_stat_timer.xml`
   (monochrome) and set `smallIcon` in `capacitor.config.ts` or via the native
   builder. The launcher icon is not suitable for the status bar.

8. **Permission UX.** If permission is denied:
   - keep the in-app timer working
   - show a small "Notifications are off" row with an "Open settings" button
   - do not repeatedly re-prompt (Android stops showing the dialog anyway)

### What Android controls automatically

Once the channel is correct:

- notification sound = the tone chosen in Android settings
- loudness = the notification stream volume (volume rocker)
- vibration = channel + system settings
- DND / silent mode = system behavior
- per-app and per-channel user overrides = system settings

That is exactly the requested behavior. The app should not try to read or
change system volume.

### Testing

- Set a distinctive system notification tone in Android settings; verify the
  app uses it.
- Change notification volume with the volume rocker while the app is
  backgrounded; verify loudness changes.
- Enable DND; verify silence.
- Long-press the notification; verify the channel is named "Eye break
  reminders" and opens the right settings page.
- Deny permission, then grant it from settings.
- Verify the synthesized chime is not also playing (no double alert).
- Verify actions work with the app foregrounded, backgrounded, and killed.

**Effort:** 1–2 days, including channel/action plumbing and device QA.

---

## Suggested delivery order

1. **Calendar** — independent, no native risk, immediately useful.
2. **Notification correctness** — explicit channels, system tone, no double
   sound, actions, exact alarms, short schedule chain.
3. **Foreground service** — live ongoing countdown with chronometer and
   controls; merge the native snapshot on launch.
4. **Polish** — status icon, battery-optimization help, permission banner,
   settings copy, OEM testing.

Doing 2 before 3 avoids building the service against a generic, silent channel
and then having to redo it.

## Testing checklist (device)

- [ ] 10 s / 20 s debug timings
- [ ] notification appears with the system default tone
- [ ] notification volume follows the notification stream
- [ ] DND silences it
- [ ] no double sound (OS + Web Audio)
- [ ] actions work foreground / background / killed
- [ ] timer survives screen lock and app swipe-away
- [ ] reboot restores scheduled notifications
- [ ] exact alarm granted and denied paths
- [ ] notification permission denied path
- [ ] ColorOS battery optimization on/off
- [ ] streak calendar: month boundaries, no-data days, rest days, today
- [ ] `npm test`, `tsc --noEmit`, production build

## Risks and mitigations

| Risk                                              | Impact                     | Mitigation                                                                                      |
| ------------------------------------------------- | -------------------------- | ----------------------------------------------------------------------------------------------- |
| Channel sound cannot be changed after creation    | Wrong/silent sound forever | Versioned channel IDs; create them natively                                                     |
| Double alert (OS + Web Audio)                     | Annoying                   | Gate the chime on Android or add a sound-mode setting                                           |
| Doze delays inexact alarms                        | Late reminders             | Exact alarm permission + fallback + copy explaining it                                          |
| OEM kills background service                      | Countdown disappears       | Battery-optimization help; alarms still fire                                                    |
| Android 14 FGS type missing                       | Crash on start             | Declare `foregroundServiceType="specialUse"`                                                    |
| Android 12 background FGS start                   | Exception                  | Start only from a visible user action                                                           |
| Native snapshot vs localStorage                   | Divergent state            | One-time merge by `updatedAt`, then JS reconciles                                               |
| `npx cap sync` overwrites native work             | Lost code                  | Keep custom code under `android/app/src/main/java/com/parth/lookaway/`; sync does not delete it |
| Play Store policy for exact alarms / `specialUse` | Rejection                  | Sideload is unaffected; document justification if publishing                                    |

## Open questions

1. Should the ongoing timer keep running **after the app is swiped away**, or
   is "while the app is alive" enough? This decides whether the foreground
   service is required.
2. Keep the synthesized chime as an option on Android, or replace it entirely
   with the system tone?
3. Calendar as a dialog from the streak card, or a separate screen/tab?
4. Is Play Store distribution planned? If yes, the `specialUse` foreground
   service and exact-alarm permission need policy justifications.

## Out of scope

- Cloud sync or accounts.
- Rewriting the timer engine in Kotlin.
- Reading or changing system volume.
- Custom notification sounds bundled in the APK (the goal is the system tone).
