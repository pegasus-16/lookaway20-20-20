# Human approval and governance

The human project owner retains final authority over product requirements,
major architecture, security-sensitive changes, user-data migration,
destructive operations, release decisions, and changes to accepted decisions.

Human approval is required before:

- Replacing or materially changing an accepted major architecture decision.
- Replacing a production application or changing its production identity.
- Destructive database or user-data migrations, or removal of historical
  memory.
- Deleting significant application functionality.
- Introducing paid infrastructure or mandatory external services.
- Changing security-sensitive behavior.
- Publishing a production release.
- Force-pushing or rewriting published Git history.

Ordinary, reversible implementation within an approved task does not require
repeated approval. Agents may analyze, propose, and implement work already
approved, but must not present an unapproved proposal as accepted.

## Recording approval

Record a proposal as `Proposed` with origin `Agent-proposed`; include the
question, options, impacts, and affected ADR/task. Request a specific human
decision. After explicit approval, record the approval reference and update
the decision to `Accepted` with origin `Human-approved`. Rejection is also
recorded. Do not infer approval from silence, recency, or implementation.

If approval is unavailable, stop only the consequential part, preserve safe
reversible work, and document the blocker and next action.
