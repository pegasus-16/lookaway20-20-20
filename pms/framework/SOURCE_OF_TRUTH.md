# Source of truth and evidence authority

PMS is a navigation and continuity aid, not an unquestionable authority over
the repository. Apply this authority to the specific claim being made:

1. **Actual source code and configuration** establish what currently exists.
2. **Executed test output** establishes the outcome of those specific tests and
   command/environment only.
3. **Device testing** establishes behavior only for the identified device,
   version, and test conditions.
4. **Accepted ADRs** establish approved architectural decisions, subject to
   their human-approval boundaries.
5. **Approved requirements** establish product intent.
6. **Git history** establishes committed repository changes and their order.
7. **Project state and focus** summarize the evidence above; they can be
   incomplete or stale.
8. **Agent conversation history** is ephemeral context, not durable authority.

## When records disagree

1. State the conflicting claims and cite their source records.
2. Inspect the actual implementation and relevant tests.
3. Apply the hierarchy above to each claim; do not select the newest agent
   statement by default.
4. Record the discrepancy and, if needed, a new correction event that
   references the old event.
5. Update the maintained summary after establishing the evidence.
6. Seek human approval if resolution would alter an accepted major decision.

## Evidence references

Prefer repository-relative paths, symbols, test names and commands, commit
hashes, ADR IDs, and task IDs. Line numbers are optional and should not be the
only durable reference. Describe unavailable or unverified evidence explicitly.

Test reports must identify the command and outcome when available. Mark
agent-reported claims as such. Device evidence must identify the device and
conditions where known. Never infer a successful test, release, approval, or
device check from documentation alone.
