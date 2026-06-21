import type { FastifyBaseLogger } from "fastify";
import type { WsAlertTriggeredMessage } from "@ict-forward-lab/core";

export interface AlertWebhookConfig {
  /** Absolute URL on the consumer (e.g. Hermes) to POST fired alerts to. */
  url: string;
  /** Optional shared secret, sent as `x-webhook-secret` so the receiver can verify. */
  secret?: string;
  /** Per-attempt timeout in ms. Defaults to 5000. */
  timeoutMs?: number;
  /** Retries after the first attempt. Defaults to 2 (3 attempts total). */
  retries?: number;
}

/**
 * Deliver a fired alert to an external HTTP endpoint (cross-VPS push).
 *
 * Fire-and-forget by design: the caller does not await this, so a slow or down
 * receiver never stalls price evaluation. Each attempt is bounded by a timeout
 * and failures are retried with linear backoff; the body is identical to the
 * `alert:triggered` WebSocket message so receivers can share one parser.
 */
export async function postAlertWebhook(
  config: AlertWebhookConfig,
  message: WsAlertTriggeredMessage,
  logger?: FastifyBaseLogger,
): Promise<void> {
  const timeoutMs = config.timeoutMs ?? 5000;
  const maxAttempts = (config.retries ?? 2) + 1;
  const body = JSON.stringify(message);
  const id = message.data.id;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(config.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(config.secret ? { "x-webhook-secret": config.secret } : {}),
        },
        body,
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (res.ok) {
        logger?.info(`[alert-webhook] delivered alert #${id} (HTTP ${res.status})`);
        return;
      }
      logger?.warn(
        `[alert-webhook] alert #${id} attempt ${attempt}/${maxAttempts}: HTTP ${res.status}`,
      );
    } catch (err) {
      clearTimeout(timer);
      logger?.warn(
        `[alert-webhook] alert #${id} attempt ${attempt}/${maxAttempts} failed: ${(err as Error).message}`,
      );
    }
    if (attempt < maxAttempts) {
      await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }
  logger?.error(`[alert-webhook] gave up delivering alert #${id} after ${maxAttempts} attempts`);
}
