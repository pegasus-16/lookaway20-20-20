# Lookaway20

Offline 20-20-20 eye-care timer built with React, TanStack Start and Capacitor.

## Web development

```sh
npm install
npm run dev
npm test
npm run build
```

The existing PWA and web build remain available.

## Android build

Prerequisites:

- Node.js 20+
- JDK 21
- Android SDK Platform 36
- Android SDK Build Tools
- `ANDROID_HOME` or `ANDROID_SDK_ROOT`

Prepare the local web assets and sync Capacitor:

```sh
npm run android
```

Build a debug APK:

```sh
npm run android:debug
```

Debug APK output:

`android/app/build/outputs/apk/debug/app-debug.apk`

### Install on a phone

The reliable way is the install script. It waits for the phone, stops the old
app, retries a failed first attempt, falls back to a non-streamed install, and
uninstalls only when the existing app was signed with a different key:

```sh
npm run android:install          # install the APK that was built last
npm run android:build-install    # build, install, then launch
```

Options: `--serial <id>` when several phones are connected, `--apk <path>`, and
`--uninstall` when you already want a clean install (this erases Lookaway's
local settings and stats).

Manual install:

```sh
adb install -r -g android/app/build/outputs/apk/debug/app-debug.apk
```

If the first attempt fails, run the same command again. If it still fails:

1. Unlock the phone and accept the USB debugging prompt (tick **Always allow**).
2. Disable battery optimisation for **Lookaway** (ColorOS: Settings → Battery →
   More settings → Optimise app battery usage).
3. If the message says the app signature does not match, the old copy came from
   another computer, a store build, or a release build. Uninstall it first:
   `adb uninstall com.parth.lookaway` (this erases local data), then install.
4. If installing the APK from a file manager, allow **Install unknown apps** for
   that file manager. If Play Protect scans the app, tap **More details** →
   **Install anyway**.
5. Free storage if the phone reports insufficient space, and retry after a
   reboot if the package manager is stuck.

Debug APKs are signed with the debug key of the machine that built them. An APK
built on another computer cannot update this one; uninstall and reinstall, or
always build from the same checkout/machine.

After installing, open Lookaway once and allow notifications. The break alert is
posted as a heads-up banner. Swiping the alert (or its grouped timer card) away
stops the timer and the alarm; the **Stop** action does the same.

### Debug build extras

`npm run android:debug` builds the web bundle in development mode, which enables
debug-only testing aids:

- The settings sliders use seconds: 10–60 s of screen time and 5–30 s breaks.
  A saved minute-based timing is converted to a 10-second focus when the debug
  app first loads.
- A **Debug tools** card appears at the bottom of the home screen with
  **Seed 5-day streak**, **Add today's break**, and **Clear stats** buttons.

To test streaks, stop the timer, change the phone's date (turn off automatic
date/time first), open the app, and complete a break. Repeat for each day. The
streak card and week dots update from the stored day keys. Restore automatic
date/time afterwards.

For a release APK:

```sh
cd android
./gradlew assembleRelease
```

Release signing is not configured in the repository. Configure a local keystore
through `android/gradle.properties` or Gradle environment variables. Do not
commit passwords or signing keys.

## Android architecture

- TanStack Start's SPA shell is prerendered and copied into `dist/`.
- Capacitor loads packaged assets from the Android WebView.
- Timer rules remain in `src/lib/eye-timer.ts`; the UI only calls those rules.
- Browser timer state remains in `lookaway:*` localStorage keys.
- A native foreground service (`TimerService`) mirrors the running focus/break
  phase, owns phase transitions while the WebView is backgrounded, and keeps one
  ongoing notification alive. It also survives the app being swiped away.
- A break only starts while the app is on screen. If focus time ends while the
  app is backgrounded, the service marks the break as due (`break_due`), shows
  an **Eye break due** notification, and stops advancing. Opening the app
  starts the break; when it finishes, the next focus phase starts
  automatically. This prevents the timer from cycling focus/break forever
  without the user ever seeing a break.
- `TimerNotifications` posts two pieces that look like one grouped timer:
  - The foreground service owns a quiet, ongoing `timer_status_v1` notification
    ("Focus time" with the next break time, or "Eye break"/"Paused"). It
    deliberately has no countdown chronometer: Android kept counting below zero
    between the deadline and the service update, which showed "-1" in the
    shade.
  - A break alert is a separate normal notification on the high-importance
    `eye_breaks_v2` channel, grouped under the service notification. It is not a
    foreground-service notification on purpose: those are pinned on many
    Android versions and would not show a reliable heads-up banner. Because it
    is a normal notification it can be swiped away, and its delete intent stops
    the timer and the alarm. The channel is soundless; `BreakAlarm` synthesises
    a repeating Clock-like tone on `USAGE_ALARM` until the user starts, snoozes
    or skips the break, so the alarm volume, silent mode and Do Not Disturb
    still apply. Channel ids are versioned because Android does not allow
    changing a channel's settings.
- The visible countdown also nudges the service when its deadline has just
  passed. System alarms can arrive a fraction of a second late; the fallback
  keeps a break from sitting at `00:00`, and the service still owns the
  transition, so a break is never counted twice.
- JavaScript adopts the native state on launch and resume, and drains completed
  break/skip events from `TimerStateStore` into `DayStats` exactly once. On
  Android, JS never runs its own phase transitions, so breaks cannot be counted
  twice.
- Screen-time stats are batched to one save per second (flushed when the page is
  hidden) instead of being recalculated on every 250 ms countdown tick, and the
  break photo is preloaded. This keeps the focus → break transition smooth.
- While the app is on screen, the break overlay and the Web Audio chime are
  enough: no high-importance notification is posted and the alarm tone is not
  played.
- The Android manifest explicitly removes Bluetooth, nearby Wi-Fi and UWB
  permissions with `tools:node="remove"`; Lookaway has no nearby-device
  features and must not ask for that permission group.
- `src/lib/android-notifications.ts` remains the fallback for builds without the
  native plugin (for example the web/PWA). When the native timer is available
  the old one-shot `@capacitor/local-notifications` reminder is cancelled.
- Android 13+ notification permission is requested only when notifications
  are enabled and permission has not already been denied.
- Alarms use exact scheduling when the OS allows it and fall back to an inexact
  allow-while-idle alarm otherwise. OEM battery restrictions can still delay
  reminders on some devices.

The Android build is offline: JavaScript, CSS, images and fonts are packaged,
and no backend or remote API is required.
