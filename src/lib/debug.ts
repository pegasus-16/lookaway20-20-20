// Debug-only helpers. These are compiled out of release builds because
// DEBUG_TOOLS_ENABLED is false unless Vite runs in development mode
// (`vite dev` or `vite build --mode development`).

import { EMPTY_DAY, dayKey, type DayStats, type EyeSettings } from "./eye-timer";

/** True for the dev server and for `npm run android:debug`. */
export const DEBUG_TOOLS_ENABLED = import.meta.env.MODE === "development";

/** Focus time applied when a debug build first loads minute-based settings. */
export const DEBUG_FOCUS_SECONDS = 10;

/** How many previous days the streak seeder fills by default. */
export const DEBUG_SEED_DAYS = 5;

/**
 * Debug builds treat old minute settings as "too slow": a saved 5–60 minute
 * focus is replaced by a 10-second focus, and long breaks are capped at 30s.
 * Values already in the debug range are kept, so slider choices survive
 * restarts.
 */
export function applyDebugTimings(
  settings: EyeSettings,
  enabled = DEBUG_TOOLS_ENABLED,
): EyeSettings {
  if (!enabled) return settings;
  return {
    ...settings,
    focusMinutes: settings.focusMinutes >= 5 ? DEBUG_FOCUS_SECONDS / 60 : settings.focusMinutes,
    breakSeconds: Math.min(settings.breakSeconds, 30),
  };
}

function dateKey(today: Date, daysAgo: number): string {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - daysAgo);
  return dayKey(d);
}

/**
 * Fill the previous `days` days (not today) with completed breaks. Today is
 * deliberately left empty, so the streak card shows the "keep it going" state.
 */
export function seedStreak(
  all: Record<string, DayStats>,
  today: Date,
  days = DEBUG_SEED_DAYS,
  breaks = 3,
): Record<string, DayStats> {
  const next = { ...all };
  for (let i = 1; i <= days; i++) {
    const key = dateKey(today, i);
    const day = { ...EMPTY_DAY, ...next[key] };
    next[key] = { ...day, breaks: Math.max(day.breaks, breaks) };
  }
  return next;
}

/** Add completed breaks to today, so the streak card switches to "Today counts!". */
export function seedToday(
  all: Record<string, DayStats>,
  today: Date,
  breaks = 1,
): Record<string, DayStats> {
  const key = dayKey(today);
  const day = { ...EMPTY_DAY, ...all[key] };
  return { ...all, [key]: { ...day, breaks: day.breaks + breaks } };
}

/** Drop every stored day. */
export function clearStats(): Record<string, DayStats> {
  return {};
}
