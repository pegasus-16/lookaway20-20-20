# Agent handoff protocol

Create a handoff when substantial work ends, context is running low, a blocker
prevents progress, or control transfers to another person or agent.

The handoff must state:

- Project, task ID, milestone, branch, and commit.
- Changed files and current uncommitted work.
- Completed work and evidence.
- Exact test/build commands and outcomes.
- Failures, limitations, and behavior not verified.
- Outstanding approvals and unresolved decisions.
- Relevant project records and source files.
- Ordered, concrete next actions.

Maintain `handoffs/LATEST_HANDOFF.md`. Before replacing it, copy the old version
to `handoffs/archive/` with an unambiguous timestamped name; never erase the
previous handoff. Also retain a structured JSON handoff for schema validation.
Do not commit or push solely to complete a handoff.

A receiving agent reads the latest handoff but independently checks Git and
source evidence before acting.
