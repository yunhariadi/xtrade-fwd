import { describe, expect, it } from "vitest";
import type { Candle } from "@ict-forward-lab/core";
import { buildNarrative } from "./build";
import { buildWeeklyProfile } from "../weekly-profile";
import { buildSessionProfile } from "../session-profile";
import { classifyDraw } from "../irl-erl";
import type { LiquidityTarget } from "../irl-erl";

function c(open: number, high: number, low: number, close: number): Candle {
  return { time: 0, open, high, low, close, volume: 1, isClosed: true };
}

describe("buildNarrative", () => {
  it("degrades gracefully with no inputs", () => {
    const n = buildNarrative({});
    expect(n.short).toContain("Insufficient");
    expect(n.agentTask).toContain("ICT 2022");
  });

  it("weaves a bullish story into a long-only trade idea", () => {
    const weekly = buildWeeklyProfile(
      [c(67000, 67500, 66800, 67200), c(67200, 69200, 67100, 69000)],
      { high: 68000, low: 66000 }
    );
    const session = buildSessionProfile(
      "London",
      [c(105, 106, 104, 105), c(105, 106, 104, 105), c(103, 104, 96, 102), c(102, 113, 101, 112)],
      { high: 110, low: 100, highLabel: "asia_high", lowLabel: "asia_low" }
    );
    const targets: LiquidityTarget[] = [
      { category: "IRL", label: "5m bullish FVG", type: "fvg", price: 100, low: 99, high: 101 },
      { category: "ERL", label: "Asia High", type: "session_high", price: 120 },
    ];
    const draw = classifyDraw([c(100, 101, 99, 100), c(105, 106, 104, 105), c(110, 111, 109, 113)], targets);

    const n = buildNarrative({ weekly, session, draw });
    expect(n.short).toContain("Weekly bias bullish");
    expect(n.tradeIdea.toLowerCase()).toContain("long");
    expect(n.invalidIf.length).toBeGreaterThan(0);
  });
});
