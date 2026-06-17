import { describe, expect, it } from "vitest";
import { buildCalibrationReport, type CalibrationSample } from "./calibration";

function sample(
  score: number,
  outcome: CalibrationSample["outcome"],
  signals: CalibrationSample["signals"] = {},
  rMultiple: number | null = outcome === "win" ? 2 : outcome === "loss" ? -1 : null
): CalibrationSample {
  return { score, outcome, signals, rMultiple };
}

describe("buildCalibrationReport", () => {
  it("excludes no_fill / open from win-rate and avg-R", () => {
    const r = buildCalibrationReport([
      sample(80, "win"),
      sample(75, "loss"),
      sample(60, "no_fill"),
      sample(55, "open", {}, 0.5),
    ]);
    expect(r.total).toBe(4);
    expect(r.filled).toBe(3); // excludes the one no_fill
    expect(r.decided).toBe(2); // win + loss
    expect(r.winRate).toBe(0.5);
    expect(r.avgR).toBeCloseTo(0.5, 3); // (2 + -1)/2
  });

  it("buckets win rate by score so calibration is visible", () => {
    const r = buildCalibrationReport([
      sample(85, "win"),
      sample(82, "win"),
      sample(72, "win"),
      sample(72, "loss"),
      sample(40, "loss"),
    ]);
    const high = r.byScoreBucket.find((b) => b.min === 80)!;
    const oc = r.byScoreBucket.find((b) => b.min === 70)!;
    const ignore = r.byScoreBucket.find((b) => b.min === 0)!;
    expect(high.winRate).toBe(1); // 2/2
    expect(oc.winRate).toBe(0.5); // 1/2
    expect(ignore.winRate).toBe(0); // 0/1
  });

  it("ranks signals by predictive lift", () => {
    // `manipulationDetected` present on both wins, absent on the loss → +lift.
    const r = buildCalibrationReport([
      sample(80, "win", { manipulationDetected: true }),
      sample(78, "win", { manipulationDetected: true }),
      sample(75, "loss", { manipulationDetected: false }),
    ]);
    const top = r.bySignal[0];
    expect(top.signal).toBe("manipulationDetected");
    expect(top.withWinRate).toBe(1);
    expect(top.withoutWinRate).toBe(0);
    expect(top.liftWinRate).toBe(1);
  });
});
