# Flutter rewrite

Status: **scaffolding** · Branch: `flutter-rewrite` · Started 2026-11-21

This branch prepares a native Flutter rebuild of Lookaway while the shipped
Capacitor app keeps working from the same repository. Nothing here replaces the
React/TanStack web app or the Capacitor Android app yet; they stay untouched in
`src/` and `android/`.

## Why Flutter

The Android build is currently a WebView shell plus a hand-written foreground
service. Most of the timer polish (notification swapping, a synthesised alarm,
offsetting the WebView heartbeat) exists to bridge the gap between JavaScript
timers and Android background limits. Flutter builds one native app for Android
(and later iOS/desktop), removes the WebView from the timing path, and keeps the
UI and the service in one process.

## Toolchain

Installed on this machine (Fedora 44):

| Tool           | Version / path                                            |
| -------------- | --------------------------------------------------------- |
| Flutter        | stable 3.50.1 (`~/development/flutter`, on `PATH`)         |
| Dart           | bundled with Flutter                                      |
| JDK            | Temurin 21 (`~/.local/opt/temurin-21`)                    |
| Android SDK    | `~/workspace/tools/Applications/AndroidSDK` (`ANDROID_HOME`) |
| Platform 36/37 | installed, build-tools 36.0.0, `cmdline-tools;latest`     |
| adb            | platform-tools 37.x                                       |

Fresh machine:

```sh
# Flutter
mkdir -p ~/development && cd ~/development
curl -fLO https://storage.googleapis.com/flutter_infra_release/releases/stable/linux/flutter_linux_3.50.1-stable.tar.xz
tar xf flutter_linux_3.50.1-stable.tar.xz
fish_add_path ~/development/flutter/bin   # or: export PATH="$HOME/development/flutter/bin:$PATH"

# Android SDK packages (ANDROID_HOME must already point at the SDK)
sdkmanager "platform-tools" "platforms;android-36" "build-tools;36.0.0" "cmdline-tools;latest"
flutter doctor --android-licenses
flutter doctor -v
```

`flutter doctor` may suggest Android Studio. It is only an IDE; the CLI, `adb`
and the SDK above are enough to build, install and debug. Linux desktop builds
would additionally need `clang cmake ninja-build pkgconf-pkg-config gtk3-devel`
(`sudo dnf install ...`); Android builds do not.

## Layout

```
flutter_app/          new Flutter project (package lookaway)
  lib/                Dart source
  android/            generated Android host (minSdk 24, target/compile 36)
FLUTTER_REWRITE.md    this plan
src/, android/        existing Capacitor app, unchanged on this branch
```

The dev build uses `applicationId com.parth.lookaway.dev` so it can live next to
the current `com.parth.lookaway` app on the test phone. Flip the id to
`com.parth.lookaway` in `flutter_app/android/app/build.gradle.kts` only when the
rewrite is ready to replace the shipped app (same debug/release key required).

## Architecture mapping

| Today (React + Capacitor)                       | Flutter rewrite                                                        |
| ----------------------------------------------- | ---------------------------------------------------------------------- |
| `src/lib/eye-timer.ts` pure rules                | `lib/src/timer/timer_rules.dart` (pure, unit-tested)                    |
| `src/hooks/use-eye-timer.ts` orchestration       | `lib/src/timer/timer_controller.dart` (`ChangeNotifier`/`Riverpod`)     |
| localStorage `lookaway:*`                        | `shared_preferences` with the same keys and JSON shape where practical |
| Web Audio `src/lib/sounds.ts`                    | `audioplayers` with generated WAV assets (no streamed audio files)      |
| `TimerService.java` + `TimerAlarmReceiver.java`  | Kotlin foreground service + `AlarmManager`, called from a plugin channel |
| `TimerNotifications.java`, `NotificationChannels.java` | Kotlin `NotificationManagerCompat`, same channel ids/versioning  |
| `BreakAlarm.java`                                | Kotlin `AlarmManager` + `MediaPlayer` on `USAGE_ALARM`                   |
| Web Push / Local Notifications fallback          | `flutter_local_notifications` (only as a fallback)                      |
| PWA `vite-plugin-pwa` + `src/lib/pwa.ts`         | Not applicable; offline is the default for a native app                 |
| TanStack routes and shadcn components            | Flutter `Navigator`/sheets and Material widgets with the same palette   |
| `src/lib/eye-care-guide.ts` data                 | Dart data file generated from the TS source (single source of truth)    |
| `src/assets/distant-horizon.jpg`                 | bundled asset, preloaded/cached by `precacheImage`                      |

Keep the same product rules on both sides while the apps coexist:

- Countdowns derive from end timestamps, never a decremented counter.
- A break starts only on the timer screen; it never runs behind a sheet or in
  the background. Background focus expiry parks the timer as `break_due`.
- The service owns phase transitions; Dart adopts them and never double-counts.
- Stats are saved at most once a second.
- Kids mode, working hours, sounds, blink nudges and daily stats stay on-device.

## Feature parity checklist

Core timer

- [ ] Focus / break / paused / `break_due` state machine with unit tests
- [ ] Start, pause, resume, stop, take break, +5 min snooze
- [ ] Ring countdown, tab-title style status text, break overlay
- [ ] Working hours (days, window, auto-pause, "keep going anyway")
- [ ] Settings: timings, sound kind/volume, notifications, blink nudges
- [ ] Kids mode: allowance, bonus, PIN hash, stars, time-up screen
- [ ] Daily stats, streak, week chart, insights
- [ ] Eye-care guide with sources, kids tips, myth-busting
- [ ] Install/update prompt (remove; native app already installed)

Android native

- [ ] Foreground service mirroring focus/break/`break_due`
- [ ] Exact alarm scheduling with inexact fallback, reschedule after reboot
- [ ] Quiet status channel `timer_status_v1` + alert channel `eye_breaks_v2`
- [ ] Dismissible alert grouped with the service card; delete intent stops
- [ ] Synthesised repeating alarm on `USAGE_ALARM`
- [ ] Open app / Start / Snooze / Skip actions; lock-screen visibility
- [ ] Notifications permission flow (Android 13+) and channel setup
- [ ] Battery-optimisation guidance; no Bluetooth/nearby permissions

Release

- [ ] Debug timings (10 s / 5 s) gated by `kDebugMode`, never in release
- [ ] Keystore + release build config (not committed)
- [ ] Install script that reuses `scripts/install-android.mjs` patterns
- [ ] Parity check against the Capacitor build on the same phone

## Data and migration

The current app stores everything under `lookaway:settings`, `lookaway:stats`,
`lookaway:kids` and `lookaway:timer` in the WebView's localStorage. Flutter's
`shared_preferences` cannot read that store directly. Until a one-time import is
designed, the Flutter app starts with defaults; the plan is an optional
"Import from the old app" screen that accepts an exported JSON blob (Settings →
Export), so nothing is lost silently and no account or server is needed.

## Milestones

1. **M0 — toolchain and scaffold** (this branch): Flutter SDK, project builds a
   debug APK, theme/assets in place, this plan.
2. **M1 — pure rules**: port `eye-timer.ts`, `kids-mode.ts` and `eye-insights.ts`
   with the existing tests translated to `flutter_test`.
3. **M2 — UI shell**: home ring, settings sheet, break overlay, week screen,
   guide, kids screen; state wired to the controller.
4. **M3 — native timer**: Kotlin service, alarms, channels, alert/alarm parity.
5. **M4 — data**: preferences, stats batching, import/export.
6. **M5 — polish and release**: parity testing on CPH2487, install script,
   release signing, remove the debug/dev applicationId suffix.

## Build and run

```sh
cd flutter_app
flutter pub get
flutter analyze
flutter test
flutter build apk --debug
flutter run -d <device>            # or: flutter install
adb install -r build/app/outputs/flutter-apk/app-debug.apk
```

Do not commit the Flutter `build/` tree or `.dart_tool/`; the generated
`.gitignore` in `flutter_app/` already excludes them.
