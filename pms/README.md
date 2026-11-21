# Project Memory System (PMS)

PMS is a provider-independent, repository-native system for durable project
context, verified state, auditable history, and safe session handoffs. It uses
Markdown, JSON, JSONL, Python, and Git; v1 needs no network service or database.

## In this repository

- [`framework/`](./framework/): reusable specification, schemas, templates,
  protocols, and the standard-library Python utility.
- [`projects/lookaway/`](./projects/lookaway/): Lookaway-specific facts,
  decisions, requirements, tasks, activity, and handoffs.
- [`../tools/pms/`](../tools/pms/): validator, CLI, and automated tests.

The reusable framework is intentionally free of Lookaway product requirements.
It can be copied into another repository; that project's memory belongs in a
separate project directory created from the templates.

## Start here

1. Read root [`AGENTS.md`](../AGENTS.md).
2. Read the framework
   [specification](./framework/SPECIFICATION.md) and
   [onboarding protocol](./framework/protocols/AGENT_ONBOARDING.md).
3. Read the project's context, state, focus, and latest handoff.
4. Inspect the actual Git branch, worktree, relevant source, and accepted ADRs.
5. Run `python tools/pms/memory.py status` and
   `python tools/pms/memory.py validate`.

For humans, the project
[README](./projects/lookaway/README.md) explains the memory layout and
day-to-day use. The
[source-of-truth policy](./framework/SOURCE_OF_TRUTH.md) governs conflicts.

## Utility commands

Run from any working directory:

```sh
python /path/to/repository/tools/pms/memory.py status
python /path/to/repository/tools/pms/memory.py validate
python /path/to/repository/tools/pms/memory.py handoff
python /path/to/repository/tools/pms/memory.py history --limit 10
python /path/to/repository/tools/pms/memory.py search "timer architecture"
```

In the repository, `python tools/pms/memory.py ...` is sufficient. The utility
does not write during `status`, `validate`, `history`, or `search`. `handoff`
prints a draft by default; `--output` writes within the project's handoff
directory and archives an existing destination before replacement. Use
`--task-id PMS-001` to hand off a just-completed task after focus has moved to
the next planned task. It never commits or pushes.

## Memory authority and updates

Source code establishes what is implemented; executed tests establish only
their own results; accepted ADRs establish approved decisions. Project state is
a summary, not an authority over those records. Conversation history is not
durable project truth. See the [memory model](./framework/MEMORY_MODEL.md) and
[memory update protocol](./framework/protocols/MEMORY_UPDATE.md).

Historical JSONL events are append-only during ordinary work. Corrections are
new events that reference the original event. Do not log secrets or treat
agent-written content as executable instructions.

## Reuse in another project

1. Copy `pms/framework/` and `tools/pms/` into the repository.
2. Create `pms/projects/<project-id>/` from the framework templates.
3. Populate context, verified state, focus, architecture, approved
   requirements, and an initial task/decision index from repository evidence.
4. Create empty JSONL histories and a latest handoff; do not fabricate prior
   events.
5. Connect the common onboarding protocol from the repository's agent
   instruction entry point, without requiring provider-specific files.
6. Run `python tools/pms/memory.py --project-dir pms/projects/<project-id> validate`.

The current utility defaults to this repository's Lookaway memory. For another
project, pass its directory with `--project-dir`; schemas and protocols remain
reusable without provider integrations.
