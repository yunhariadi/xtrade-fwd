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

if (!SECRET) {
  console.warn("[receiver] ALERT_WEBHOOK_SECRET is empty — every POST will be accepted. Set it in production.");
}

/** Constant-time string compare that won't throw on length mismatch. */
function secretMatches(provided) {
  if (!SECRET) return true; // no secret configured = open (dev only)
  const a = Buffer.from(String(provided ?? ""));
  const b = Buffer.from(SECRET);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** This is where you hand the alert off to Hermes. Replace with your logic. */
async function handleAlert(alert) {
  // alert = { id, symbol, direction, targetPrice, triggeredPrice, triggeredAt, note }
  console.log(
    `[receiver] ALERT #${alert.id} ${alert.symbol} ${alert.direction} ` +
      `target ${alert.targetPrice} touched @ ${alert.triggeredPrice} (${alert.triggeredAt})` +
      (alert.note ? ` — ${alert.note}` : ""),
  );
  // e.g. enqueue a task for the agent, call Hermes' internal API, send a DM, etc.
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
