# Hermes alert receiver

A minimal, zero-dependency reference for receiving `ict-forward-lab` price-alert
webhooks on the Hermes VPS. When a price alert fires, the API
(`apps/api`) POSTs an `alert:triggered` payload to a URL you configure; this
service is the other end of that push.

## How it fits together

```
Hermes ──POST /api/alerts (x-api-key)──▶  ict-forward-lab API
                                              │  (price crosses target)
                                              ▼
Hermes receiver  ◀──POST /hooks/price-alert──  AlertMonitor webhook
   (this script)     (x-webhook-secret)
```

Hermes still *creates* alerts via the REST API. This receiver only handles the
*notification* when one is touched — so the agent gets a direct push instead of
listening on the WebSocket or polling.

## Run it

```bash
ALERT_WEBHOOK_SECRET=your-long-random-secret PORT=8088 node server.mjs
```

| Env var | Default | Purpose |
| --- | --- | --- |
| `PORT` | `8088` | Port to listen on |
| `ALERT_WEBHOOK_PATH` | `/hooks/price-alert` | Path that accepts the POST |
| `ALERT_WEBHOOK_SECRET` | _(empty)_ | Shared secret; must match the API side |
| `TELEGRAM_BOT_TOKEN` | _(empty)_ | Bot token; set with chat id to message Telegram (see TELEGRAM.md) |
| `TELEGRAM_CHAT_ID` | _(empty)_ | Target chat for Telegram delivery |
| `AGENT_WEBHOOK_URL` | _(empty)_ | If set, forward each fired alert here (e.g. the agent's TradingView inbox) |
| `AGENT_WEBHOOK_SECRET` | _(empty)_ | Optional; sent as `x-webhook-secret` on the agent forward |

> Put TLS in front (Caddy/nginx) so the secret isn't sent in clear, and run it
> under a supervisor (pm2/systemd) so it restarts on crash.

On each fired alert the receiver fans out: logs it, sends the Telegram message
(if configured), and POSTs to `AGENT_WEBHOOK_URL` (if set).

The agent forward is **plain text** (`Content-Type: text/plain`), matching
TradingView plain-text alerts — the price is already resolved, so there are no
`{{placeholder}}` tokens:

```
ICT: Price alert on BTCUSDT @ 70004.5 (crossed above 70000)
```

If your agent's webhook expects a different string (or JSON), adjust
`forwardToAgent()` in `server.mjs`.

## Configure the API side

On the API VPS `.env`:

```
ALERT_WEBHOOK_URL=https://<hermes-host>/hooks/price-alert
ALERT_WEBHOOK_SECRET=your-long-random-secret
```

Then rebuild the api container:

```bash
docker compose --profile app up -d --build api
```

## Payload

The body is identical to the `alert:triggered` WebSocket message:

```json
{
  "event": "alert:triggered",
  "data": {
    "id": 9,
    "symbol": "BTCUSDT",
    "direction": "above",
    "targetPrice": 70000,
    "triggeredPrice": 70004.5,
    "triggeredAt": "2026-06-21T09:30:00.000Z",
    "note": null
  }
}
```

The request carries `x-webhook-secret`; the receiver rejects any POST whose
header doesn't match (constant-time compare). Respond `2xx` to ack — a non-2xx
or timeout makes the API retry (2 retries, ~5s timeout each).

## Run it as a service (systemd)

So it survives reboots/logout and restarts on crash. `alert-receiver.service`
ships in this folder; it reads config from `/etc/alert-receiver.env` so the
secret never lives in git.

```bash
# 1. config + secret (kept out of git, root-only)
printf 'PORT=8088\nALERT_WEBHOOK_SECRET=your-secret\n' | sudo tee /etc/alert-receiver.env
sudo chmod 600 /etc/alert-receiver.env

# 2. install the unit (assumes server.mjs copied to /root/alert-receiver.mjs and
#    node at /root/.local/bin/node — edit the unit's ExecStart if yours differ)
sudo cp alert-receiver.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now alert-receiver
sudo systemctl status alert-receiver --no-pager
```

Logs: `journalctl -u alert-receiver -f`. After editing `handleAlert`, run
`sudo systemctl restart alert-receiver`.

## Make it do something

Edit `handleAlert(alert)` in `server.mjs` — that's the single hand-off point.
Enqueue a task for the agent, call Hermes' internal API, send a DM, etc.

## Smoke test

```bash
# start it
ALERT_WEBHOOK_SECRET=test PORT=8088 node server.mjs &

# simulate the API's POST
curl -s -X POST http://127.0.0.1:8088/hooks/price-alert \
  -H "content-type: application/json" \
  -H "x-webhook-secret: test" \
  -d '{"event":"alert:triggered","data":{"id":1,"symbol":"BTCUSDT","direction":"above","targetPrice":70000,"triggeredPrice":70004.5,"triggeredAt":"2026-06-21T09:30:00.000Z","note":null}}'
# → {"ok":true}, and the receiver logs the alert

# wrong secret → 401
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://127.0.0.1:8088/hooks/price-alert \
  -H "content-type: application/json" -H "x-webhook-secret: nope" -d '{}'
# → 401
```
