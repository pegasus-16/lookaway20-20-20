# Non-functional requirements

| ID | Requirement | Source/evidence |
| --- | --- | --- |
| NFR-001 | Keep timer rules independent of UI and testable as pure logic. | Root `AGENTS.md`; `src/lib/eye-timer.ts`. |
| NFR-002 | Compute remaining time from absolute deadlines; do not decrement counters. | Root `AGENTS.md`; `eye-timer.ts`. |
| NFR-003 | Keep user data local and core operation offline-first. | Root `AGENTS.md`; localStorage and native state store. |
| NFR-004 | Do not let background service advance through an unseen break. | Root `AGENTS.md`; `TimerService.java`. |
| NFR-005 | Prevent duplicate break statistics when native events return to JS. | Root `AGENTS.md`; `TimerStateStore.java` and timer hook. |
| NFR-006 | Preserve versioned Android notification channels and distinct quiet-status / dismissible-alert behavior. | Root `AGENTS.md`; `NotificationChannels.java` and `TimerNotifications.java`. |
| NFR-007 | Keep application and PMS changes auditable, focused, and recoverable. | Approved governance and development constraints. |
| NFR-008 | No Bluetooth, nearby Wi-Fi, or UWB permission; avoid unrelated data collection. | Root `AGENTS.md`; Android manifest. |
| NFR-009 | Debug timings must not ship in production. | `src/lib/debug.ts` and root `AGENTS.md`. |
| NFR-010 | Do not release or claim device compatibility without evidence. | PMS source-of-truth and verification protocols. |
