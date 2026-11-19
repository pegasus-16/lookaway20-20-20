# Lookaway Native Android — Phase 1

## Implemented

Added a native-only TanStack Start build configuration that uses the existing Lovable Vite/TanStack wrapper, disables Nitro output, and statically prerenders the `/` route. The client environment writes directly to `native-web`, while its server renderer is emitted to the separate `.native-build` intermediate directory. This produces the prerendered `native-web/index.html` at the root of the native web-assets directory, alongside its required assets.

Added the `build:native` package script and ignored both generated output directories. The regular PWA build still uses the original `vite.config.ts`; no application source, timer, notification, or UI behavior was changed.

## Files changed or created

Modified:

- `.gitignore` — ignore `.native-build/` and `native-web/`.
- `package.json` — add `build:native`.

Created:

- `vite.native.config.ts` — native-only prerender and separate output configuration.
- `PHASE1-COMPLETE.md` — this report.

Generated, ignored build output:

- `native-web/index.html` and the client assets under `native-web/`.
- Intermediate server-renderer output under `.native-build/`.

`vite.config.ts`, `src/`, and `bun.lock` are unchanged. `package-lock.json` was already untracked before this work and was left untouched. `COPILOT-REPORT.txt` was also already present and left untouched.

## Verification

- **Existing tests:** pass — 7 test files, 40 tests.
- **Normal PWA production build:** passes with exit code 0.
- **Native static build:** passes with `npm run build:native`; TanStack prerendered `/`.
- **Native entrypoint:** `native-web/index.html` exists and is a valid prerendered HTML document.
- **Asset check:** all 9 local HTML references resolve in `native-web`; CSS-local asset URLs were checked as well.
- **Diff check:** `git diff --check` passes.

Commands used:

- `npm test`
- `npm run build`
- `npm run build:native`

Bun is not installed in this environment, so `bun run build:native` could not run. No dependencies were installed; the project continues to use its tracked `bun.lock` as the authoritative lockfile.

## PWA status and potential impact

The original `vite.config.ts` and all PWA application code remain unchanged. The new native configuration does not include `vite-plugin-pwa`, and its output is separate from the PWA output.

The normal PWA build currently emits a Workbox warning that its glob matches no files and reports **0 precache entries**. It generates `dist/sw.js`, but the built `.output/public` directory does not contain `sw.js`. These are observations from the unchanged PWA build path, not changes made for Phase 1; the PWA build exits successfully, but the offline precache/deployment output should be reviewed separately before assuming it is populated.

## Remaining Capacitor work

Capacitor packages, the Android project, and native notification integration have not been added. Before packaging this bundle, a later phase should prevent the PWA service-worker registration attempt from running in the Capacitor app and integrate native local notifications. Google Fonts are still requested from their existing remote URLs; the app can use its CSS fallback fonts when offline.

No commits or pushes were made. Work remains on `native-android`, based on the same commit as `origin/main` when the branch was created.
