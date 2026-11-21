# Lookaway project memory

This directory is the project-specific memory for Lookaway. The reusable PMS
rules are in [`../../framework/`](../../framework/); keep product decisions,
requirements, architecture, tasks, and evidence here.

## Initial repository audit

Audit basis: clean worktree on branch `main`, commit `394de96`; remote
`origin/main` points to the same commit at audit time. Recent history contains
the React/Capacitor application and timer/notification work. No existing ADR
records, task database, agent-session log, or Python memory utility was found.

Existing documentation and purpose:

- Root [`AGENTS.md`](../../../AGENTS.md) has project rules and a
  Lovable-managed block; the block is preserved unchanged.
- [`README.md`](../../../README.md) documents web and Capacitor build/install
  usage and Android behavior.
- [`FLUTTER_REWRITE.md`](../../../FLUTTER_REWRITE.md) documents a proposed
  native rewrite, target mapping, and feature checklist.
- [`roadmap.md`](../../../roadmap.md) tracks earlier app features; it is not a
  current verified project-state record.
- [`PLANNED_FEATURES.md`](../../../PLANNED_FEATURES.md) and
  [`.lovable/plan.md`](../../../.lovable/plan.md) preserve earlier product and
  data-planning context.
- [`flutter_app/README.md`](../../../flutter_app/README.md) is the generated
  generic Flutter-project README; it does not describe a working Lookaway
  feature.
- [`src/routes/README.md`](../../../src/routes/README.md) documents TanStack
  routing conventions.

Sources of truth are current source/configuration, executed tests, Git, and
human-approved decisions. The new
[source-of-truth policy](../../framework/SOURCE_OF_TRUTH.md) explains
precedence and evidence.

### Findings and discrepancies

- The checkout is `main`, not the `flutter-rewrite` branch named in
  `FLUTTER_REWRITE.md`; do not infer the active branch from that document.
- The legacy app is React/TypeScript with TanStack Start and Capacitor. Its
  native timer implementation is Java in
  `android/app/src/main/java/com/parth/lookaway/`, not Kotlin.
- `flutter_app/` is an early scaffold. `lib/main.dart` renders “Hello World”;
  `lib/src/` contains only sound model/synthesizer code. It has no timer
  engine, feature UI, persistence integration, or Lookaway Android service.
- The migration document's device/tool versions are machine-specific and were
  not verified in this environment. Flutter, Dart, and `adb` are unavailable
  here.
- `roadmap.md` contains completed checkboxes but no present test evidence; its
  marks are historical claims, not a current release/device-verification
  record. Its note that the AGENTS change awaits approval also predates the
  current root instructions.
- `.lovable/plan.md` discusses possible account/cloud backup as a future
  option. No cloud synchronization is implemented or approved as a required
  service; current data is local and offline-first.
- Existing instructions describe Android service ownership, notification
  channels, due-break behavior, and preservation of the old app. These rules
  are retained and cross-referenced rather than copied as new product facts.

## How to use this memory

Start with `PROJECT_CONTEXT.md`, `PROJECT_STATE.md`, `CURRENT_FOCUS.md`, and
`handoffs/LATEST_HANDOFF.md`. Then load only the task-specific requirements,
architecture, ADRs, source, and tests. The
[onboarding protocol](../../framework/protocols/AGENT_ONBOARDING.md) and
[execution protocol](../../framework/protocols/AGENT_EXECUTION.md) are the
provider-independent instructions.

Useful commands, from any working directory:

```sh
python tools/pms/memory.py status
python tools/pms/memory.py validate
python tools/pms/memory.py history --limit 10
python tools/pms/memory.py search "timer service"
python tools/pms/memory.py handoff
```

Inspect `decisions/INDEX.json` and `tasks/INDEX.json` before proposing changes.
The JSON records are structured source records; the project architecture and
requirement documents provide their human-readable context. To approve a
proposal, the owner explicitly decides and the record is updated with the
approval reference and `Accepted` status; silence is not approval.

## Switching agents and recovering context

Every agent follows root `AGENTS.md` and the common onboarding protocol; no
provider-specific auto-discovery is assumed. When switching, share the
repository and direct the new agent to the latest handoff, then ask it to
compare the handoff with the actual branch, worktree, and source. After context
exhaustion, read `LATEST_HANDOFF.md`, inspect `git status`, then resume the
listed task and exact next action. Previous handoffs are retained in
`handoffs/archive/`.

To establish PMS in another project, copy the framework and utility, create a
separate project-memory directory from the templates, populate it with
repository evidence, connect the onboarding link from that project's common
agent instructions, and run validation. See [PMS README](../../README.md).

The independent fresh-agent onboarding exercise and its reconciled findings
are recorded in [`ONBOARDING_VALIDATION.md`](./ONBOARDING_VALIDATION.md).
