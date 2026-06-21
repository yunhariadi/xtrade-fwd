import type { WsAlertTriggeredMessage } from "@ict-forward-lab/core";
import type { WsServer } from "../market-data/ws-server";
import type { AlertStore } from "./alert-store";
import type { PriceAlert } from "./types";

interface AlertMonitorOptions {
  store: AlertStore;
  wsServer: WsServer;
}

/**
 * Evaluates active price alerts against the live price on every tick.
 *
 * A crossing is detected by comparing the previous price to the current price
 * against the alert's target — so an alert fires on the *transition* through
 * the level, not merely while price sits beyond it. One-shot alerts are
 * removed from the active cache (and marked `triggered` in Postgres) the moment
 * they fire; `repeat` alerts stay armed and re-fire on the next crossing.
 */
export class AlertMonitor {
  private store: AlertStore;
  private wsServer: WsServer;
  /** Active alerts, keyed by id. The durable copy lives in Postgres. */
  private active = new Map<number, PriceAlert>();
  /** Last seen price per symbol (uppercased), to detect crossings. */
  private lastPrice = new Map<string, number>();

  constructor(options: AlertMonitorOptions) {
    this.store = options.store;
    this.wsServer = options.wsServer;
  }

  /** Load active alerts from the store into the in-memory cache. */
  async reload(): Promise<void> {
    const alerts = await this.store.listActive();
    this.active = new Map(alerts.map((a) => [a.id, a]));
  }

  /**
   * Feed a price observation. Detects crossings for every active alert on this
   * symbol and fires the ones that crossed. Safe to call on every tick.
   */
  async onPrice(symbol: string, price: number): Promise<void> {
    if (!Number.isFinite(price)) return;
    const sym = symbol.toUpperCase();
    const prev = this.lastPrice.get(sym);
    this.lastPrice.set(sym, price);

    // Need a previous reference to define a crossing.
    if (prev === undefined) return;

    for (const alert of this.active.values()) {
      if (alert.symbol !== sym) continue;
      if (!crossed(alert, prev, price)) continue;

      if (alert.repeat) {
        await this.store.recordRepeat(alert.id, price);
      } else {
        // Remove from the cache synchronously so a burst of ticks can't
        // double-fire a one-shot before the DB write resolves.
        this.active.delete(alert.id);
        await this.store.markTriggered(alert.id, price);
      }

      const message: WsAlertTriggeredMessage = {
        event: "alert:triggered",
        data: {
          id: alert.id,
          symbol: alert.symbol,
          direction: alert.direction,
          targetPrice: alert.targetPrice,
          triggeredPrice: price,
          triggeredAt: new Date().toISOString(),
          note: alert.note,
        },
      };
      this.wsServer.broadcastAlert(message);
    }
  }
}

/** True when price transitioned through the alert's target in its direction. */
function crossed(alert: PriceAlert, prev: number, price: number): boolean {
  const t = alert.targetPrice;
  const up = prev < t && price >= t;
  const down = prev > t && price <= t;
  switch (alert.direction) {
    case "above":
      return up;
    case "below":
      return down;
    case "cross":
      return up || down;
    default:
      return false;
  }
}
