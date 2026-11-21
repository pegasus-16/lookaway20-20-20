# Task records

Each task is a standalone JSON record validated against
`pms/framework/schemas/task.schema.json`. `INDEX.json` is maintained with task
records and must match their IDs and statuses.

Statuses are Proposed, Planned, In progress, Implemented, Tested, Device
verified, Released, Blocked, and Cancelled. Status reflects the highest
evidence achieved; do not equate implementation with tests, device testing, or
release.

Current records:

- **PMS-001** — PMS v1 foundation and validation (Tested; not device-verified or released).
- **PMS-002** — Independent PMS v1 audit (Tested; its report recorded the PMS-003 correction).
- **PMS-003** — Correct PMS-002 findings and complete verification (Tested).
- **FLUTTER-001** — Verify the Flutter scaffold/toolchain (Tested; Android build and test verification passed, but device verification remains unavailable).
- **FLUTTER-001B** — Configure Android SDK, Flutter PATH, test infrastructure, and verify the debug APK (Tested; no runtime device verification).
- **FLUTTER-002** — Learn Dart through pure timer rules (depends on FLUTTER-001).
- **FLUTTER-003** — Build a Flutter UI shell on tested timer rules (depends on FLUTTER-002).

Dependencies must refer to existing tasks; do not create an inferred
dependency merely from record order. See the
[task template](../../../framework/templates/TASK_TEMPLATE.md) and
[execution protocol](../../../framework/protocols/AGENT_EXECUTION.md).

`active_task_ids` is evidence/status derived: it lists only tasks whose status
is `In progress` or `Implemented`. It does not mean that every task named in
`CURRENT_FOCUS.md` has started implementation. A `Planned` task may be the next
recommended action without being active in this index.
