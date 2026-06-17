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
      htfBiasAligned: true,
      weeklyProfileSupports: true,
      sessionProfileSupports: true,
      amdPhaseClear: true,
      manipulationDetected: true,
      irlToErlClear: true,
      mssConfirmed: true,
      displacementPresent: true,
      validFvg: true,
      fvgAlignsVolumeProfile: true,
      priceWithPocDirection: true,
      clearErlTarget: true,
      rrAboveTwo: true,
    });
    expect(r.raw).toBeGreaterThan(100);
    expect(r.total).toBe(100);
    expect(r.grade).toBe("A+");
    expect(r.recommendation).toBe("send_to_oc_and_ha");
  });

  it("applies penalties and routes a mid setup to OC", () => {
    const r = scoreSetup({
      htfBiasAligned: true, // +15
      weeklyProfileSupports: true, // +10
      manipulationDetected: true, // +15
      irlToErlClear: true, // +15
      mssConfirmed: true, // +15
      validFvg: true, // +10
      clearErlTarget: true, // +10
      lateInSession: true, // -10
    });
    expect(r.raw).toBe(80);
    expect(r.total).toBe(80);
    expect(r.recommendation).toBe("send_to_oc_and_ha");
    expect(r.breakdown.lateInSession).toBe(-10);
  });

  it("never returns a negative total", () => {
    const r = scoreSetup({ againstWeeklyBias: true, noCleanInvalidation: true });
    expect(r.raw).toBeLessThan(0);
    expect(r.total).toBe(0);
  });
});
