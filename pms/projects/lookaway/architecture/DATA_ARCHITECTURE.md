# Data architecture

## Existing React application

The React hook `src/hooks/use-eye-timer.ts` uses browser `localStorage` keys:

- `lookaway:settings` for settings.
- `lookaway:stats` for daily statistics.
- `lookaway:kids` for Kids-mode settings and PIN hash.
- `lookaway:timer` for restorable timer state.

Timer serialization/restoration rules are in `src/lib/eye-timer.ts`. The
Android native service keeps its separate operational mirror in
`SharedPreferences` through `TimerStateStore`; completed native events are
consumed once by JavaScript. The native mirror is not the authoritative
application settings/statistics store.

Data is local and the application works offline. No application sync backend
was found in the inspected source. The Kids PIN hash is described by source
comments as a light deterrent, not a security boundary.

## Flutter migration

`shared_preferences` is declared in `flutter_app/pubspec.yaml`, while the
migration document proposes on-device persistence. Flutter storage behavior,
key/schema compatibility, import/export, and migration have not been
implemented or verified. The plan notes that Flutter cannot directly read the
old WebView localStorage and proposes an explicit export/import path; this
requires design before any migration that could affect user data.

## Constraints

- Keep the local store usable without network access or an account.
- Any future cloud sync must remain optional and merge into local data.
- Do not assume data is migrated merely because Flutter uses a similarly named
  key or dependency.
- Obtain human approval for destructive or user-data migrations.
- Do not place secrets, PINs, signing keys, tokens, or unnecessary personal
  information in PMS records.
