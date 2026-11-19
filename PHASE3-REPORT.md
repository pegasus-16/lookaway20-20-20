# Lookaway Native Android — Phase 3 Report

## Result

Native local eye-break notifications are integrated on `native-android` using `@capacitor/local-notifications` 8.3.1 with Capacitor 8.6.2. The PWA notification path remains selected on web and is unchanged in behavior. No commits, pushes, or changes to `main` were made.

## Notification behavior

- The existing timer state and absolute phase deadlines remain the source of truth; no second timer was added.
- Native reminders are one-shot local notifications queued for up to the timer's existing 12-hour restore lifetime (at most 136 with the current minimum interval). Pending reminders are reconciled on start/phase changes, pause/resume/stop, interval changes, permission changes, foreground return, and timer restoration. IDs are stable and stale entries are canceled before replacements are scheduled.
- Paused, idle, disabled, or permission-denied timers have no queued reminders. A user override to continue outside working hours is respected; otherwise scheduling stops at the work-hours boundary.
- `isExactNotification: false` and `allowWhileIdle: true` are retained. The plugin uses inexact Doze-aware alarms; the app does not request exact-alarm access or open its settings screen.
- Android 13+ notification permission is checked/requested from the app's notification flow. Denial is shown in settings with directions to Android app settings; permission is checked again after returning to the app.
- The plugin supplies the default Android notification channel and boot restore receiver. Notification taps use the plugin's activity intent to open Lookaway.
- `AndroidManifest.xml` was not modified; the plugin's permission and receiver declarations are preserved.

## Android and PWA limitations

- The plugin re-arms scheduled notifications after reboot. Its restore receiver moves overdue one-shots to approximately 15 seconds after boot, so a long device shutdown can result in delayed or clustered reminders.
- The queue is finite and capped at 12 hours, matching the existing stale-timer reset. It is replenished when the app is running or reopened; the app cannot run JavaScript to extend the queue while fully stopped.
- Inexact alarms can be delayed by Doze, battery saver, notification-channel settings, and OnePlus/OxygenOS background restrictions. Android force-stop can prevent alarms until the app is launched again. Delivery is not guaranteed.
- No Android SDK is configured in this environment, and no physical-device notification test has been performed. Background delivery on the OnePlus 13R remains unverified.
- The PWA production build succeeds, but Workbox still reports zero precache entries because its existing `dist` glob matches no files. The original `vite.config.ts` was not changed; this warning predates the native notification work.
- PWA output and native output remain separate (`.output`/`dist` versus `native-web`/`.native-build`).

## Verification commands and results

| Command | Result |
| --- | --- |
| `~/.bun/bin/bun run test` | Passed: 8 files, 51 tests. |
| `~/.bun/bin/bun x tsc --noEmit` | Passed. |
| `~/.bun/bin/bun x eslint src/lib/native-reminders.ts src/lib/native-reminders.test.ts src/lib/notify.ts src/lib/notify.test.ts src/hooks/use-eye-timer.ts src/components/eye/SettingsSheet.tsx src/routes/index.tsx` | Passed on all modified TypeScript/TSX files. |
| `~/.bun/bin/bun x prettier --check` on the same modified TypeScript/TSX files | Passed. |
| `~/.bun/bin/bun run build` | Passed; existing Workbox zero-precache glob warning remains. |
| `~/.bun/bin/bun run build:native` | Passed; prerendered `/` into `native-web`. |
| `~/.bun/bin/bun x cap sync android` | Passed; copied web assets and registered `@capacitor/local-notifications@8.3.1`. |
| `~/.bun/bin/bun x cap ls` | Found Android local-notifications plugin; CLI notes that listing web plugins is not possible. Android platform registration was also confirmed in Gradle settings and app dependencies. |
| `git diff --exit-code origin/main -- vite.config.ts` | Passed; original PWA Vite configuration is unchanged. |
| `diff -qr native-web android/app/src/main/assets/public --exclude=cordova.js --exclude=cordova_plugins.js` | Passed; Capacitor's integrated web assets match the native build. |

The earlier reports of 40 and 48 tests disagree: the recorded pre-Phase-3 Vitest baseline was 40; the 48 figure was not reproduced. Phase 3 adds 11 tests, giving the current verified total of 51.

## Phase 3 files

- Added `src/lib/native-reminders.ts` and `src/lib/native-reminders.test.ts`.
- Updated notification routing/tests, timer-hook reconciliation, and native-only settings/status copy.
- Added `@capacitor/local-notifications@8.3.1` to `package.json` and `bun.lock`. `package-lock.json` was not edited.
- Formatted the modified hook, settings, and route files to satisfy the repository ESLint/Prettier rule.
- No changes were made to `AndroidManifest.xml`.

## Git status

Branch: `native-android`

```text
## native-android
 M .gitignore
 M bun.lock
 M package.json
 M src/components/eye/SettingsSheet.tsx
 M src/hooks/use-eye-timer.ts
 M src/lib/notify.test.ts
 M src/lib/notify.ts
 M src/routes/index.tsx
?? CAPACITOR-VERIFICATION.md
?? COPILOT-REPORT.txt
?? PHASE1-COMPLETE.md
?? PHASE2-PRECHECK.md
?? PHASE2-REPORT.md
?? PHASE3-REPORT.md
?? android/
?? capacitor.config.ts
?? package-lock.json
?? src/lib/native-reminders.test.ts
?? src/lib/native-reminders.ts
?? vite.native.config.ts
```

## Remaining work

Build a debug APK with an Android SDK-equipped runner (for example, GitHub Actions), install it on the OnePlus 13R, grant notification permission, and test backgrounding, normal process closure, reboot, notification taps, and OxygenOS battery restrictions. Do not treat delivery as verified until those device tests pass.
