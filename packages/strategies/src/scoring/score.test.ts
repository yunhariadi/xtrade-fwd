import { describe, expect, it } from "vitest";
import { scoreSetup } from "./score";

describe("scoreSetup", () => {
  it("scores an empty setup as 0 / ignore", () => {
    const r = scoreSetup({});
    expect(r.total).toBe(0);
    expect(r.recommendation).toBe("ignore");
    expect(r.grade).toBe("D");
  });

  it("clamps the total to 100 even when raw exceeds it", () => {
    const r = scoreSetup({
      weeklyProfileSupports: true, // +10
      sessionProfileSupports: true, // +10
      amdPhaseClear: true, // +10
      manipulationDetected: true, // +15
      irlToErlClear: true, // +15
      mssConfirmed: true, // +15
      displacementPresent: true, // +10
      validFvg: true, // +10
      volumeProfileOpposes: true, // +10 (flipped per calibration)
      clearErlTarget: true, // +10
      rrAboveTwo: true, // +10
    });
    expect(r.raw).toBeGreaterThan(100);
    expect(r.total).toBe(100);
    expect(r.grade).toBe("A+");
    expect(r.recommendation).toBe("send_to_oc_and_ha");
  });

  it("applies penalties and routes a mid setup to OC", () => {
    const r = scoreSetup({
      weeklyProfileSupports: true, // +10
      manipulationDetected: true, // +15
      irlToErlClear: true, // +15
      mssConfirmed: true, // +15
      validFvg: true, // +10
      volumeProfileOpposes: true, // +10 (flipped per calibration)
      clearErlTarget: true, // +10
      lateInSession: true, // -10
    });
    expect(r.raw).toBe(75);
    expect(r.total).toBe(75);
    expect(r.recommendation).toBe("send_to_oc");
    expect(r.breakdown.lateInSession).toBe(-10);
  });

  it("treats calibration-flipped signals with their flipped signs", () => {
    const r = scoreSetup({
      htfBiasAligned: true, // -15 (flipped)
      fvgAlignsVolumeProfile: true, // 0 (retired duplicate; measured, not scored)
      priceWithPocDirection: true, // -5 (flipped)
      volumeProfileOpposes: true, // +10 (flipped)
    });
    expect(r.raw).toBe(-10);
    expect(r.total).toBe(0);
  });

  it("never returns a negative total", () => {
    const r = scoreSetup({ againstWeeklyBias: true, noCleanInvalidation: true });
    expect(r.raw).toBeLessThan(0);
    expect(r.total).toBe(0);
  });
});
