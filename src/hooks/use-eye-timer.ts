import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { playSound, unlockAudio } from "@/lib/sounds";
import {
  DEFAULT_SETTINGS,
  EMPTY_DAY,
  IDLE,
  BREAK_DUE,
  addDayStat,
  computeStreak,
  dayKey,
  formatClock,
  formatSpan,
  focusMs,
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
import {
  clearStats,
  applyDebugTimings,
  DEBUG_TOOLS_ENABLED,
  seedStreak,
  seedToday,
} from "@/lib/debug";
import { showReminder } from "@/lib/notify";
import {
  cancelTimerReminder,
  isAndroidApp,
  reconcileTimerReminder,
  registerNativeNotificationTapHandler,
  requestNativeNotificationPermission,
} from "@/lib/android-notifications";
import {
  consumeNativeTimerEvents,
  getNativeTimerState,
  isNativeTimerAvailable,
  registerNativeTimerListener,
  requestNativeTick,
  setNativeAppForeground,
  syncNativeTimer,
  type NativeTimerEvent,
  type NativeTimerState,
} from "@/lib/timer-service";

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

function persistStats(next: Record<string, DayStats>) {
  try {
    localStorage.setItem(STATS_KEY, JSON.stringify(next));
  } catch {
    /* storage full or blocked; stats stay in memory */
  }
}

interface UseEyeTimerOptions {
  /**
   * True while a sheet covers the timer (settings, week, working hours, guide,
   * kids). A break overlay would be hidden behind it, so a due break waits
   * until the timer screen is showing again.
   */
  breakBlocked?: boolean;
}

export function useEyeTimer(options: UseEyeTimerOptions = {}) {
  const breakBlocked = options.breakBlocked ?? false;
  const breakBlockedRef = useRef(breakBlocked);
  breakBlockedRef.current = breakBlocked;
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
  const lastBeatRef = useRef<number>(Date.now());
  // Screen time is written to stats at most once a second: the 250 ms
  // countdown heartbeat used to re-render every stat consumer (week chart,
  // streak, insights) and hit localStorage four times a second.
  const pendingScreenMsRef = useRef(0);
  const lastScreenFlushRef = useRef(0);
  // Guard: never save the timer until the saved one has been restored.
  const [restored, setRestored] = useState(false);
  const nativeTimer = useMemo(() => isNativeTimerAvailable(), []);
  const [nativeReady, setNativeReady] = useState(() => !isNativeTimerAvailable());

  const stateRef = useRef(state);
  stateRef.current = state;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  // Any local change is newer than a native snapshot fetched before it lands;
  // never let that stale snapshot rewind a just-started timer.
  const lastLocalChangeRef = useRef(0);
  const markLocalChange = useCallback(() => {
    lastLocalChangeRef.current = Date.now();
  }, []);

  const applyNativeEvents = useCallback((events: NativeTimerEvent[]) => {
    if (!events || events.length === 0) return;
    setAllStats((prev) => {
      let next = prev;
      let changed = false;
      for (const event of events) {
        if (!event || !Number.isFinite(event.at)) continue;
        if (event.type !== "break" && event.type !== "skip") continue;
        const key = dayKey(new Date(event.at));
        next = addDayStat(next, key, event.type === "break" ? "breaks" : "skipped");
        changed = true;
      }
      if (!changed) return prev;
      persistStats(next);
      return next;
    });
  }, []);

  const beginBreakFromDue = useCallback(() => {
    const t = Date.now();
    markLocalChange();
    lastBlinkRef.current = t;
    const next = startBreak(settingsRef.current, t);
    stateRef.current = next;
    setNow(t);
    setState(next);
    setAutoPaused(false);
    const s = settingsRef.current;
    // No OS notification is posted while the app is on screen, so the in-app
    // chime is the only sound here.
    if (s.sound) playSound(s.soundKind, s.volume, "start");
  }, [markLocalChange]);

  const adoptNativeState = useCallback(
    (native: NativeTimerState, announce: boolean) => {
      const prev = stateRef.current;
      if (native.phase === "idle") {
        if (prev.phase === "idle") return;
        stateRef.current = IDLE;
        setState(IDLE);
        setNow(Date.now());
        setAutoPaused(false);
        return;
      }

      // The native service marks a break as due while the app is hidden or a
      // sheet covers the timer. A break starts when the timer screen is back
      // on screen, never in the background or behind a sheet.
      if (native.phase === "break_due") {
        if (document.visibilityState === "visible" && !breakBlockedRef.current) {
          beginBreakFromDue();
          return;
        }
        if (prev.phase === "break_due") return;
        stateRef.current = BREAK_DUE;
        setState(BREAK_DUE);
        setNow(Date.now());
        setAutoPaused(false);
        return;
      }

      const next: TimerState = {
        phase: native.phase,
        endsAt: native.pausedRemainingMs !== null ? null : native.endAt,
        pausedRemainingMs: native.pausedRemainingMs,
        durationMs: native.durationMs,
      };
      if (
        prev.phase === next.phase &&
        prev.endsAt === next.endsAt &&
        prev.pausedRemainingMs === next.pausedRemainingMs &&
        prev.durationMs === next.durationMs
      ) {
        return;
      }

      const t = Date.now();
      stateRef.current = next;
      setState(next);
      setNow(t);
      setAutoPaused(false);
      if (!announce || prev.phase === "idle") return;

      const s = settingsRef.current;
      const visible = document.visibilityState === "visible";
      if ((prev.phase === "focus" || prev.phase === "break_due") && next.phase === "break") {
        lastBlinkRef.current = t;
        // While the app is on screen no OS alert is posted, so the in-app
        // chime plays here. In the background the native BreakAlarm rings.
        if (visible && s.sound) playSound(s.soundKind, s.volume, "start");
      } else if (prev.phase === "break" && next.phase === "focus") {
        lastBlinkRef.current = t;
        if (visible && s.sound) playSound(s.soundKind, s.volume, "end");
        toast.success("Break complete. Your eyes thank you.");
      }
    },
    [beginBreakFromDue],
  );

  // Load saved settings, stats and the running timer after hydration.
  useEffect(() => {
    const loaded = applyDebugTimings(normalizeSettings(readJSON(SETTINGS_KEY, DEFAULT_SETTINGS)));
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

    if (!nativeTimer) {
      setNativeReady(true);
      return;
    }

    let cancelled = false;
    void (async () => {
      const [nativeState, events] = await Promise.all([
        getNativeTimerState(),
        consumeNativeTimerEvents(),
      ]);
      if (cancelled) return;
      applyNativeEvents(events);

      const savedAt =
        saved && typeof (saved as { savedAt?: unknown }).savedAt === "number"
          ? (saved as { savedAt: number }).savedAt
          : 0;
      if (nativeState && nativeState.updatedAt > savedAt + 1_000) {
        adoptNativeState(nativeState, false);
      }

      // Native reminders replace the old one-shot LocalNotification schedule.
      await cancelTimerReminder();
      if (!cancelled) setNativeReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [nativeTimer, applyNativeEvents, adoptNativeState]);

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

  useEffect(() => {
    if (!restored || !nativeReady) return;
    if (nativeTimer) {
      void syncNativeTimer(state, settings);
    } else {
      void reconcileTimerReminder(state, settings, Date.now());
    }
  }, [restored, nativeReady, nativeTimer, state, settings, autoPaused]);

  useEffect(() => {
    if (!nativeTimer) return;
    let disposed = false;
    let remove: (() => void) | undefined;
    void registerNativeTimerListener((native) => {
      if (disposed) return;
      if (native.updatedAt + 1_000 < lastLocalChangeRef.current) return;
      adoptNativeState(native, true);
      void consumeNativeTimerEvents().then((events) => {
        if (!disposed) applyNativeEvents(events);
      });
    }).then((cleanup) => {
      if (disposed) cleanup();
      else remove = cleanup;
    });
    return () => {
      disposed = true;
      remove?.();
    };
  }, [nativeTimer, adoptNativeState, applyNativeEvents]);

  // Tell the service whether the app is on screen and the timer itself is
  // showing. It only starts a break by itself while both are true; otherwise
  // the break waits for the user to leave the background or the sheet.
  useEffect(() => {
    if (!nativeTimer) return;
    const report = () => {
      void setNativeAppForeground(document.visibilityState === "visible", !breakBlockedRef.current);
    };
    report();
    document.addEventListener("visibilitychange", report);
    window.addEventListener("focus", report);
    window.addEventListener("blur", report);
    return () => {
      document.removeEventListener("visibilitychange", report);
      window.removeEventListener("focus", report);
      window.removeEventListener("blur", report);
    };
  }, [nativeTimer, breakBlocked]);

  // A due break starts as soon as the timer screen is showing again.
  useEffect(() => {
    if (!nativeTimer || !nativeReady) return;
    const startIfDue = () => {
      if (breakBlockedRef.current) return;
      if (stateRef.current.phase !== "break_due") return;
      if (document.visibilityState !== "visible") return;
      beginBreakFromDue();
    };
    startIfDue();
    document.addEventListener("visibilitychange", startIfDue);
    return () => document.removeEventListener("visibilitychange", startIfDue);
  }, [nativeTimer, nativeReady, state.phase, breakBlocked, beginBreakFromDue]);

  useEffect(() => {
    const dispose = registerNativeNotificationTapHandler();
    const reconcile = () => {
      if (document.visibilityState !== "visible") return;
      if (nativeTimer) {
        void (async () => {
          // Let the service start a due break before we read the state back.
          await setNativeAppForeground(true, !breakBlockedRef.current);
          const [nativeState, events] = await Promise.all([
            getNativeTimerState(),
            consumeNativeTimerEvents(),
          ]);
          applyNativeEvents(events);
          if (
            nativeState &&
            nativeState.updatedAt + 1_000 >= lastLocalChangeRef.current &&
            (nativeState.phase !== "idle" || nativeState.updatedAt > 0)
          ) {
            adoptNativeState(nativeState, true);
          }
          await syncNativeTimer(stateRef.current, settingsRef.current);
        })();
      } else {
        void reconcileTimerReminder(stateRef.current, settingsRef.current, Date.now());
      }
    };
    document.addEventListener("visibilitychange", reconcile);
    window.addEventListener("pageshow", reconcile);
    return () => {
      dispose?.();
      document.removeEventListener("visibilitychange", reconcile);
      window.removeEventListener("pageshow", reconcile);
    };
  }, [nativeTimer, applyNativeEvents, adoptNativeState]);

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
      persistStats(next);
      return next;
    });
  }, []);

  // Heartbeat: fast while counting down, slow otherwise (to notice working hours changing).
  const paused = isPaused(state);
  const fast = state.phase !== "idle" && !paused;

  const flushScreenTime = useCallback(() => {
    const delta = pendingScreenMsRef.current;
    if (delta <= 0) return;
    pendingScreenMsRef.current = 0;
    setAllStats((p) => {
      const key = dayKey(new Date());
      const day = { ...EMPTY_DAY, ...p[key] };
      const next = { ...p, [key]: { ...day, screenMs: day.screenMs + delta } };
      persistStats(next);
      return next;
    });
  }, []);

  // Screen time: while the timer runs, or (in Kids mode) whenever the page is visible.
  useEffect(() => {
    const prev = lastBeatRef.current;
    lastBeatRef.current = now;
    const visible = document.visibilityState === "visible";
    const counting = visible && (kids.enabled || (state.phase === "focus" && !isPaused(state)));
    const d = screenTimeDelta(prev, now, counting);
    if (d > 0) pendingScreenMsRef.current += d;
    if (pendingScreenMsRef.current <= 0) return;
    // Batch the updates: one stat save per second instead of one per frame.
    if (now - lastScreenFlushRef.current < 1_000) return;
    lastScreenFlushRef.current = now;
    flushScreenTime();
  }, [now, kids.enabled, state, flushScreenTime]);

  // Save the last partial second when the page is hidden or closed.
  useEffect(() => {
    const flush = () => {
      if (document.visibilityState === "hidden") flushScreenTime();
    };
    document.addEventListener("visibilitychange", flush);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", flush);
      window.removeEventListener("pagehide", flush);
    };
  }, [flushScreenTime]);
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), fast ? 250 : 1000);
    return () => window.clearInterval(id);
  }, [fast]);

  // Phase transitions. On Android the foreground service owns these while the
  // app is backgrounded, so JS adopts its broadcast instead of racing it.
  useEffect(() => {
    if (!restored || !nativeReady || nativeTimer) return;
    const s = settingsRef.current;
    const r = tick(state, s, now);
    if (!r.event) return;
    // A sheet covers the timer: keep the break due and start it when the user
    // closes the sheet, instead of running (and counting) it unseen.
    if (r.event === "break-start" && breakBlockedRef.current) return;
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
      notify("Nice — eyes rested", `Next break in ${formatSpan(focusMs(s))}.`);
      toast.success("Break complete. Your eyes thank you.");
      lastBlinkRef.current = Date.now();
    }
  }, [now, state, bumpStats, restored, nativeReady, nativeTimer]);

  // Working hours: pause outside the window, pick back up when it opens.
  const inHours = isWithinWorkHours(settings, new Date(now));
  useEffect(() => {
    if (inHours) setOverride(false);
  }, [inHours]);
  useEffect(() => {
    if (state.phase !== "focus") return;
    if (!inHours && !override && !isPaused(state)) {
      markLocalChange();
      setState((s) => pauseState(s, Date.now()));
      setAutoPaused(true);
      toast("Outside your working hours — reminders are resting.");
    } else if (inHours && autoPaused && isPaused(state)) {
      const t = Date.now();
      markLocalChange();
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

  // The native alarm can land slightly after the deadline. While the app is
  // visible, nudge the service so the countdown never sits at 00:00; the
  // service still decides the transition, so a break is never counted twice.
  const lastNativeTickRef = useRef(0);
  useEffect(() => {
    if (!nativeTimer || !nativeReady) return;
    if (document.visibilityState !== "visible") return;
    if (state.phase !== "focus" && state.phase !== "break") return;
    if (state.endsAt === null || remaining > 0) return;
    const t = Date.now();
    if (t - state.endsAt < 300) return;
    if (t - lastNativeTickRef.current < 500) return;
    lastNativeTickRef.current = t;
    void requestNativeTick();
  }, [nativeTimer, nativeReady, remaining, state]);

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
    if (timeUp && state.phase !== "idle") {
      markLocalChange();
      setState(IDLE);
    }
  }, [timeUp, state.phase, markLocalChange]);
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
    if (isAndroidApp()) return requestNativeNotificationPermission();
    if (typeof Notification === "undefined") return "unsupported" as const;
    if (Notification.permission === "default") return Notification.requestPermission();
    return Notification.permission;
  }, []);

  const outsideNow = () => !isWithinWorkHours(settingsRef.current, new Date());

  const actions = {
    start: () => {
      if (timeUp) return;
      unlockAudio();
      if (settingsRef.current.notifications) void askNotifications();
      const t = Date.now();
      markLocalChange();
      lastBlinkRef.current = t;
      setNow(t);
      setAutoPaused(false);
      if (outsideNow()) setOverride(true);
      setState(startFocus(settingsRef.current, t));
    },
    pause: () => {
      markLocalChange();
      setAutoPaused(false);
      setState((s) => pauseState(s, Date.now()));
    },
    resume: () => {
      unlockAudio();
      const t = Date.now();
      markLocalChange();
      setNow(t);
      setAutoPaused(false);
      if (outsideNow()) setOverride(true);
      setState((s) => resumeState(s, t));
    },
    stop: () => {
      markLocalChange();
      setAutoPaused(false);
      setState(IDLE);
      if (nativeTimer) void syncNativeTimer(IDLE, settingsRef.current);
      else void reconcileTimerReminder(IDLE, settingsRef.current, Date.now());
      try {
        localStorage.removeItem(TIMER_KEY);
      } catch {
        /* ignore */
      }
    },
    breakNow: () => {
      unlockAudio();
      const t = Date.now();
      markLocalChange();
      setNow(t);
      setState(startBreak(settingsRef.current, t));
    },
    skipBreak: () => {
      bumpStats("skipped");
      const t = Date.now();
      markLocalChange();
      lastBlinkRef.current = t;
      setNow(t);
      setState(startFocus(settingsRef.current, t));
    },
    snooze: () => {
      const t = Date.now();
      markLocalChange();
      setNow(t);
      setState(snoozeState(settingsRef.current, t));
      toast("Snoozed for 5 minutes");
    },
    dismissBlink: () => setBlinkCue(false),
  };

  const seedDebugStreak = useCallback(() => {
    setAllStats((prev) => {
      const next = seedStreak(prev, new Date());
      persistStats(next);
      return next;
    });
  }, []);

  const seedDebugToday = useCallback(() => {
    setAllStats((prev) => {
      const next = seedToday(prev, new Date());
      persistStats(next);
      return next;
    });
  }, []);

  const resetDebugStats = useCallback(() => {
    setAllStats(clearStats());
    try {
      localStorage.removeItem(STATS_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const debug = DEBUG_TOOLS_ENABLED
    ? { seedStreak: seedDebugStreak, seedToday: seedDebugToday, clearStats: resetDebugStats }
    : null;

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
    debug,
  };
}
