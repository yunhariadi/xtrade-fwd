import { describe, it, expect } from "vitest";
import { getKillzoneWindows } from "./killzones";

// 2024-01-01 was a Monday. 00:00:00 UTC = 1704067200.
const MIDNIGHT = 1704067200;

describe("getKillzoneWindows", () => {
  it("marks the active killzone as current", () => {
    // 13:00 UTC is inside New York (12:00–14:00).
    const res = getKillzoneWindows(MIDNIGHT + 13 * 3600);
    expect(res.current?.name).toBe("New York");
    expect(res.current?.active).toBe(true);
    expect(res.current!.start).toBe(MIDNIGHT + 12 * 3600);
    expect(res.current!.end).toBe(MIDNIGHT + 14 * 3600);
  });

  it("returns null current and the soonest upcoming window when between killzones", () => {
    // 10:00 UTC — after London Open (ends 09:00), before New York (12:00).
    const res = getKillzoneWindows(MIDNIGHT + 10 * 3600);
    expect(res.current).toBeNull();
    expect(res.next?.name).toBe("New York");
    expect(res.next!.start).toBe(MIDNIGHT + 12 * 3600);
    expect(res.next!.secondsUntilStart).toBe(2 * 3600);
  });

  it("rolls past killzones forward to the next day", () => {
    // 23:00 UTC — every killzone today has closed; all roll to tomorrow.
    const res = getKillzoneWindows(MIDNIGHT + 23 * 3600);
    expect(res.current).toBeNull();
    for (const w of res.windows) {
      expect(w.start).toBeGreaterThan(MIDNIGHT + 23 * 3600);
    }
    // Asian (01:00) is the earliest the next day.
    expect(res.next?.name).toBe("Asian");
    expect(res.next!.start).toBe(MIDNIGHT + 86400 + 1 * 3600);
  });

  it("returns one window per killzone, sorted by start", () => {
    const res = getKillzoneWindows(MIDNIGHT + 13 * 3600);
    expect(res.windows).toHaveLength(4);
    const starts = res.windows.map((w) => w.start);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
  });
});
