import type { AmdResult } from "../amd";
import type { IrlErlResult } from "../irl-erl";
import type { SessionProfileResult } from "../session-profile";
import type { VolumeProfile } from "../volume-profile";
import type { WeeklyProfileResult } from "../weekly-profile";

/**
 * Engine outputs the narrative engine compresses into text. Every field is
 * optional — the narrative degrades gracefully when an engine has no read.
 */
export interface NarrativeInput {
  weekly?: WeeklyProfileResult | null;
  session?: SessionProfileResult | null;
  amd?: AmdResult | null;
  draw?: IrlErlResult | null;
  volumeProfile?: VolumeProfile | null;
}

export interface Narrative {
  /** One-paragraph market story. */
  short: string;
  /** Preferred action, if a direction is permitted. */
  tradeIdea: string;
  /** What would invalidate the read. */
  invalidIf: string;
  /** Conditions under which to stand aside. */
  avoidIf: string;
  /** Fixed instruction handed to the validating agent. */
  agentTask: string;
}
