import { describe, expect, it } from "vitest";

import { clearStats, applyDebugTimings, seedStreak, seedToday } from "./debug";
import { computeStreak, DEFAULT_SETTINGS, type DayStats } from "./eye-timer";

// 2026-11-20 is a Friday.
const today = new Date(2026, 10, 20, 12);

describe("debug streak seeder", () => {
  it("fills the previous days but leaves today empty", () => {
    const stats = seedStreak({}, today, 5);
    expect(Object.keys(stats).sort()).toEqual([
      "2026-11-15",
      "2026-11-16",
      "2026-11-17",
      "2026-11-18",
      "2026-11-19",
    ]);
    expect(stats["2026-11-20"]).toBeUndefined();
    expect(computeStreak(stats, today).current).toBe(5);
  });

  it("adds a break to today and extends the streak", () => {
    const stats = seedToday(seedStreak({}, today, 5), today, 2);
    expect(stats["2026-11-20"]?.breaks).toBe(2);
    expect(computeStreak(stats, today).current).toBe(6);
  });

  it("keeps existing counts instead of overwriting them", () => {
    const existing: Record<string, DayStats> = {
      "2026-11-19": { breaks: 9, skipped: 1, screenMs: 1000 },
    };
    const stats = seedStreak(existing, today, 1, 3);
    expect(stats["2026-11-19"]).toEqual({ breaks: 9, skipped: 1, screenMs: 1000 });
  });

  it("clears every day", () => {
    expect(clearStats()).toEqual({});
  });
});

describe("debug timings", () => {
  it("turns a saved 20-minute focus into 10 seconds", () => {
    const s = applyDebugTimings(DEFAULT_SETTINGS, true);
    expect(s.focusMinutes * 60).toBe(10);
  });

  it("keeps a focus that is already in the debug range", () => {
    const s = applyDebugTimings({ ...DEFAULT_SETTINGS, focusMinutes: 30 / 60 }, true);
    expect(s.focusMinutes * 60).toBe(30);
  });

  it("caps a long break at 30 seconds", () => {
    const s = applyDebugTimings({ ...DEFAULT_SETTINGS, breakSeconds: 60 }, true);
    expect(s.breakSeconds).toBe(30);
  });

  it("leaves release settings alone", () => {
    const s = applyDebugTimings(DEFAULT_SETTINGS, false);
    expect(s).toEqual(DEFAULT_SETTINGS);
  });
});
