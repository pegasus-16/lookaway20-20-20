import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { playSound, unlockAudio } from "@/lib/sounds";
import {
  DEFAULT_SETTINGS,
  EMPTY_DAY,
  IDLE,
  computeStreak,
  dayKey,
  formatClock,
  isPaused,
  isWithinWorkHours,
  isWorkDayFn,
  lastDays,
  MISSED_BREAK_GRACE_MS,
  overdueMs,
  screenTimeDelta,
  weekInsights,
  normalizeSettings,
  parseDayKey,
  pause as pauseState,
  remainingMs,
  resume as resumeState,
  restoreTimer,
  serializeTimer,
  snooze as snoozeState,
  startBreak,
  startFocus,
  tick,
  type DayStats,
  type EyeSettings,
  type TimerState,
} from "@/lib/eye-timer";
import { DEFAULT_KIDS, isTimeUp, type KidsSettings } from "@/lib/kids-mode";
import { showReminder } from "@/lib/notify";
import {
  checkNativeReminderPermission,
  isNativePlatform,
  requestNativeReminderPermission,
  syncNativeReminders,
  type ReminderPermission,
} from "@/lib/native-reminders";

const SETTINGS_KEY = "lookaway:settings";
const STATS_KEY = "lookaway:stats";
const KIDS_KEY = "lookaway:kids";
const TIMER_KEY = "lookaway:timer";

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

function notify(title: string, body: string) {
  void showReminder(title, body);
}

export function useEyeTimer() {
  const [settings, setSettings] = useState<EyeSettings>(DEFAULT_SETTINGS);
  const [state, setState] = useState<TimerState>(IDLE);
  const [now, setNow] = useState(() => Date.now());
  const [allStats, setAllStats] = useState<Record<string, DayStats>>({});
  const [blinkCue, setBlinkCue] = useState(false);
  const [autoPaused, setAutoPaused] = useState(false);
  // User chose to keep going outside working hours; cleared when hours begin.
  const [override, setOverride] = useState(false);
  const lastBlinkRef = useRef<number>(Date.now());
  const [kids, setKids] = useState<KidsSettings>(DEFAULT_KIDS);
  const [notificationPermission, setNotificationPermission] =
    useState<ReminderPermission>("default");
  const notificationRequestInFlight = useRef(false);
  const lastBeatRef = useRef<number>(Date.now());
  // Guard: never save the timer until the saved one has been restored.
  const [restored, setRestored] = useState(false);

  // Load saved settings, stats and the running timer after hydration.
  useEffect(() => {
    const loaded = normalizeSettings(readJSON(SETTINGS_KEY, DEFAULT_SETTINGS));
    setSettings(loaded);
    setAllStats(readJSON<Record<string, DayStats>>(STATS_KEY, {}));
    setKids(readJSON(KIDS_KEY, DEFAULT_KIDS));
    let saved: unknown = null;
    try {
      const raw = localStorage.getItem(TIMER_KEY);
      saved = raw ? JSON.parse(raw) : null;
    } catch {
      saved = null;
    }
    const t = Date.now();
    const r = restoreTimer(saved, loaded, t);
    if (r.state.phase !== "idle") {
      lastBlinkRef.current = t;
      setNow(t);
      setState(r.state);
      setAutoPaused(r.autoPaused);
    }
    setRestored(true);
  }, []);

  // Persist the timer whenever it changes (cleared when idle / stopped).
  useEffect(() => {
    if (!restored) return;
    try {
      if (state.phase === "idle") localStorage.removeItem(TIMER_KEY);
      else
        localStorage.setItem(
          TIMER_KEY,
          JSON.stringify(serializeTimer(state, Date.now(), autoPaused)),
        );
    } catch {
      /* storage full or blocked; timer still works in memory */
    }
  }, [restored, state, autoPaused]);

  // Refresh the save time when the app is hidden or closed, so the 12-hour rule
  // measures from when the app was last used, not when the timer last changed.
  useEffect(() => {
    if (!restored || state.phase === "idle") return;
    const save = () => {
      try {
        localStorage.setItem(
          TIMER_KEY,
          JSON.stringify(serializeTimer(state, Date.now(), autoPaused)),
        );
      } catch {
        /* ignore */
      }
    };
    const onVis = () => document.visibilityState === "hidden" && save();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", save);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", save);
    };
  }, [restored, state, autoPaused]);

  const updateKids = useCallback((patch: Partial<KidsSettings>) => {
    setKids((prev) => {
      const next = { ...prev, ...patch };
      localStorage.setItem(KIDS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const updateSettings = useCallback((patch: Partial<EyeSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const bumpStats = useCallback((field: keyof DayStats) => {
    setAllStats((prev) => {
      const key = dayKey(new Date());
      const day = { ...EMPTY_DAY, ...prev[key] };
      const next = { ...prev, [key]: { ...day, [field]: day[field] + 1 } };
      localStorage.setItem(STATS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const stateRef = useRef(state);
  stateRef.current = state;
  const overrideRef = useRef(override);
  overrideRef.current = override;
  const nativePlatform = isNativePlatform();

  const synchronizeNativeReminders = useCallback(async () => {
    if (!nativePlatform) return;
    try {
      const result = await syncNativeReminders(
        stateRef.current,
        settingsRef.current,
        Date.now(),
        overrideRef.current,
      );
      if (result) setNotificationPermission(result.permission);
    } catch (error) {
      console.error("Could not reconcile native eye-break reminders.", error);
      toast.error("Android reminders could not be updated. Reopen Lookaway to try again.");
    }
  }, [nativePlatform]);

  useEffect(() => {
    if (!restored || !nativePlatform) return;
    void synchronizeNativeReminders();
  }, [restored, state, settings, override, nativePlatform, synchronizeNativeReminders]);

  useEffect(() => {
    if (!restored || !nativePlatform) return;
    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      setNow(Date.now());
      void synchronizeNativeReminders();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [restored, nativePlatform, synchronizeNativeReminders]);

  // Heartbeat: fast while counting down, slow otherwise (to notice working hours changing).
  const paused = isPaused(state);
  const fast = state.phase !== "idle" && !paused;

  // Screen time: while the timer runs, or (in Kids mode) whenever the page is visible.
  useEffect(() => {
    const prev = lastBeatRef.current;
    lastBeatRef.current = now;
    const visible = document.visibilityState === "visible";
    const counting = visible && (kids.enabled || (state.phase === "focus" && !isPaused(state)));
    const d = screenTimeDelta(prev, now, counting);
    if (d === 0) return;
    setAllStats((p) => {
      const key = dayKey(new Date(now));
      const day = { ...EMPTY_DAY, ...p[key] };
      const next = { ...p, [key]: { ...day, screenMs: day.screenMs + d } };
      localStorage.setItem(STATS_KEY, JSON.stringify(next));
      return next;
    });
  }, [now, kids.enabled, state]);
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), fast ? 250 : 1000);
    return () => window.clearInterval(id);
  }, [fast]);

  // Phase transitions.
  useEffect(() => {
    const s = settingsRef.current;
    const r = tick(state, s, now);
    if (!r.event) return;
    setState(r.state);
    if (r.event === "break-start") {
      const late = overdueMs(state, now);
      if (late > MISSED_BREAK_GRACE_MS) {
        toast(
          `Welcome back! A break was due ${Math.round(late / 60_000)} min ago while the app was closed — let's take it now.`,
        );
      }
      if (s.sound) playSound(s.soundKind, s.volume, "start");
      notify(
        "Time to look away",
        `Look at something 20 feet (6 m) away for ${s.breakSeconds} seconds.`,
      );
    } else {
      bumpStats("breaks");
      if (s.sound) playSound(s.soundKind, s.volume, "end");
      notify("Nice — eyes rested", `Next break in ${s.focusMinutes} minutes.`);
      toast.success("Break complete. Your eyes thank you.");
      lastBlinkRef.current = Date.now();
    }
  }, [now, state, bumpStats]);

  // Working hours: pause outside the window, pick back up when it opens.
  const inHours = isWithinWorkHours(settings, new Date(now));
  useEffect(() => {
    if (inHours) setOverride(false);
  }, [inHours]);
  useEffect(() => {
    if (state.phase !== "focus") return;
    if (!inHours && !override && !isPaused(state)) {
      setState((s) => pauseState(s, Date.now()));
      setAutoPaused(true);
      toast("Outside your working hours — reminders are resting.");
    } else if (inHours && autoPaused && isPaused(state)) {
      const t = Date.now();
      lastBlinkRef.current = t;
      setNow(t);
      setState((s) => resumeState(s, t));
      setAutoPaused(false);
      toast("Working hours started — reminders are back on.");
    }
  }, [inHours, override, autoPaused, state]);

  // Gentle blink nudges during focus time.
  useEffect(() => {
    if (!settings.blinkNudges || state.phase !== "focus" || isPaused(state)) return;
    if (now - lastBlinkRef.current >= settings.blinkEveryMinutes * 60_000) {
      lastBlinkRef.current = now;
      setBlinkCue(true);
      window.setTimeout(() => setBlinkCue(false), 6000);
    }
  }, [now, state, settings.blinkNudges, settings.blinkEveryMinutes]);

  // Countdown in the browser tab title so it's visible from other tabs.
  const remaining = remainingMs(state, now);
  useEffect(() => {
    if (state.phase === "idle") document.title = "Lookaway · 20-20-20 eye breaks";
    else if (state.phase === "break")
      document.title = `👀 Look away · ${Math.ceil(remaining / 1000)}s`;
    else
      document.title = `${formatClock(remaining)}${isPaused(state) ? " (paused)" : ""} · Lookaway`;
  }, [state, remaining]);

  // Streaks.
  const todayKey = dayKey(new Date(now));
  const stats = { ...EMPTY_DAY, ...allStats[todayKey] };
  const timeUp = isTimeUp(kids, todayKey, stats.screenMs);
  useEffect(() => {
    if (timeUp && state.phase !== "idle") setState(IDLE);
  }, [timeUp, state.phase]);
  const insights = useMemo(
    () => weekInsights(allStats, parseDayKey(todayKey)),
    [allStats, todayKey],
  );
  const { workHoursEnabled, workDays } = settings;
  const { streak, week } = useMemo(() => {
    const today = parseDayKey(todayKey);
    const isWork = isWorkDayFn({ ...DEFAULT_SETTINGS, workHoursEnabled, workDays });
    return {
      streak: computeStreak(allStats, today, isWork),
      week: lastDays(allStats, today, 7, isWork),
    };
  }, [allStats, todayKey, workHoursEnabled, workDays]);

  const askNotifications = useCallback(async () => {
    if (nativePlatform) {
      try {
        const current = await checkNativeReminderPermission();
        setNotificationPermission(current);
        if (current !== "default" || notificationRequestInFlight.current) return current;
        notificationRequestInFlight.current = true;
        try {
          const requested = await requestNativeReminderPermission();
          setNotificationPermission(requested);
          if (requested === "granted") await synchronizeNativeReminders();
          return requested;
        } finally {
          notificationRequestInFlight.current = false;
        }
      } catch (error) {
        console.error("Could not request native notification permission.", error);
        setNotificationPermission("error");
        toast.error("Android notification access could not be checked. Try again.");
        return "error";
      }
    }
    if (typeof Notification === "undefined") return "unsupported" as const;
    if (Notification.permission === "default") return Notification.requestPermission();
    return Notification.permission;
  }, [nativePlatform, synchronizeNativeReminders]);

  const outsideNow = () => !isWithinWorkHours(settingsRef.current, new Date());

  const actions = {
    start: () => {
      if (timeUp) return;
      unlockAudio();
      if (settingsRef.current.notifications) void askNotifications();
      const t = Date.now();
      lastBlinkRef.current = t;
      setNow(t);
      setAutoPaused(false);
      if (outsideNow()) setOverride(true);
      setState(startFocus(settingsRef.current, t));
    },
    pause: () => {
      setAutoPaused(false);
      setState((s) => pauseState(s, Date.now()));
    },
    resume: () => {
      unlockAudio();
      const t = Date.now();
      setNow(t);
      setAutoPaused(false);
      if (outsideNow()) setOverride(true);
      setState((s) => resumeState(s, t));
    },
    stop: () => {
      setAutoPaused(false);
      setState(IDLE);
      try {
        localStorage.removeItem(TIMER_KEY);
      } catch {
        /* ignore */
      }
    },
    breakNow: () => {
      unlockAudio();
      const t = Date.now();
      setNow(t);
      setState(startBreak(settingsRef.current, t));
    },
    skipBreak: () => {
      bumpStats("skipped");
      const t = Date.now();
      lastBlinkRef.current = t;
      setNow(t);
      setState(startFocus(settingsRef.current, t));
    },
    snooze: () => {
      const t = Date.now();
      setNow(t);
      setState(snoozeState(settingsRef.current, t));
      toast("Snoozed for 5 minutes");
    },
    dismissBlink: () => setBlinkCue(false),
  };

  return {
    settings,
    updateSettings,
    state,
    now,
    remaining,
    stats,
    streak,
    week,
    insights,
    kids,
    updateKids,
    todayKey,
    timeUp,
    inHours,
    autoPaused,
    blinkCue,
    actions,
    askNotifications,
    nativePlatform,
    notificationPermission,
  };
}
