import type { StrategySignal } from "@ict-forward-lab/strategies";

const MAX_SIGNALS = 100;

/**
 * In-memory bounded signal store using a ring buffer pattern.
 * Stores the most recent 100 signals, evicting oldest when full.
 */
export class SignalStore {
  private signals: StrategySignal[] = [];

  add(signal: StrategySignal): void {
    this.signals.push(signal);
    if (this.signals.length > MAX_SIGNALS) {
      this.signals.shift();
    }
  }

  getRecent(limit: number = 20): StrategySignal[] {
    return this.signals.slice(-limit).reverse();
  }

  getBySymbol(symbol: string, limit: number = 20): StrategySignal[] {
    return this.signals
      .filter((s) => s.symbol === symbol)
      .slice(-limit)
      .reverse();
  }

  getAll(): StrategySignal[] {
    return [...this.signals];
  }

  size(): number {
    return this.signals.length;
  }
}
