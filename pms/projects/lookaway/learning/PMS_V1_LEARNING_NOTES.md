# PMS v1 learning notes

These notes explain the current infrastructure implementation for a beginner.
They do not assess or claim the learner's mastery.

## What was built

PMS separates reusable rules and schemas from Lookaway-specific project memory.
The memory stores human-readable Markdown, structured JSON task/decision/
handoff records, and append-only JSONL activity. `tools/pms/memory.py` reads and
validates those records and provides status, handoff, history, and offline
search commands. The tests use Python's built-in `unittest` library.

## Concepts and why they were used

- **Files and directories:** keep framework policy separate from project facts
  and reduce unrelated context loading.
- **JSON and schemas:** provide predictable record fields and catch malformed
  or inconsistent structured data before another agent relies on it.
- **JSONL and event IDs:** append activity without replacing prior history;
  corrections link to the earlier event.
- **UTC timestamps and stable identifiers:** let agents compare records and
  refer to a task, decision, event, or handoff without relying on conversation
  memory.
- **Pure validation and command-line arguments:** inspect records without
  changing them; callers choose status, validation, search, or draft generation.
- **Path boundaries and Git subprocess calls:** keep file operations in the
  repository's project-memory directories and call only fixed Git commands,
  never commands supplied by a memory record.
- **Unit tests:** check both valid records and failure cases such as duplicate
  IDs, bad timestamps, broken references, unsafe paths, and incorrect indexes.

## How the validator works

`memory.py` finds the repository root relative to its own file, then selects
the default project memory (or a validated `--project-dir`). The `validate`
command reads the schemas and project records, reports structural, JSON/JSONL,
schema, timestamp, status, uniqueness, index, and reference errors, and exits
nonzero on errors. It does not write or normalize records. The other commands
reuse the same repository-relative project selection; handoff output is
restricted to the project's `handoffs/` directory and archives an existing
destination before replacement.

## What the learner should understand

After working through this implementation, the learner should be able to
describe why the framework and project memory are separate, what belongs in
JSON versus JSONL, how validation catches a broken record, why a generated
handoff labels unknown behavior as unverified, and how the Python command
locates the repository independently of the shell's current directory.

These are learning goals, not a claim that the learner has already demonstrated
them. Record practice or an explanation from the learner in
`CONCEPTS_LEARNED.md`.

## What remains to learn

Practice reading and modifying Python functions and type annotations; learn
`argparse`, JSON decoding, filesystem safety, subprocess boundaries, and
`unittest`; then apply the same evidence-first approach to Dart and Flutter.
The Flutter timer engine remains a later project task, not part of PMS v1.
