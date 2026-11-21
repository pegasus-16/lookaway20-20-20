# Agent onboarding protocol

This sequence is provider-independent. Do not assume instruction discovery or
conversation memory is available.

## Required read and inspect sequence

1. Read the repository's root agent instructions.
2. Read the PMS entry-point README.
3. Read `framework/SPECIFICATION.md` and this protocol.
4. Read the project `PROJECT_CONTEXT.md`, `PROJECT_STATE.md`, and
   `CURRENT_FOCUS.md`.
5. Read `handoffs/LATEST_HANDOFF.md` if present.
6. Inspect actual Git branch, commit, and worktree status; compare them to the
   maintained state.
7. Identify the active task; inspect its record, acceptance criteria, status,
   and dependencies.
8. Read only relevant architecture, requirements, ADRs, source files, tests,
   and recent events.
9. Run PMS status/validation when practical.

## Compact onboarding report

Before implementation, report:

- Project purpose and current architecture.
- Verified state versus planned/in-progress work.
- Active task and milestone.
- Relevant accepted decisions and constraints.
- Differences between maintained memory and current repository evidence.
- Outstanding human approvals.
- One proposed next action.

If the memory conflicts with code or an accepted decision, identify the
discrepancy before consequential implementation. Do not load all archives or
unrelated project history by default. See `SOURCE_OF_TRUTH.md`.
