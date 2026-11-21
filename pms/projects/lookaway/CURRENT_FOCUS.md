# Current focus

- **Priority:** Verify the Flutter scaffold and development environment, then begin the project-driven Dart timer-engine work.
- **Active milestone:** FLUTTER-M0 — scaffold and toolchain verification.
- **Active task:** FLUTTER-001 — verify Flutter scaffold and development toolchain (Planned).
- **Observed branch:** `main` (recheck Git before work; branch in old migration docs is stale here).
- **Blockers:** Flutter/Dart/adb are unavailable in this environment; FLUTTER-001 must run on a suitably equipped machine.
- **Outstanding approval:** None recorded for FLUTTER-001. Any production replacement, migration, or release still requires explicit human approval.
- **Next action:** On a Flutter-equipped machine, record Flutter/Dart/JDK/Android SDK versions and run `flutter pub get`, `flutter analyze`, `flutter test`, and a debug APK build; then begin FLUTTER-002.
- **PMS-003 status:** Complete and Tested. The history test is deterministic and PMS validation passes with zero errors/warnings.
- **Task-index semantics:** `active_task_ids` contains only In progress or Implemented tasks. FLUTTER-001 remains Planned and is the current focus, not an implementation-active task.
- **Updated:** 2026-11-21T11:43:04Z

This focus document is a snapshot. Check the actual branch, task record, and
Git status before acting.
