export interface PositionSizeParams {
  accountBalance: number;
  riskPercent: number;
  entry: number;
  stopLoss: number;
  /**
   * Optional notional cap as a multiple of account balance. When the risk-based
   * size would imply a notional (`positionSize * entry`) above
   * `accountBalance * maxLeverage`, the size is clamped to the leverage limit —
   * modelling that a real margin account cannot hold an arbitrarily large
   * position just because the stop is tight.
   */
  maxLeverage?: number;
}

export interface PositionSizeResult {
  positionSize: number;
  riskAmount: number;
}

/**
 * Pure function to calculate position size based on risk parameters.
 * Returns zero if entry equals stopLoss (invalid SL distance).
 *
 * `riskAmount` reflects the *actual* size returned: when the leverage cap binds,
 * the realized risk is below the target `riskPercent`, and the returned
 * `riskAmount` is reduced accordingly so downstream R-multiple maths stay honest.
 */
export function calculatePositionSize(params: PositionSizeParams): PositionSizeResult {
  const { accountBalance, riskPercent, entry, stopLoss, maxLeverage } = params;

  const distance = Math.abs(entry - stopLoss);

  if (distance === 0) {
    return { positionSize: 0, riskAmount: 0 };
  }

  const targetRisk = (accountBalance * riskPercent) / 100;
  let positionSize = targetRisk / distance;

  // Clamp to the leverage cap: notional must not exceed balance * maxLeverage.
  if (maxLeverage != null && maxLeverage > 0 && entry > 0) {
    const maxSize = (accountBalance * maxLeverage) / entry;
    if (positionSize > maxSize) positionSize = maxSize;
  }

  // Risk reflects the (possibly clamped) size, not the target.
  const riskAmount = positionSize * distance;

  return { positionSize, riskAmount };
}
