import type { Candle, FvgZone, WsFvgMessage } from "@ict-forward-lab/core";
import {
  createBullishFvgZone,
  createBearishFvgZone,
  detectAllFvgs,
  checkMitigation,
  checkTouched,
} from "@ict-forward-lab/strategies";

import type { WsServer } from "../market-data/ws-server";

export interface FvgTrackerOptions {
  wsServer: WsServer;
}

export class FvgTracker {
  private zones: Map<string, FvgZone[]> = new Map();
  private candleBuffers: Map<string, Candle[]> = new Map();

  constructor(private options: FvgTrackerOptions) {}

  /**
   * Feed a closed candle. Detects new zones and updates mitigation/touch state,
   * broadcasting the changes. Returns the ids of zones mitigated by this candle
   * so callers can react (e.g. auto-expire alerts bound to a dead zone).
   */
  onCandleClosed(candle: Candle, symbol: string, timeframe: string): string[] {
    if (!candle.isClosed) return [];
    const mitigatedIds: string[] = [];

    const key = `${symbol}:${timeframe}`;

    // Maintain candle buffer (last 3)
    let buffer = this.candleBuffers.get(key) || [];
    buffer.push(candle);
    if (buffer.length > 3) buffer = buffer.slice(-3);
    this.candleBuffers.set(key, buffer);

    // Detect new FVGs (need 3 candles)
    if (buffer.length >= 3) {
      const i = buffer.length - 1;

      const bullish = createBullishFvgZone(buffer, i);
      if (bullish) {
        this.addZone(key, bullish, symbol, timeframe);
      }

      const bearish = createBearishFvgZone(buffer, i);
      if (bearish) {
        this.addZone(key, bearish, symbol, timeframe);
      }
    }

    // Check mitigation / touch on all active zones
    const zones = this.zones.get(key) || [];
    for (const zone of zones) {
      if (zone.status !== "active") continue;

      if (checkMitigation(zone, candle)) {
        zone.status = "mitigated";
        zone.mitigatedAt = candle.time;
        mitigatedIds.push(zone.id);
        const msg: WsFvgMessage = {
          event: "fvg:mitigated",
          data: { symbol, timeframe, zoneId: zone.id, status: "mitigated" },
        };
        this.options.wsServer.broadcastFvg(msg);
      } else if (!zone.touched && checkTouched(zone, candle)) {
        zone.touched = true;
        zone.touchedAt = candle.time;
        const msg: WsFvgMessage = {
          event: "fvg:touched",
          data: { symbol, timeframe, zoneId: zone.id },
        };
        this.options.wsServer.broadcastFvg(msg);
      }
    }

    return mitigatedIds;
  }


  loadHistory(candles: Candle[], symbol: string, timeframe: string): void {
    const key = `${symbol}:${timeframe}`;
    const detected = detectAllFvgs(candles);

    // Process mitigation sequentially
    for (const zone of detected) {
      // Find candles after the zone was created
      const zoneEndIndex = candles.findIndex((c) => c.time > zone.toTime);
      if (zoneEndIndex === -1) continue;

      for (let j = zoneEndIndex; j < candles.length; j++) {
        if (zone.status !== "active") break;
        if (checkMitigation(zone, candles[j])) {
          zone.status = "mitigated";
          zone.mitigatedAt = candles[j].time;
          break;
        }
        if (!zone.touched && checkTouched(zone, candles[j])) {
          zone.touched = true;
          zone.touchedAt = candles[j].time;
        }
      }

    }

    this.zones.set(key, detected);

    // Set candle buffer to last 3 candles
    if (candles.length >= 3) {
      this.candleBuffers.set(key, candles.slice(-3));
    }
  }

  getZones(symbol: string, timeframe: string): FvgZone[] {
    return this.zones.get(`${symbol}:${timeframe}`) || [];
  }

  getActiveZones(symbol: string, timeframe: string): FvgZone[] {
    return this.getZones(symbol, timeframe).filter(
      (z) => z.status === "active",
    );
  }

  private addZone(
    key: string,
    zone: FvgZone,
    symbol: string,
    timeframe: string,
  ): void {
    const zones = this.zones.get(key) || [];
    zones.push(zone);
    this.zones.set(key, zones);

    const msg: WsFvgMessage = {
      event: "fvg:created",
      data: { symbol, timeframe, zone },
    };
    this.options.wsServer.broadcastFvg(msg);
  }
}
