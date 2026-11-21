# Flutter architecture and migration status

## Observed now

`flutter_app/` contains a Flutter project manifest, generated Android host,
placeholder `lib/main.dart`, a sound-kind model, and a pure-Dart sound
synthesizer. There is no implemented timer state machine, timer controller,
Lookaway screen, persistence adapter, or native timer service in the inspected
Flutter source. The root checkout is `main`, regardless of the branch named in
the migration document.

## FLUTTER-001 verification result

On 2026-11-21, the environment audit found:

- Flutter 3.50.1 and Dart 3.14.0 installed at
  `/home/codespace/.flutter/flutter`, but neither executable is on `PATH`.
- `flutter pub get` resolved dependencies successfully.
- Dart formatting checked all three Dart files with zero changes.
- `flutter analyze` found no issues.
- `flutter test` failed because `flutter_app/test/` does not exist.
- `flutter build apk --debug` failed because no Android SDK is configured.
- Flutter Doctor found the Android SDK missing; Chrome and Linux desktop
  build prerequisites are also absent.
- The only connected Flutter device was Linux desktop; no Android device or
  emulator was available.
- JDK 25.0.5 is installed and Gradle 9.8.2 is available system-wide. The
  generated Android wrapper uses Gradle 9.5.0 and Android plugin 9.3.1, but
  Android SDK verification remains blocked.

No timer, UI, persistence, notification, or native integration feature was
implemented during this verification task.

`pubspec.yaml` declares `audioplayers`, `crypto`, `material_ui`, and
`shared_preferences`; declaration is not evidence that a production feature
uses them. Flutter/Dart tooling was unavailable during the audit, so no Flutter
analysis, test, or build result is known.

## Target described in `FLUTTER_REWRITE.md`

The proposed direction is a native Flutter application with:

- Pure Dart timer rules and a controller separate from UI.
- On-device preferences and local statistics.
- A Kotlin Android service and alarm integration, with notifications that
  retain the established channel/alert behavior.
- Ported screens and feature parity with the React application.
- Explicit import/export rather than silent local-data migration.

These are planned design elements, not existing implementations or newly
accepted ADRs. Review and update this document as architecture is implemented
and decisions are approved. Preserve the existing app until an approved
replacement and migration plan are ready.

## Learning and implementation order

The roadmap starts by verifying the scaffold and toolchain, then learning Dart
through small project tasks, implementing and testing pure timer rules, adding
UI and local persistence, integrating Android, comparing feature behavior, and
only later considering release or platform expansion.

Do not treat the migration document's checklist or machine-specific tool
versions as verification evidence. See `roadmap/MASTER_ROADMAP.md` and
`learning/LEARNING_ROADMAP.md`.
