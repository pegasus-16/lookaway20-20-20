import { describe, expect, it } from "vitest";
import {
  BREAK_DUE,
  DEFAULT_SETTINGS,
  IDLE,
  addDayStat,
  formatClock,
  pause,
  remainingMs,
  restoreTimer,
  resume,
  serializeTimer,
  snooze,
  startFocus,
  tick,
} from "./eye-timer";

const T0 = 1_000_000;

describe("20-20-20 rule", () => {
  it("defaults to 20 minutes of screen time", () => {
    const s = startFocus(DEFAULT_SETTINGS, T0);
    expect(remainingMs(s, T0)).toBe(20 * 60 * 1000);
  });

  it("starts a 20-second break when focus time ends", () => {
    const s = startFocus(DEFAULT_SETTINGS, T0);
    const end = T0 + 20 * 60 * 1000;
    const r = tick(s, DEFAULT_SETTINGS, end);
    expect(r.event).toBe("break-start");
    expect(r.state.phase).toBe("break");
    expect(remainingMs(r.state, end)).toBe(20 * 1000);
  });

  it("does not start a break one second early", () => {
    const s = startFocus(DEFAULT_SETTINGS, T0);
    const r = tick(s, DEFAULT_SETTINGS, T0 + 20 * 60 * 1000 - 1000);
    expect(r.event).toBeNull();
    expect(r.state.phase).toBe("focus");
  });

  it("returns to a new 20-minute focus after the break", () => {
    const brk = tick(startFocus(DEFAULT_SETTINGS, T0), DEFAULT_SETTINGS, T0 + 1_200_000).state;
    const after = T0 + 1_200_000 + 20_000;
    const r = tick(brk, DEFAULT_SETTINGS, after);
    expect(r.event).toBe("break-end");
    expect(r.state.phase).toBe("focus");
    expect(remainingMs(r.state, after)).toBe(1_200_000);
  });

  it("keeps the remaining time frozen while paused", () => {
    const s = startFocus(DEFAULT_SETTINGS, T0);
    const paused = pause(s, T0 + 60_000);
    expect(remainingMs(paused, T0 + 10 * 60_000)).toBe(19 * 60_000);
    expect(tick(paused, DEFAULT_SETTINGS, T0 + 60 * 60_000).event).toBeNull();
    const resumed = resume(paused, T0 + 10 * 60_000);
    expect(remainingMs(resumed, T0 + 10 * 60_000)).toBe(19 * 60_000);
  });

  it("snooze pushes the next break back 5 minutes", () => {
    expect(remainingMs(snooze(DEFAULT_SETTINGS, T0), T0)).toBe(5 * 60_000);
  });

  it("idle timer never fires", () => {
    expect(tick(IDLE, DEFAULT_SETTINGS, T0).event).toBeNull();
  });

  it("formats the clock as mm:ss", () => {
    expect(formatClock(20 * 60_000)).toBe("20:00");
    expect(formatClock(19_001)).toBe("00:20");
  });

  it("waits for the app to open before starting a due break", () => {
    expect(BREAK_DUE.phase).toBe("break_due");
    expect(remainingMs(BREAK_DUE, T0)).toBe(0);
    expect(tick(BREAK_DUE, DEFAULT_SETTINGS, T0 + 60 * 60_000).event).toBeNull();
  });

  it("restores a due break so opening the app can start it", () => {
    const saved = serializeTimer(BREAK_DUE, T0);
    const r = restoreTimer(saved, DEFAULT_SETTINGS, T0 + 60_000);
    expect(r.state.phase).toBe("break_due");
  });

  it("does not let a due break be paused or resumed", () => {
    expect(pause(BREAK_DUE, T0)).toEqual(BREAK_DUE);
    expect(resume(BREAK_DUE, T0)).toEqual(BREAK_DUE);
  });
});

describe("addDayStat", () => {
  it("adds a break to a specific day without touching others", () => {
    const before = { "2026-11-19": { breaks: 2, skipped: 0, screenMs: 100 } };
    const after = addDayStat(before, "2026-11-20", "breaks");
    expect(after["2026-11-20"]).toEqual({ breaks: 1, skipped: 0, screenMs: 0 });
    expect(after["2026-11-19"]).toEqual(before["2026-11-19"]);
  });

  it("adds a skip to a day that already has data", () => {
    const before = { "2026-11-20": { breaks: 1, skipped: 2, screenMs: 50 } };
    const after = addDayStat(before, "2026-11-20", "skipped");
    expect(after["2026-11-20"]).toEqual({ breaks: 1, skipped: 3, screenMs: 50 });
  });
});
