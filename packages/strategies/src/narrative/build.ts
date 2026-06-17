import type { Narrative, NarrativeInput } from "./types";

/**
 * Compress engine outputs into a short, high-signal narrative for an LLM agent.
 *
 * This is the "compact packet" idea from the data-brain design: agents should
 * read a few sentences of structured context, not raw candles. Deterministic —
 * the same inputs always yield the same text.
 */
export function buildNarrative(input: NarrativeInput): Narrative {
  const { weekly, session, amd, draw, volumeProfile } = input;

  const sentences: string[] = [];

  if (weekly) {
    sentences.push(
      `Weekly bias ${weekly.weeklyBias}, price ${weekly.priceVsWeekOpen} weekly open in the ${weekly.rangePosition.replace("_", " ")} (${weekly.likelyProfile.replace(/_/g, " ")}).`
    );
  }
  if (session) {
    sentences.push(`${session.label}.`);
    if (session.sweptLiquidity) {
      sentences.push(
        `${session.sweptLiquidity.replace(/_/g, " ")} was swept; active draw is ${session.activeDraw?.replace(/_/g, " ") ?? "unclear"}.`
      );
    }
  } else if (amd) {
    sentences.push(`Current phase reads as ${amd.phase}${amd.manipulatedSide ? ` after a ${amd.manipulatedSide.replace("_", "-")} sweep` : ""}.`);
  }
  if (draw && draw.currentDraw !== "unclear" && draw.from && draw.to) {
    sentences.push(
      `Draw is ${draw.currentDraw.replace(/_/g, " ")}: from ${draw.from.label} toward ${draw.to.label} (${draw.status.replace(/_/g, " ")}).`
    );
  }
  if (volumeProfile) {
    sentences.push(
      `Volume profile is ${volumeProfile.bias.replace("_", " ")} with price ${volumeProfile.priceLocation.replace(/_/g, " ")} (POC ${round(volumeProfile.poc)}).`
    );
  }

  const short = sentences.length > 0 ? sentences.join(" ") : "Insufficient context for a narrative.";

  return {
    short,
    tradeIdea: buildTradeIdea(input),
    invalidIf: buildInvalidIf(input),
    avoidIf: buildAvoidIf(input),
    agentTask:
      "Validate whether this is a clean ICT 2022 setup in the permitted direction, or whether to wait for a deeper retracement.",
  };
}

function buildTradeIdea(input: NarrativeInput): string {
  const { weekly, draw } = input;
  if (weekly) {
    const { longAllowed, shortAllowed } = weekly.permission;
    if (longAllowed && !shortAllowed) {
      const irl = draw?.from?.category === "IRL" ? ` from ${draw.from.label}` : "";
      return `Prefer longs${irl} while weekly bias stays bullish.`;
    }
    if (shortAllowed && !longAllowed) {
      const irl = draw?.from?.category === "IRL" ? ` from ${draw.from.label}` : "";
      return `Prefer shorts${irl} while weekly bias stays bearish.`;
    }
  }
  return "No directional edge; stand aside until bias resolves.";
}

function buildInvalidIf(input: NarrativeInput): string {
  const { amd, weekly } = input;
  if (amd?.sweptLevel != null) {
    return `Price accepts beyond the swept level at ${round(amd.sweptLevel)}.`;
  }
  if (weekly) {
    return weekly.weeklyBias === "bullish"
      ? `Price breaks and accepts below weekly open at ${round(weekly.weekOpen)}.`
      : weekly.weeklyBias === "bearish"
        ? `Price breaks and accepts above weekly open at ${round(weekly.weekOpen)}.`
        : "Bias flips against the intended direction.";
  }
  return "Structure breaks against the intended direction.";
}

function buildAvoidIf(input: NarrativeInput): string {
  const { draw } = input;
  if (draw?.currentDraw === "IRL_to_ERL" && draw.to) {
    return `Price reaches ${draw.to.label} before retracing into the entry zone.`;
  }
  return "The setup has already reached its external target.";
}

function round(x: number): number {
  return Math.round(x * 100) / 100;
}
