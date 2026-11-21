<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

## Project rules

- Timer rules live as pure functions in `src/lib/eye-timer.ts` (tested in `eye-timer.test.ts`); UI hooks only call them. Why: keeps the reminder timing testable and correct.
- Countdown is derived from end timestamps, never by decrementing a counter. Why: background tabs throttle intervals.
- Settings and daily stats are stored in the browser's localStorage; no backend. Why: a personal timer needs no account.
- Sounds are synthesized with the Web Audio API in `src/lib/sounds.ts`; no audio files. Why: tiny, offline, and works without asset hosting.
- Eye-care guide content lives as data in `src/lib/eye-care-guide.ts`; every item lists source ids from `SOURCES`. Why: user requires evidence-backed info with visible references.

- Kids-mode rules (allowance, bonus, PIN hash, stars) live as pure functions in `src/lib/kids-mode.ts` with tests; stored on-device under `lookaway:kids`. Why: testable and works offline without accounts.
- Offline support uses vite-plugin-pwa (generateSW) and is registered only from `src/lib/pwa.ts`, which refuses dev, preview and iframes. Why: service workers must never cache the editor preview.

- On Android, `TimerService` is a foreground service that mirrors the current focus/break phase; it only owns transitions while the WebView is backgrounded, and JavaScript still applies settings, working hours and kids mode. Why: a reminder must fire when the app is not open.
- A break may only start while the app is on screen. When focus ends in the background the service sets `break_due` and stops; opening the app starts the break, then focus starts automatically after it. Why: the timer must not cycle focus/break without the user ever taking a break.
- Native completed breaks/skips are handed back as events in `TimerStateStore` and drained into `DayStats` exactly once; JS must not repeat transitions while the native timer is available. Why: otherwise breaks are counted twice.
- Android notification channels live in `NotificationChannels.java` and are versioned (`eye_breaks_v2`, `timer_status_v1`). The foreground service owns only the quiet status notification; a break alert is a normal high-importance notification grouped under it on `eye_breaks_v2`. It must not be the foreground-service notification: those are pinned on many Android versions, cannot be swiped away, and do not reliably banner. Dismissing or clearing the alert (or the timer card) runs the delete intent, which stops the alarm and the timer. `eye_breaks_v2` has no channel sound; `BreakAlarm` synthesizes a repeating alarm tone on `USAGE_ALARM` until the user acts, so the reminder sounds like a Clock alarm rather than a single beep. Why: channel sound is immutable once created, and the alert must be dismissible and visible as a heads-up banner.
- The visible countdown nudges the service when a deadline has just passed, because system alarms can arrive late. The service still decides whether to advance, so the fallback never counts a break twice. Why: a late alarm made a break sit at `00:00`.
- The break countdown never displays `0`; it holds `1` until the service flips the phase. Why: the fraction of a second between the deadline and the transition looked like a frozen timer.
- Screen-time stats are saved at most once a second and flushed on hide, and the break image is preloaded. Why: recalculating stats and hitting localStorage on every 250 ms heartbeat made phase changes janky.
- Install Android builds with `npm run android:install` or `android:build-install` (retries, non-streamed fallback, signature-mismatch uninstall). Debug APKs are signed per machine; never install over a build from another key without uninstalling first. Why: a first-attempt failure or signature mismatch otherwise looks like a broken APK.
- The ongoing status notification shows the next break time instead of a countdown chronometer. Why: Android keeps counting a countdown below zero between the deadline and the service's next update, which showed "-1" in the shade.
- The manifest never declares Bluetooth, Wi-Fi nearby or UWB permissions; explicit `tools:node="remove"` entries keep them out if a dependency tries to merge them in. Why: Lookaway has no nearby-device features and must not ask for that permission group.
- Debug timings and the Debug tools card are gated by `DEBUG_TOOLS_ENABLED` (`src/lib/debug.ts`), which is false outside development builds. Why: fast test timings must never ship.
- Data is offline-first: localStorage is the source of truth; any future cloud sync must be optional and merge into it. Why: the app must keep working with no internet or account.

## Project Memory System

- Before implementation, read [`pms/README.md`](pms/README.md), the onboarding protocol, project context/state/focus, and the latest handoff; inspect the actual Git branch and worktree.
- Identify the active task, read its acceptance criteria and dependencies, and review relevant accepted ADRs. Follow the human approval boundaries in `pms/framework/protocols/HUMAN_APPROVAL.md`.
- Keep task status evidence-based. Never fabricate completion, approval, test results, device verification, or release status.
- After substantial work, update the task and relevant project state, append activity/session records, record actual test commands and outcomes, validate memory, and create a handoff. Preserve historical JSONL records; do not log secrets.
