import { EventEmitter } from "events";
import WebSocket from "ws";

export interface BybitWsClientOptions {
  url: string; // wss://stream.bybit.com/v5/public/linear
  topics: string[]; // ["kline.5.BTCUSDT", "kline.15.BTCUSDT", ...]
  reconnectBaseDelay: number; // 1000ms
  reconnectMaxDelay: number; // 60000ms
}

/** One entry in a Bybit kline push (`data` is an array of these). */
export interface BybitKlineData {
  start: number; // bucket open time (ms)
  end: number; // bucket close time (ms)
  interval: string; // "1" | "5" | "60" | "240" | ...
  open: string;
  close: string;
  high: string;
  low: string;
  volume: string;
  turnover: string;
  confirm: boolean; // true once the candle has closed
  timestamp: number;
}

export interface BybitKlineMessage {
  topic: string; // "kline.5.BTCUSDT"
  type: string; // "snapshot"
  ts: number;
  data: BybitKlineData[];
}

/** One entry in a Bybit publicTrade push (`data` is an array of these). */
export interface BybitTradeData {
  T: number; // trade time (ms)
  s: string; // symbol, e.g. "BTCUSDT"
  S: "Buy" | "Sell"; // taker side
  v: string; // trade size (base asset)
  p: string; // trade price
  i: string; // trade id
  BT?: boolean; // block trade
}

export interface BybitTradeMessage {
  topic: string; // "publicTrade.BTCUSDT"
  type: string; // "snapshot"
  ts: number;
  data: BybitTradeData[];
}

export declare interface BybitWsClient {
  on(event: "kline", listener: (msg: BybitKlineMessage) => void): this;
  on(event: "trade", listener: (msg: BybitTradeMessage) => void): this;
  on(event: "connected", listener: () => void): this;
  on(event: "disconnected", listener: (code: number, reason: string) => void): this;
  on(event: "reconnecting", listener: (attempt: number) => void): this;
  on(event: "error", listener: (error: Error) => void): this;
}

/**
 * Bybit v5 public WebSocket client. Same event surface as BinanceWsClient
 * (kline/connected/disconnected/reconnecting/error) so MarketDataService can
 * treat either source uniformly. Bybit needs an app-level `{"op":"ping"}`
 * heartbeat or it drops the connection, so we send one every 20s.
 */
export class BybitWsClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private reconnectAttempt = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private pingTimer: NodeJS.Timeout | null = null;
  private isClosing = false;

  constructor(private options: BybitWsClientOptions) {
    super();
  }

  connect(): void {
    this.isClosing = false;
    this.ws = new WebSocket(this.options.url);

    this.ws.on("open", () => {
      this.reconnectAttempt = 0;

      // Subscribe to all kline topics in one frame.
      this.ws?.send(
        JSON.stringify({ op: "subscribe", args: this.options.topics }),
      );

      this.startHeartbeat();
      this.emit("connected");
    });

    this.ws.on("message", (data: WebSocket.Data) => {
      this.handleMessage(data.toString());
    });

    this.ws.on("close", (code: number, reason: Buffer) => {
      this.stopHeartbeat();
      this.emit("disconnected", code, reason.toString());
      if (!this.isClosing) this.scheduleReconnect();
    });

    this.ws.on("error", (err: Error) => {
      this.emit("error", err);
    });
  }

  disconnect(): void {
    this.isClosing = true;
    this.stopHeartbeat();

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.close(1000, "intentional disconnect");
      this.ws = null;
    }
  }

  private handleMessage(raw: string): void {
    try {
      const parsed = JSON.parse(raw);

      // Only forward kline/trade pushes; skip subscribe acks, pong replies, etc.
      if (typeof parsed.topic === "string" && Array.isArray(parsed.data)) {
        if (parsed.topic.startsWith("kline.")) {
          this.emit("kline", parsed as BybitKlineMessage);
        } else if (parsed.topic.startsWith("publicTrade.")) {
          this.emit("trade", parsed as BybitTradeMessage);
        }
      }
    } catch {
      // Malformed JSON — skip silently
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.pingTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ op: "ping" }));
      }
    }, 20000);
  }

  private stopHeartbeat(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private scheduleReconnect(): void {
    const delay = this.getReconnectDelay(this.reconnectAttempt);
    this.reconnectAttempt++;
    this.emit("reconnecting", this.reconnectAttempt);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  getReconnectDelay(attempt: number): number {
    return Math.min(
      this.options.reconnectBaseDelay * Math.pow(2, attempt),
      this.options.reconnectMaxDelay,
    );
  }
}
