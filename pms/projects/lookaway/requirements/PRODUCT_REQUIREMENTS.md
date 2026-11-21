# Product requirements

Product intent is summarized from root documentation, current source, and
owner-provided project constraints. Existing source establishes implementation;
it does not imply release or device verification.

## PR-001 — Simple eye-break reminders

Help screen users take recurring breaks. The current app implements a
configurable focus/break timer with a 20-minute / 20-second default consistent
with its 20-20-20 framing.

## PR-002 — Private, offline-first operation

Core use must not require an account or network service. Settings and daily
statistics are stored locally. Any future cloud sync is optional and must not
replace local storage as the source of truth.

## PR-003 — Preserve useful supporting features

The product includes working-hour controls, synthesized reminders, blink
nudges, daily/weekly summaries, sourced eye-care guidance, and optional Kids
mode. Feature parity during migration must be checked against actual source and
approved scope.

## PR-004 — Safe migration and continuity

The Flutter rewrite is an independent migration. Keep the existing React/
Capacitor application functional while Flutter is developed. Do not silently
discard or migrate user data. Production replacement and data migration require
human approval.

## PR-005 — Evidence-based guidance

Eye-care guide content must have visible sources, as maintained in
`src/lib/eye-care-guide.ts`.

## PR-006 — Human governance

The project owner has final authority over requirements, major architecture,
security-sensitive behavior, data migration, destructive actions, releases,
and changes to accepted decisions. See the approval protocol and ADR-0004.
