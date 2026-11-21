# Flutter architecture and migration status

## Observed now

`flutter_app/` contains a Flutter project manifest, generated Android host,
placeholder `lib/main.dart`, a sound-kind model, and a pure-Dart sound
synthesizer. There is no implemented timer state machine, timer controller,
Lookaway screen, persistence adapter, or native timer service in the inspected
Flutter source. The root checkout is `main`, regardless of the branch named in
the migration document.

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
