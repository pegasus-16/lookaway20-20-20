// Pure 20-20-20 timer logic. Time is always derived from timestamps so the
// countdown stays correct even when the browser throttles background tabs.

export type Phase = "idle" | "focus" | "break" | "break_due";

export type SoundKind = "chime" | "bowl" | "windchimes" | "kalimba" | "marimba";
export const SOUND_KINDS: SoundKind[] = ["chime", "bowl", "windchimes", "kalimba", "marimba"];

export interface EyeSettings {
  /** Minutes of screen time before a break (the first "20"). */
  focusMinutes: number;
  /** Seconds to look away during a break (the last "20"). */
  breakSeconds: number;
  sound: boolean;
  soundKind: SoundKind;
  /** 0–100 */
  volume: number;
  notifications: boolean;
  blinkNudges: boolean;
  /** How often to show a gentle "blink" cue during focus time. */
  blinkEveryMinutes: number;
  /** When on, reminders only run inside the working window below. */
  workHoursEnabled: boolean;
  /** "HH:MM", 24-hour. */
  workStart: string;
  workEnd: string;
  /** 0 = Sunday … 6 = Saturday */
  workDays: number[];
}

export const DEFAULT_SETTINGS: EyeSettings = {
  focusMinutes: 20,
  breakSeconds: 20,
  sound: true,
  soundKind: "chime",
  volume: 60,
  notifications: true,
  blinkNudges: true,
  blinkEveryMinutes: 5,
  workHoursEnabled: false,
  workStart: "09:00",
  workEnd: "18:00",
  workDays: [1, 2, 3, 4, 5],
};

/** The distance to look at during a break: 20 feet ≈ 6 metres. */
export const LOOK_DISTANCE = { feet: 20, metres: 6 } as const;

export interface TimerState {
  phase: Phase;
  /** Timestamp (ms) when the current phase ends; null when idle or paused. */
  endsAt: number | null;
  /** Remaining ms captured when paused; null when running or idle. */
  pausedRemainingMs: number | null;
  /** Total length of the current phase in ms, for progress rings. */
  durationMs: number;
}

export type TimerEvent = "break-start" | "break-end" | null;

export const focusMs = (s: EyeSettings) => s.focusMinutes * 60_000;
export const breakMs = (s: EyeSettings) => s.breakSeconds * 1_000;

export const IDLE: TimerState = {
  phase: "idle",
  endsAt: null,
  pausedRemainingMs: null,
  durationMs: 0,
};

/**
 * Focus time is over, but the break has not started. Breaks only begin when
 * the user opens the app, so a backgrounded app can never run a break (and the
 * next focus phase) without the user.
 */
export const BREAK_DUE: TimerState = {
  phase: "break_due",
  endsAt: null,
  pausedRemainingMs: null,
  durationMs: 0,
};

export function startFocus(settings: EyeSettings, now: number, ms = focusMs(settings)): TimerState {
  return { phase: "focus", endsAt: now + ms, pausedRemainingMs: null, durationMs: ms };
}

export function startBreak(settings: EyeSettings, now: number): TimerState {
  const ms = breakMs(settings);
  return { phase: "break", endsAt: now + ms, pausedRemainingMs: null, durationMs: ms };
}

/** Push the next break back by a few minutes. */
export function snooze(settings: EyeSettings, now: number, minutes = 5): TimerState {
  return startFocus(settings, now, minutes * 60_000);
}

export function isPaused(state: TimerState) {
  return state.phase !== "idle" && state.pausedRemainingMs !== null;
}

export function pause(state: TimerState, now: number): TimerState {
  if (state.phase === "idle" || state.endsAt === null) return state;
  return { ...state, endsAt: null, pausedRemainingMs: Math.max(0, state.endsAt - now) };
}

export function resume(state: TimerState, now: number): TimerState {
  if (state.pausedRemainingMs === null) return state;
  return { ...state, endsAt: now + state.pausedRemainingMs, pausedRemainingMs: null };
}

export function remainingMs(state: TimerState, now: number): number {
  if (state.phase === "idle") return 0;
  if (state.pausedRemainingMs !== null) return state.pausedRemainingMs;
  return Math.max(0, (state.endsAt ?? now) - now);
}

/** 0 → just started, 1 → finished. */
export function progress(state: TimerState, now: number): number {
  if (state.phase === "idle" || state.durationMs === 0) return 0;
  return 1 - remainingMs(state, now) / state.durationMs;
}

/** Advance the timer: focus rolls into a break, a break rolls back into focus. */
export function tick(
  state: TimerState,
  settings: EyeSettings,
  now: number,
): { state: TimerState; event: TimerEvent } {
  if (
    state.phase === "idle" ||
    state.phase === "break_due" ||
    isPaused(state) ||
    remainingMs(state, now) > 0
  ) {
    return { state, event: null };
  }
  if (state.phase === "focus") return { state: startBreak(settings, now), event: "break-start" };
  return { state: startFocus(settings, now), event: "break-end" };
}

export function formatClock(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Human phrase for a length of time, e.g. "20 seconds" or "20 minutes". */
export function formatSpan(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds} second${seconds === 1 ? "" : "s"}`;
  const minutes = Math.round(seconds / 60);
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

export function dayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export interface DayStats {
  breaks: number;
  skipped: number;
  /** Milliseconds of counted screen time that day. */
  screenMs: number;
}

export const EMPTY_DAY: DayStats = { breaks: 0, skipped: 0, screenMs: 0 };

/** Add one completed break or skip to a specific day. */
export function addDayStat(
  all: Record<string, DayStats>,
  key: string,
  field: "breaks" | "skipped",
): Record<string, DayStats> {
  const day = { ...EMPTY_DAY, ...all[key] };
  return { ...all, [key]: { ...day, [field]: day[field] + 1 } };
}

/** How late a focus phase ended (e.g. the phone slept). 0 if on time or not running. */
export function overdueMs(state: TimerState, now: number): number {
  if (state.phase === "idle" || state.endsAt === null) return 0;
  return Math.max(0, now - state.endsAt);
}

/** A break counts as "missed while away" when it was due more than a minute ago. */
export const MISSED_BREAK_GRACE_MS = 60_000;

/**
 * Screen time to add for one heartbeat. Gaps longer than maxGapMs mean the page
 * was frozen or asleep, so they don't count.
 */
export function screenTimeDelta(
  prev: number,
  now: number,
  counting: boolean,
  maxGapMs = 5_000,
): number {
  if (!counting) return 0;
  const d = now - prev;
  return d > 0 && d <= maxGapMs ? d : 0;
}

export interface InsightDay {
  key: string;
  letter: string;
  isToday: boolean;
  breaks: number;
  skipped: number;
  screenMs: number;
}

export function weekInsights(all: Record<string, DayStats>, today: Date, n = 7) {
  const days: InsightDay[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    const key = dayKey(d);
    const s = all[key];
    days.push({
      key,
      letter: DAY_LETTER[d.getDay()]!,
      isToday: i === 0,
      breaks: s?.breaks ?? 0,
      skipped: s?.skipped ?? 0,
      screenMs: s?.screenMs ?? 0,
    });
  }
  const breaks = days.reduce((a, d) => a + d.breaks, 0);
  const skipped = days.reduce((a, d) => a + d.skipped, 0);
  const screenMs = days.reduce((a, d) => a + d.screenMs, 0);
  const total = breaks + skipped;
  return {
    days,
    breaks,
    skipped,
    screenMs,
    /** Share of breaks taken rather than skipped, 0–100; null with no breaks. */
    finishRate: total === 0 ? null : Math.round((breaks / total) * 100),
    activeDays: days.filter((d) => d.breaks > 0).length,
  };
}

export function formatDuration(ms: number): string {
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function parseDayKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

// ---------- Working hours ----------

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** True when reminders should run at this moment. Supports overnight windows (e.g. 22:00–06:00). */
export function isWithinWorkHours(settings: EyeSettings, date: Date): boolean {
  if (!settings.workHoursEnabled) return true;
  const start = toMinutes(settings.workStart);
  const end = toMinutes(settings.workEnd);
  const mins = date.getHours() * 60 + date.getMinutes();
  if (start === end) return settings.workDays.includes(date.getDay());
  if (start < end) {
    return settings.workDays.includes(date.getDay()) && mins >= start && mins < end;
  }
  // Overnight: the shift belongs to the day it started on.
  if (mins >= start) return settings.workDays.includes(date.getDay());
  if (mins < end) return settings.workDays.includes((date.getDay() + 6) % 7);
  return false;
}

export function isWorkDayFn(settings: EyeSettings): (d: Date) => boolean {
  if (!settings.workHoursEnabled) return () => true;
  return (d) => settings.workDays.includes(d.getDay());
}

const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const DAY_LETTER = ["S", "M", "T", "W", "T", "F", "S"];

export function workDaysLabel(days: number[]): string {
  const set = [...new Set(days)].sort((a, b) => a - b);
  if (set.length === 7) return "Every day";
  if (set.join() === "1,2,3,4,5") return "Mon–Fri";
  if (set.join() === "0,6") return "Weekends";
  if (set.length === 0) return "No days";
  return set.map((d) => DAY_SHORT[d]).join(", ");
}

// ---------- Streaks ----------

export interface Streak {
  current: number;
  best: number;
}

/**
 * A streak day is any day with at least one completed break.
 * Today without a break yet doesn't break the streak, and neither do
 * non-working days (when working hours are on).
 */
export function computeStreak(
  all: Record<string, DayStats>,
  today: Date,
  isWorkDay: (d: Date) => boolean = () => true,
): Streak {
  const keys = Object.keys(all)
    .filter((k) => (all[k]?.breaks ?? 0) > 0)
    .sort();
  if (keys.length === 0) return { current: 0, best: 0 };
  const todayKey = dayKey(today);
  const cursor = parseDayKey(keys[0]!);
  let run = 0;
  let best = 0;
  for (let guard = 0; guard < 3660; guard++) {
    const key = dayKey(cursor);
    if (key > todayKey) break;
    const done = (all[key]?.breaks ?? 0) > 0;
    if (done) run++;
    else if (key !== todayKey && isWorkDay(cursor)) run = 0;
    best = Math.max(best, run);
    cursor.setDate(cursor.getDate() + 1);
  }
  return { current: run, best };
}

export interface DayDot {
  key: string;
  letter: string;
  done: boolean;
  isToday: boolean;
  restDay: boolean;
}

export function lastDays(
  all: Record<string, DayStats>,
  today: Date,
  n: number,
  isWorkDay: (d: Date) => boolean = () => true,
): DayDot[] {
  const out: DayDot[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    const key = dayKey(d);
    out.push({
      key,
      letter: DAY_LETTER[d.getDay()]!,
      done: (all[key]?.breaks ?? 0) > 0,
      isToday: i === 0,
      restDay: !isWorkDay(d),
    });
  }
  return out;
}

/** "18:30" → "6:30 PM" */
export function formatTime12(hhmm: string): string {
  const [h = 0, m = 0] = hhmm.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${suffix}`;
}

export function workHoursSummary(s: EyeSettings): string {
  if (!s.workHoursEnabled) return "Off · reminders anytime";
  return `${workDaysLabel(s.workDays)} · ${formatTime12(s.workStart)}–${formatTime12(s.workEnd)}`;
}

/** Fix settings saved by older versions (e.g. a sound that no longer exists). */
export function normalizeSettings(raw: Partial<EyeSettings>): EyeSettings {
  const s = { ...DEFAULT_SETTINGS, ...raw };
  if (!SOUND_KINDS.includes(s.soundKind)) s.soundKind = DEFAULT_SETTINGS.soundKind;
  return s;
}

// ---------- Timer persistence ----------

/** Saved timers older than this are discarded (e.g. app reopened the next day). */
export const MAX_RESTORE_AGE_MS = 12 * 60 * 60_000;

export interface SavedTimer {
  v: 1;
  /** When this save was written (ms). */
  savedAt: number;
  state: TimerState;
  /** Paused automatically by working hours (so it resumes when hours begin). */
  autoPaused: boolean;
}

export function serializeTimer(state: TimerState, now: number, autoPaused = false): SavedTimer {
  return { v: 1, savedAt: now, state: { ...state }, autoPaused };
}

const num = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);

function validState(s: unknown): s is TimerState {
  if (!s || typeof s !== "object") return false;
  const t = s as TimerState;
  if (t.phase === "break_due") {
    return t.endsAt === null && t.pausedRemainingMs === null;
  }
  if (t.phase !== "focus" && t.phase !== "break") return false;
  if (!num(t.durationMs) || t.durationMs <= 0) return false;
  const running = num(t.endsAt) && t.pausedRemainingMs === null;
  const paused = t.endsAt === null && num(t.pausedRemainingMs) && t.pausedRemainingMs >= 0;
  return running || paused;
}

/**
 * Rebuild the timer after the app was reopened. Returns IDLE for missing,
 * corrupt or stale (>12h since last save) data. A focus phase that ended while
 * closed is returned as-is so the normal tick starts the break (with the
 * "missed break" message). A break that ended while closed returns to focus
 * without being counted.
 */
export function restoreTimer(
  saved: unknown,
  settings: EyeSettings,
  now: number,
): { state: TimerState; autoPaused: boolean } {
  const none = { state: IDLE, autoPaused: false };
  if (!saved || typeof saved !== "object") return none;
  const s = saved as SavedTimer;
  if (s.v !== 1 || !num(s.savedAt) || !validState(s.state)) return none;
  // Future save time (clock moved back) or too old: start fresh.
  if (s.savedAt > now + 60_000 || now - s.savedAt > MAX_RESTORE_AGE_MS) return none;
  const st = s.state;
  const autoPaused = s.autoPaused === true && st.pausedRemainingMs !== null;
  if (st.phase === "break" && st.endsAt !== null && st.endsAt <= now) {
    return { state: startFocus(settings, now), autoPaused: false };
  }
  return { state: { ...st }, autoPaused };
}
