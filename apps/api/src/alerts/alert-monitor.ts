import type { WsAlertTriggeredMessage, WsAlertExpiredMessage } from "@ict-forward-lab/core";
import type { FastifyBaseLogger } from "fastify";
import type { WsServer } from "../market-data/ws-server";
import type { AlertStore } from "./alert-store";
import type { PriceAlert } from "./types";
import { postAlertWebhook, type AlertWebhookConfig } from "./alert-webhook";

interface AlertMonitorOptions {
  store: AlertStore;
  wsServer: WsServer;
  /** When set, fired alerts are also POSTed to this endpoint (e.g. Hermes). */
  webhook?: AlertWebhookConfig;
  logger?: FastifyBaseLogger;
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
  private webhook?: AlertWebhookConfig;
  private logger?: FastifyBaseLogger;
  /** Active alerts, keyed by id. The durable copy lives in Postgres. */
  private active = new Map<number, PriceAlert>();
  /** Last seen price per symbol (uppercased), to detect crossings. */
  private lastPrice = new Map<string, number>();
  /**
   * Last *outer* side (below/above the band) seen per zone-cross alert id. A
   * full traversal — one outer side, optionally through the band, to the other
   * outer side — is what fires a `cross`. Ticks landing inside the band don't
   * change the recorded side, so a cross spread over many small ticks still
   * fires once price reaches the far edge.
   */
  private zoneSide = new Map<number, "below" | "above">();

  constructor(options: AlertMonitorOptions) {
    this.store = options.store;
    this.wsServer = options.wsServer;
    this.webhook = options.webhook;
    this.logger = options.logger;
  }

  /** Load active alerts from the store into the in-memory cache. */
  async reload(): Promise<void> {
    const alerts = await this.store.listActive();
    this.active = new Map(alerts.map((a) => [a.id, a]));
    // Drop traversal state for alerts that are no longer active.
    for (const id of this.zoneSide.keys()) {
      if (!this.active.has(id)) this.zoneSide.delete(id);
    }
  }

  /**
   * Feed a price observation. Detects crossings for every active alert on this
   * symbol and fires the ones that crossed. Safe to call on every tick.
   */
  async onPrice(symbol: string, price: number): Promise<void> {
    if (!Number.isFinite(price)) return;
    const sym = symbol.toUpperCase();
    // `prev` may be undefined on the first tick. Level/touch alerts need a prior
    // reference (handled in didFire); zone-cross alerts seed their side state on
    // the first observation, so the loop still runs.
    const prev = this.lastPrice.get(sym);
    this.lastPrice.set(sym, price);

    for (const alert of this.active.values()) {
      if (alert.symbol !== sym) continue;
      if (!this.didFire(alert, prev, price)) continue;

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
          kind: alert.kind,
          targetKind: alert.targetKind,
          trigger: alert.trigger ?? undefined,
          priceLow: alert.priceLow,
          priceHigh: alert.priceHigh,
          indicatorKind: alert.indicatorKind,
          indicatorId: alert.indicatorId,
          indicatorDirection: alert.indicatorDirection,
          timeframe: alert.timeframe,
        },
      };
      this.wsServer.broadcastAlert(message);

      // Cross-VPS push to an external consumer (e.g. Hermes). Fire-and-forget:
      // never await, so a slow/down receiver can't stall price evaluation.
      if (this.webhook) {
        void postAlertWebhook(this.webhook, message, this.logger);
      }
    }
  }

  /**
   * Auto-expire active FVG-zone alerts whose source zone was just mitigated.
   * The zone no longer exists, so the alert is disabled (kept for history) and
   * an `alert:expired` event is broadcast so the UI can drop it.
   */
  async expireFvgZones(symbol: string, timeframe: string, zoneIds: string[]): Promise<void> {
    if (zoneIds.length === 0) return;
    const sym = symbol.toUpperCase();
    const ids = new Set(zoneIds);

    for (const alert of this.active.values()) {
      if (alert.kind !== "indicator" || alert.indicatorKind !== "fvg") continue;
      if (alert.symbol !== sym || alert.timeframe !== timeframe) continue;
      if (alert.indicatorId === null || !ids.has(alert.indicatorId)) continue;

      this.active.delete(alert.id);
      this.zoneSide.delete(alert.id);
      await this.store.update(alert.id, { status: "disabled" });

      const message: WsAlertExpiredMessage = {
        event: "alert:expired",
        data: {
          id: alert.id,
          symbol: alert.symbol,
          reason: "fvg-mitigated",
          indicatorKind: alert.indicatorKind,
          indicatorId: alert.indicatorId,
        },
      };
      this.wsServer.broadcastAlertExpired(message);
    }
  }

  /** Dispatch: zone alerts use band logic; level/price alerts use level crossing. */
  private didFire(alert: PriceAlert, prev: number | undefined, price: number): boolean {
    if (alert.targetKind === "zone") {
      if (alert.priceLow === null || alert.priceHigh === null) return false;
      // Cross is prev-free (it tracks its own side state) so it can seed on tick 1.
      if (alert.trigger === "cross") {
        return this.crossedBand(alert.id, price, alert.priceLow, alert.priceHigh);
      }
      if (prev === undefined) return false;
      return touchedBand(prev, price, alert.priceLow, alert.priceHigh);
    }
    if (prev === undefined) return false;
    return crossedLevel(alert, prev, price);
  }

  /**
   * Cross: price passes fully through the band, exiting the far edge. Tracks the
   * last outer side per alert so a traversal spread over several ticks (with ticks
   * landing inside the band) still fires once price reaches the opposite side.
   */
  private crossedBand(id: number, price: number, low: number, high: number): boolean {
    const side = price < low ? "below" : price > high ? "above" : "inside";
    if (side === "inside") return false; // mid-band: wait for the far edge
    const prevSide = this.zoneSide.get(id);
    this.zoneSide.set(id, side);
    return prevSide !== undefined && prevSide !== side;
  }
}

/** True when price transitioned through the alert's level in its direction. */
function crossedLevel(alert: PriceAlert, prev: number, price: number): boolean {
  const t = alert.targetPrice;
  if (t === null) return false;
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

/**
 * Touch: price enters the band [low, high] from outside. Fires when the segment
 * [prev, price] reaches the band while prev sat outside it — covers both a tick
 * landing inside and a tick that jumped clean across.
 */
function touchedBand(prev: number, price: number, low: number, high: number): boolean {
  const prevInside = prev >= low && prev <= high;
  if (prevInside) return false;
  const segLow = Math.min(prev, price);
  const segHigh = Math.max(prev, price);
  return segHigh >= low && segLow <= high;
}
