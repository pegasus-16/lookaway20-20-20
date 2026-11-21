# Android architecture

## Existing Capacitor application

`android/` hosts the React web bundle in a Capacitor WebView. The native
implementation currently uses Java classes in
`android/app/src/main/java/com/parth/lookaway/`.

- `TimerService` mirrors timer phase state, owns phase transitions only while
  the WebView is backgrounded, and maintains the quiet foreground-service
  notification.
- When focus expires outside the visible timer screen, the service records
  `break_due` and waits; a break begins only when the app is visible on the
  timer screen.
- `TimerStateStore` persists the native mirror and drains completed break/skip
  events so JavaScript counts them exactly once.
- `TimerServicePlugin` bridges service state and actions to JavaScript.
- `TimerAlarmReceiver` and `AlarmManager` provide deadline callbacks; visible
  JavaScript may nudge the service when a deadline passes.
- `NotificationChannels` owns versioned `eye_breaks_v2` and
  `timer_status_v1` channels. The alert is separate and dismissible; the
  foreground service owns only the quiet status card.
- `BreakAlarm` synthesizes a repeating alarm tone until the user acts.
- The manifest removes Bluetooth, nearby Wi-Fi, and UWB permissions.

The detailed behavior and constraints are maintained in root `AGENTS.md` and
`README.md`; read those before changing this subsystem.

## Flutter target

`FLUTTER_REWRITE.md` proposes a native Android timer service and alarms for the
Flutter app. That code is not present in the inspected Flutter tree. Do not
assume its language, service ownership, channels, permission list, or behavior
have already been implemented; preserve the current app while designing and
validating the target.

## Verification

Source inspection establishes architecture described above. No physical
Android device was available or verified during the audit. OEM battery
restrictions, exact-alarm availability, notification presentation, and
device-specific behavior require explicit device testing.
