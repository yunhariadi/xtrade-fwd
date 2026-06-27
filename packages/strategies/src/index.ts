import type { Candle } from "@ict-forward-lab/core";

/**
 * Interface for strategy modules.
 * Strategies will implement this interface in future phases.
 */
export interface StrategyModule {
  name: string;
  version: string;
  run: (candles: Candle[]) => void;
}

export * from "./fvg";
export * from "./ict-model-2022";
export * from "./utils";
export * from "./bias";
export * from "./liquidity";
export * from "./mss-choch";
export * from "./entry";
export * from "./order-blocks";
export * from "./sessions";
export * from "./mtf";
export * from "./volume-profile";
export * from "./amd";
export * from "./irl-erl";
export * from "./weekly-profile";
export * from "./session-profile";
export * from "./narrative";
export * from "./scoring";
export * from "./decision-packet";
export * from "./outcome";

