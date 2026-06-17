import type { Candle, FvgZone } from "@ict-forward-lab/core";
import type { AmdResult } from "../amd";
import type { BiasDirection } from "../ict-model-2022/types";
import type { IrlErlResult, LiquidityTarget } from "../irl-erl";
import type { Narrative } from "../narrative";
import type { ScoreResult } from "../scoring";
import type { SessionProfileResult } from "../session-profile";
import type { VolumeProfile } from "../volume-profile";
import type { WeeklyProfileResult } from "../weekly-profile";

export interface DecisionPacketInput {
  symbol: string;
  candles5m: Candle[];
  candles15m: Candle[];
  candles1h: Candle[];
  candles4h: Candle[];
  /** Active FVG zones from the live tracker; used as IRL targets. */
  fvgZones?: FvgZone[];
  /** Override "now" (Unix seconds). Defaults to the latest 5m candle time. */
  now?: number;
}

/** Layered, multi-source bias with a single resolved direction. */
export interface LayeredBias {
  weekly: BiasDirection;
  daily: BiasDirection;
  fourH: BiasDirection;
  structure15m: BiasDirection;
  session: BiasDirection;
  volumeProfile: BiasDirection;
  /** Resolved tradeable direction. */
  final: "long" | "short" | "none";
  /** 0..1 — fraction of layers agreeing with `final`. */
  confidence: number;
}

export interface PacketRisk {
  direction: "long" | "short" | "none";
  entryZone: string | null;
  preferredEntry: number | null;
  invalidation: number | null;
  target1: number | null;
  target2: number | null;
  rrToTarget1: number | null;
}

export interface DecisionPacket {
  symbol: string;
  /** Unix seconds. */
  timestamp: number;
  /** Whether `timestamp` falls inside an ICT killzone. */
  inKillzone: boolean;
  session: {
    name: string | null;
    profile: SessionProfileResult | null;
  };
  weeklyProfile: WeeklyProfileResult | null;
  bias: LayeredBias;
  amd: AmdResult;
  irlErl: IrlErlResult;
  structure: {
    last15m: { type: string; direction: string; breakLevel: number; time: number } | null;
  };
  liquidity: {
    targets: LiquidityTarget[];
  };
  fvg: FvgZone | null;
  volumeProfile: {
    session: VolumeProfile | null;
    daily: VolumeProfile | null;
  };
  risk: PacketRisk;
  narrative: Narrative;
  score: ScoreResult;
}
