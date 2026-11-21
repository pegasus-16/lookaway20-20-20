# Project-driven learning roadmap

This roadmap is for a beginner with little programming experience and
experience operating GitHub Copilot. Agent implementation is not proof that
the human has mastered a concept. The learner should ask for explanations,
inspect code, make small edits, predict test outcomes, and explain the result
back in their own words.

## Learning sequence

1. **Repository orientation:** files/folders, Git status/diff/history, Markdown,
   command line, and how to ask an agent for bounded changes.
2. **Dart foundations:** values, types, functions, collections, null safety,
   classes, enums, async basics, and reading compiler/test errors.
3. **Pure timer rules:** timestamps, state transitions, deterministic
   functions, edge cases, and unit tests before UI.
4. **Flutter UI:** widgets, layout, state, events, navigation, and accessibility.
5. **Application architecture:** controller/state boundaries, local
   persistence, JSON, error handling, and offline behavior.
6. **Android integration:** lifecycle, foreground services, alarms, permissions,
   notifications, debugging, and device-specific verification.
7. **Parity and release:** compare behavior with the legacy app, migration and
   backup safety, build/signing concepts, and human release approval.

## Learning routine for each implementation

For each major task, ask the agent to explain:

- What was built and which files implement it.
- The programming concepts involved and why those concepts fit.
- How a representative code path works.
- Which tests exercise it and what those tests do not prove.
- What the learner should be able to explain or change next.
- What remains unknown or to be learned.

Track evidence in `CONCEPTS_LEARNED.md`; mark a concept “practiced” or
“explained back” only after the learner does that work, not when an agent adds
code.

## Current learning priority

After PMS v1, verify the Flutter environment and scaffold on an equipped
machine. Then learn Dart through the first pure timer-engine task before
building Flutter timer UI.
