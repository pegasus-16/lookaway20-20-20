# PMS memory model

| Layer | Contents | Primary records | Update rule |
| --- | --- | --- | --- |
| Permanent knowledge | Identity, intent, requirements, architecture, constraints, accepted decisions | Context, requirements, architecture, ADRs | Deliberate, evidence-linked updates; human approval for governed changes |
| Current state | Verified implementation, in-progress work, plans, blockers, verification | `PROJECT_STATE.md`, `CURRENT_FOCUS.md`, task index | Refresh when material work or evidence changes |
| Historical records | Decisions, activity, tests, failures, corrections, approvals, session boundaries | Decision records, `activity.jsonl`, `agent_sessions.jsonl`, Git | JSONL is append-only; corrections reference earlier events |
| Session handoff | Resumable task and exact state at a transition | `LATEST_HANDOFF.md` and structured handoff JSON | Replace only after archiving the prior handoff |

## Evidence and status

Keep claims at the highest level directly supported by evidence:

- **Implemented:** code or configuration exists.
- **Tested:** named automated or manual tests passed; state exactly which.
- **Device verified:** an identified physical or virtual device and test context
  were used.
- **Released:** a release artifact or deployment is evidenced.

Documentation, a roadmap checkbox, or a generated scaffold is not proof of
implementation. A test does not imply device verification or release.

For tasks, use the defined statuses: Proposed, Planned, In progress,
Implemented, Tested, Device verified, Released, Blocked, or Cancelled. Do not
skip evidence levels when describing the current result.

## Corrections and conflict history

Do not silently edit or remove a historical event. Append a correction with a
new event ID and a `related_event_ids` reference to the original. Correct
maintained summaries to reflect the authoritative evidence while preserving
historical traceability in Git and the event log.

If agent accounts conflict, compare each claim with source code, actual test
output, accepted decisions, and the source-of-truth hierarchy. Newness alone
does not establish truth. Escalate a proposed change to an accepted major
decision to the human owner.
