# Lookaway project context

## Identity and purpose

Lookaway is an offline-first digital-wellness application that reminds people
to take regular eye breaks, using the 20-20-20 rule as its default pattern.
The audience is people who spend sustained time looking at screens, including
families using the optional on-device Kids mode.

The product direction is a small, private reminder that remains useful without
an account or network. Its current source of truth for application data is
device-local storage.

## Existing product behavior

The React application implements a focus/break timer, pause/resume and snooze,
working hours, sounds, blink nudges, daily screen-time/break statistics,
streaks, weekly insights, sourced eye-care guidance, and Kids mode. Verify
specific behavior in the source and tests; this list does not assert release
or device verification.

Evidence includes `src/lib/eye-timer.ts`, `src/lib/kids-mode.ts`,
`src/hooks/use-eye-timer.ts`, the `src/components/eye/` views, and tests under
`src/lib/*.test.ts`.

## Technology and platforms

### Existing application

- Web: React 19, TypeScript, TanStack Start/Router, Vite, and a generated
  service worker/PWA path.
- Android: Capacitor 8 WebView shell with app-specific native Java components
  in `android/app/src/main/java/com/parth/lookaway/`.
- Existing React logic remains in `src/`; Android app configuration and
  service remain in `android/`.

### Planned migration

`flutter_app/` is an independent early Flutter scaffold intended for a native
rewrite. The current `main.dart` is a placeholder; Flutter timer, UI,
persistence, and Android integration are not implemented. `FLUTTER_REWRITE.md`
is a target plan, not evidence that its milestones have shipped.

The Flutter workstream must coexist with the existing app. The React and
Capacitor implementation must remain functional until a production replacement
is explicitly approved. Do not copy planned architecture into the description
of current code.

## Development philosophy and constraints

- Keep timer rules independent of UI; use pure functions and test them.
- Derive countdowns from absolute end timestamps, not decremented counters.
- Keep user settings, statistics, and Kids-mode data local/offline.
- Keep the legacy React/Capacitor application intact during migration.
- Preserve the background timer ownership and break-due rules in
  `AGENTS.md`, `README.md`, and the Android service.
- Do not infer security from the Kids PIN hash; source comments describe it as
  a light deterrent, not real security.
- Keep sourced eye-care content and source IDs together.
- Require human approval for major architecture, data migration, production
  identity, security-sensitive changes, and release decisions.

## Evidence and unknowns

- Current audited branch/commit: `main` / `394de96`; this is a point-in-time
  observation, not a permanent branch policy.
- The checkout contains the React/Capacitor source and a Flutter scaffold.
- Flutter/Dart/Android device-tool availability and Flutter builds were not
  verified in the audit environment.
- Deployment/release status and physical-device behavior are unknown until
  supported by repository or test evidence.

See the architecture documents for implementation versus target distinctions,
and `PROJECT_STATE.md` for current verification.
