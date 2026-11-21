# System overview

## Existing implementation

The repository currently contains a web application built with React,
TypeScript, TanStack Start/Router, and Vite. Its route shell lives in
`src/routes/` and `src/router.tsx`. Timer and product logic live in `src/lib/`;
the React hook in `src/hooks/use-eye-timer.ts` coordinates settings, timer
state, native integration, and UI. Application state is kept locally rather
than in an application backend.

The Android project in `android/` is the Capacitor host for the existing web
application. Native Android components are Java. Their timer service mirrors
the state required for background operation and posts notifications.

## Planned, independent migration

`flutter_app/` is a separate early scaffold. The documented intention is a
native Flutter implementation while the React/Capacitor app remains intact.
No Flutter timer or production feature parity is implemented in the inspected
scaffold. The migration plan in `FLUTTER_REWRITE.md` is a target proposal and
is not evidence of delivery.

## Shared constraints

- Preserve the existing production implementation while the rewrite proceeds.
- Keep timer rules pure and UI-independent.
- Derive countdowns from phase end timestamps.
- Keep application data local/offline-first.
- Preserve the break-due/background ownership, event-drain, and Android
  notification constraints in root `AGENTS.md`.
- Keep any future data migration explicit and human-approved.

## Evidence boundaries

Current code: `src/`, `android/`, and `flutter_app/lib/`.
Current tests: `src/lib/*.test.ts` and `src/test/`.
Build instructions: root `README.md` and `FLUTTER_REWRITE.md`.
Target Android architecture: `FLUTTER_REWRITE.md`, clearly labeled as planned.

See `FLUTTER_ARCHITECTURE.md`, `ANDROID_ARCHITECTURE.md`, and
`DATA_ARCHITECTURE.md` for subsystem detail.
