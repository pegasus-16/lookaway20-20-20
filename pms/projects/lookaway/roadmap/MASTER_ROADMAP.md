# Master roadmap

No completion dates are assigned. Statuses are based on current repository
evidence; roadmap intent is not a verification claim.

## Workstream A — Project Memory System

| Milestone | Scope | Status |
| --- | --- | --- |
| PMS-M1 | Repository-native framework, project context, governance, records, schemas, and initial onboarding | Implemented under PMS-001 |
| PMS-M2 | Validate records and utilities; exercise recovery and fresh-agent onboarding | PMS-001, PMS-002, and PMS-003 tested; 22-test suite and validation pass with no errors/warnings |
| PMS-M3 | Use append-only activity/session logging and handoff updates in routine work | Planned after PMS-001 |
| PMS-M4 | Improve low-cost automation only when a concrete maintenance need exists | Planned |
| PMS-M5 | Exercise interoperability across more than one agent/provider in ordinary project work | Planned; no broad compatibility claim yet |

## Workstream B — Flutter rewrite

| Milestone | Scope | Status |
| --- | --- | --- |
| FLUTTER-M0 | Verify Flutter scaffold, SDK/toolchain, and build environment | Tested: Flutter/Dart PATH, Android SDK, analysis, widget test, and debug APK verification passed |
| FLUTTER-M1 | Beginner Dart fundamentals through a small, tested timer-rules task | Authorized next task: FLUTTER-002 |
| FLUTTER-M2 | Pure timer engine with tests and timestamp-derived countdown | Planned |
| FLUTTER-M3 | Flutter UI shell and state/controller architecture | Planned |
| FLUTTER-M4 | Local persistence, settings, statistics, and explicit migration design | Planned |
| FLUTTER-M5 | Android service, alarms, notifications, and device verification | Planned |
| FLUTTER-M6 | Feature parity, regression comparison, and production readiness | Planned |
| FLUTTER-M7 | Production release and cross-platform expansion, subject to approval | Planned |

## Active tasks and dependencies

- **PMS-001** delivers the initial PMS v1 foundation and validation. Tested;
  no device or release verification applies.
- **FLUTTER-001** verifies the scaffold/toolchain. Planned; begin after PMS-001.
- **FLUTTER-002** learns Dart through a pure, tested timer engine and depends
  on FLUTTER-001.
- **FLUTTER-003** builds the initial Flutter UI on tested timer rules and
  depends on FLUTTER-002.
- Later Flutter tasks must identify dependencies and preserve the existing app.
  Do not mark milestones complete without task evidence.

Detailed next actions and evidence belong in `tasks/INDEX.json`, task records,
and `CURRENT_FOCUS.md`.
