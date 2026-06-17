import { EventEmitter } from "events";
import WebSocket from "ws";

export interface BinanceWsClientOptions {
  url: string; // wss://fstream.binance.com/ws
  streams: string[]; // ["btcusdt@kline_5m", "btcusdt@kline_15m", ...]
  reconnectBaseDelay: number; // 1000ms
  reconnectMaxDelay: number; // 60000ms
}

export interface BinanceKlineEvent {
  e: "kline"; // event type
  E: number; // event time (ms)
  s: string; // symbol (e.g., "BTCUSDT")
  k: {
    t: number; // kline start time (ms)
    T: number; // kline close time (ms)
    s: string; // symbol
    i: string; // interval (e.g., "5m")
    o: string; // open price
    h: string; // high price
    l: string; // low price
    c: string; // close price
    v: string; // base asset volume
    x: boolean; // is this kline closed?
    q: string; // quote asset volume
    n: number; // number of trades
  };
}

export declare interface BinanceWsClient {
  on(event: "kline", listener: (data: BinanceKlineEvent) => void): this;
  on(event: "connected", listener: () => void): this;
  on(
    event: "disconnected",
    listener: (code: number, reason: string) => void,
  ): this;
  on(event: "reconnecting", listener: (attempt: number) => void): this;
  on(event: "error", listener: (error: Error) => void): this;
}

export class BinanceWsClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private reconnectAttempt = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private isClosing = false;

  constructor(private options: BinanceWsClientOptions) {
    super();
  }

  connect(): void {
    this.isClosing = false;

    // Connect to the bare raw-stream endpoint (e.g. wss://fstream.binance.com/ws)
    // and subscribe via the SUBSCRIBE message in the "open" handler below.
    // Appending stream names to the /ws path is non-standard and redundant once
    // we SUBSCRIBE, and a malformed multi-stream path can drop subscriptions.
    this.ws = new WebSocket(this.options.url);

    this.ws.on("open", () => {
      this.reconnectAttempt = 0;

      // Subscribe to streams via SUBSCRIBE method message
      const subscribeMsg = JSON.stringify({
        method: "SUBSCRIBE",
        params: this.options.streams,
        id: Date.now(),
      });
      this.ws?.send(subscribeMsg);

      this.emit("connected");
    });

    this.ws.on("message", (data: WebSocket.Data) => {
      this.handleMessage(data.toString());
    });

    this.ws.on("close", (code: number, reason: Buffer) => {
      this.emit("disconnected", code, reason.toString());

      if (!this.isClosing) {
        this.scheduleReconnect();
      }
    });

    this.ws.on("error", (err: Error) => {
      this.emit("error", err);
    });

    // ws library handles pong responses to ping frames automatically
  }

  disconnect(): void {
    this.isClosing = true;

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

      // Skip subscription confirmation responses
      if (parsed.result !== undefined || parsed.id !== undefined) {
        return;
      }

      // Validate it's a kline event
      if (parsed.e !== "kline" || !parsed.k) {
        return;
      }

      this.emit("kline", parsed as BinanceKlineEvent);
    } catch {
      // Malformed JSON — skip silently
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
