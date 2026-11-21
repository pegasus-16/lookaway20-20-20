# Functional requirements

Current status means evidence in the checked-in implementation, not release or
device verification.

| ID | Requirement | Evidence/status |
| --- | --- | --- |
| FR-001 | Start, pause, resume, stop, and advance focus/break timer phases. | Implemented in `src/lib/eye-timer.ts` and `src/hooks/use-eye-timer.ts`; tests exist. |
| FR-002 | Derive countdown from phase timestamps and restore a valid saved timer. | Implemented in `eye-timer.ts`; `timer-restore.test.ts` exists. |
| FR-003 | Defer a background Android break until the timer screen is visible. | Implemented in Java `TimerService`; device result unverified here. |
| FR-004 | Persist settings, statistics, Kids mode, and timer on device. | React uses localStorage; Android service mirror uses SharedPreferences. |
| FR-005 | Support working hours, reminders/sounds, and blink cues. | Implemented in React sources; individual runtime/device behavior requires tests. |
| FR-006 | Track completed/skipped breaks and screen time locally. | Implemented in the React hook and timer/stat logic. |
| FR-007 | Provide sourced eye-care guidance. | Data and source identifiers in `src/lib/eye-care-guide.ts`. |
| FR-008 | Support on-device Kids-mode allowance, PIN gate, bonus, and stars. | Rules in `src/lib/kids-mode.ts`; tests exist. |
| FR-009 | Flutter implementation reaches approved feature parity without replacing the old app prematurely. | Planned migration requirement; Flutter timer/UI are not implemented. |
| FR-010 | Preserve the ability to run core functionality offline. | Existing design and packaged application; no end-to-end network-disconnection test recorded in this audit. |
| FR-011 | Provide explicit data export/import before any cross-app migration. | Proposed in `FLUTTER_REWRITE.md`; not implemented. |

This table must be updated with evidence when behavior changes; do not promote
planned work to implemented based on the migration checklist.
