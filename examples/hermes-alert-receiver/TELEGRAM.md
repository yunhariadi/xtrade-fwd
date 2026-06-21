# Forward price alerts to Telegram (Hermes)

Instructions for setting up Telegram delivery on the Hermes VPS. The receiver
(`server.mjs`) already has built-in Telegram support — it activates when both
`TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` are present in the environment.
No code edits needed; just create a bot, get the chat id, add two env lines,
and restart the service.

Prereqs (already done if you followed the main README): the receiver is running
as the `alert-receiver` systemd service, reading config from
`/etc/alert-receiver.env`.

---

## 1. Create a Telegram bot

1. In Telegram, open a chat with **@BotFather**.
2. Send `/newbot`, follow the prompts (name + username ending in `bot`).
3. BotFather replies with a **token** like `8123456789:AAExxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`.
   Keep it secret — it controls the bot.

## 2. Get your chat id

The bot can only message a chat after that chat has messaged the bot.

**For a private (DM) chat:**
1. Open your new bot and send it any message (e.g. `hi`).
2. On the Hermes VPS, fetch updates (replace `<TOKEN>`):
   ```bash
   curl -s "https://api.telegram.org/bot<TOKEN>/getUpdates"
   ```
3. In the JSON, find `"chat":{"id":NNNNNNNNN,...}`. That number is your
   `TELEGRAM_CHAT_ID` (positive for DMs).

**For a group:** add the bot to the group, send a message in it, run the same
`getUpdates`, and use the group `chat.id` (a negative number, e.g. `-1001234567890`).

## 3. Add the credentials to the receiver's env

Edit the service env file (root-owned, kept out of git):

```bash
sudo nano /etc/alert-receiver.env
```

Add these two lines (paste each as one line; replace the placeholders):

```
TELEGRAM_BOT_TOKEN=8123456789:AAExxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TELEGRAM_CHAT_ID=NNNNNNNNN
```

Save (Ctrl+O, Enter, Ctrl+X). The file should now contain `PORT`,
`ALERT_WEBHOOK_SECRET`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`.

## 4. Make sure the code is current and restart

```bash
cd /root/xtrade-fwd && git pull
cp examples/hermes-alert-receiver/server.mjs /root/alert-receiver.mjs
sudo systemctl restart alert-receiver
sudo systemctl status alert-receiver --no-pager
journalctl -u alert-receiver -n 20 --no-pager
```

On startup the log should print `[receiver] Telegram delivery enabled`.

## 5. Test

Send yourself a test message directly (replace `<TOKEN>` and `<CHAT_ID>`):

```bash
curl -s "https://api.telegram.org/bot<TOKEN>/sendMessage" \
  -d chat_id=<CHAT_ID> -d text="receiver test ✅"
```

You should get the message in Telegram. Then trigger a real price alert (create
one near spot on the API VPS, see the main README) — within seconds Telegram
should show:

```
🔺 Price alert
BTCUSDT above 64346
touched @ 64347.2
2026-06-21T11:44:27.793Z
```

## Notes

- The bot token is as sensitive as a password. It lives only in
  `/etc/alert-receiver.env` (chmod 600), never in git.
- Telegram outbound (HTTPS to `api.telegram.org`) needs egress on 443 — already
  allowed by the default `ufw` policy (`allow outgoing`).
- Delivery is best-effort with a 5s timeout; a Telegram outage won't block the
  receiver from ack'ing the API. Failures are logged via `journalctl`.
