#!/usr/bin/env node
// Minimal, zero-dependency receiver for ict-forward-lab price-alert webhooks.
//
// The API (apps/api) POSTs an `alert:triggered` payload here whenever a price
// alert fires. Run this on the Hermes VPS, point ALERT_WEBHOOK_URL at it, and
// share the same ALERT_WEBHOOK_SECRET on both sides.
//
//   ALERT_WEBHOOK_SECRET=your-secret PORT=8088 node server.mjs
//
// Then on the API VPS .env:
//   ALERT_WEBHOOK_URL=https://<hermes-host>/hooks/price-alert
//   ALERT_WEBHOOK_SECRET=your-secret
//
// Put TLS in front of this (Caddy/nginx) so the secret isn't sent in clear.

import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";

const PORT = Number(process.env.PORT ?? 8088);
const PATHNAME = process.env.ALERT_WEBHOOK_PATH ?? "/hooks/price-alert";
const SECRET = process.env.ALERT_WEBHOOK_SECRET ?? "";
const MAX_BODY = 64 * 1024; // alerts are tiny; reject anything suspicious.

// Optional Telegram delivery. Set both to forward alerts to a chat; leave either
// empty to disable (the receiver still logs every alert).
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID ?? "";

// Optional forward to an agent's webhook (e.g. the same endpoint that ingests
// TradingView alerts) so the agent can reason over a touched price level.
const AGENT_WEBHOOK_URL = process.env.AGENT_WEBHOOK_URL ?? "";
const AGENT_WEBHOOK_SECRET = process.env.AGENT_WEBHOOK_SECRET ?? "";

if (!SECRET) {
  console.warn("[receiver] ALERT_WEBHOOK_SECRET is empty — every POST will be accepted. Set it in production.");
}
if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
  console.log("[receiver] Telegram delivery enabled");
}
if (AGENT_WEBHOOK_URL) {
  console.log(`[receiver] Agent forward enabled → ${AGENT_WEBHOOK_URL}`);
}

/** Escape the few characters Telegram HTML parse_mode treats specially. */
function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Send a message to Telegram. No-op if not configured. */
async function sendTelegram(text) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      console.error(`[receiver] Telegram send failed: HTTP ${res.status} ${await res.text()}`);
    }
  } catch (err) {
    console.error(`[receiver] Telegram send error: ${err.message}`);
  } finally {
    clearTimeout(timer);
  }
}

/** Constant-time string compare that won't throw on length mismatch. */
function secretMatches(provided) {
  if (!SECRET) return true; // no secret configured = open (dev only)
  const a = Buffer.from(String(provided ?? ""));
  const b = Buffer.from(SECRET);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Forward the fired alert to an agent's webhook (e.g. Hermes' TradingView inbox). */
async function forwardToAgent(alert) {
  if (!AGENT_WEBHOOK_URL) return;
  const message =
    `Price alert: ${alert.symbol} ${alert.direction} ${alert.targetPrice} ` +
    `touched @ ${alert.triggeredPrice} (${alert.triggeredAt})` +
    (alert.note ? ` — ${alert.note}` : "");
  // Structured fields + a ready-to-read `message`, so the consumer can use either.
  const payload = {
    source: "ict-forward-lab",
    type: "price_alert",
    symbol: alert.symbol,
    direction: alert.direction,
    targetPrice: alert.targetPrice,
    price: alert.triggeredPrice,
    time: alert.triggeredAt,
    note: alert.note,
    message,
  };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(AGENT_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(AGENT_WEBHOOK_SECRET ? { "x-webhook-secret": AGENT_WEBHOOK_SECRET } : {}),
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!res.ok) {
      console.error(`[receiver] agent forward failed: HTTP ${res.status} ${await res.text()}`);
    }
  } catch (err) {
    console.error(`[receiver] agent forward error: ${err.message}`);
  } finally {
    clearTimeout(timer);
  }
}

/** This is where you hand the alert off to Hermes. */
async function handleAlert(alert) {
  // alert = { id, symbol, direction, targetPrice, triggeredPrice, triggeredAt, note }
  console.log(
    `[receiver] ALERT #${alert.id} ${alert.symbol} ${alert.direction} ` +
      `target ${alert.targetPrice} touched @ ${alert.triggeredPrice} (${alert.triggeredAt})` +
      (alert.note ? ` — ${alert.note}` : ""),
  );

  const arrow = alert.direction === "below" ? "🔻" : alert.direction === "above" ? "🔺" : "🔔";
  const text =
    `${arrow} <b>Price alert</b>\n` +
    `<b>${escapeHtml(alert.symbol)}</b> ${escapeHtml(alert.direction)} ` +
    `<code>${escapeHtml(alert.targetPrice)}</code>\n` +
    `touched @ <code>${escapeHtml(alert.triggeredPrice)}</code>\n` +
    `<i>${escapeHtml(alert.triggeredAt)}</i>` +
    (alert.note ? `\n📝 ${escapeHtml(alert.note)}` : "");

  // Fan out: Telegram message + agent webhook. allSettled so one failing path
  // never blocks the other; both are best-effort with their own timeouts.
  await Promise.allSettled([sendTelegram(text), forwardToAgent(alert)]);
}

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // Liveness probe.
  if (req.method === "GET" && url.pathname === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (req.method !== "POST" || url.pathname !== PATHNAME) {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "not_found" }));
    return;
  }

  if (!secretMatches(req.headers["x-webhook-secret"])) {
    res.writeHead(401, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "unauthorized" }));
    return;
  }

  let raw = "";
  let aborted = false;
  req.on("data", (chunk) => {
    raw += chunk;
    if (raw.length > MAX_BODY) {
      aborted = true;
      res.writeHead(413, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "payload_too_large" }));
      req.destroy();
    }
  });

  req.on("end", () => {
    if (aborted) return;
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "bad_json" }));
      return;
    }

    if (msg?.event !== "alert:triggered" || !msg?.data) {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "unexpected_event" }));
      return;
    }

    // Ack immediately so the API's timeout/retry never trips, then process.
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));

    Promise.resolve(handleAlert(msg.data)).catch((err) =>
      console.error(`[receiver] handleAlert failed for #${msg.data?.id}: ${err.message}`),
    );
  });
});

server.listen(PORT, () => {
  console.log(`[receiver] listening on :${PORT}, POST ${PATHNAME}`);
});
