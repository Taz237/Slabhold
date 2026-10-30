import { createHash } from "node:crypto";
import { encodePayload, trimmedForRetry, type PushPayload } from "./payload";
import type { PushServerConfig } from "./config";

export type PushSubscriptionRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

export type WebPushOptions = {
  TTL: number;
  urgency: "very-low" | "low" | "normal" | "high";
  topic?: string;
  vapidDetails: { subject: string; publicKey: string; privateKey: string };
};

/** The slice of the `web-push` module we use, so tests can pass a fake. */
export type WebPushSender = {
  sendNotification(
    subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
    payload: string,
    options: WebPushOptions,
  ): Promise<{ statusCode: number }>;
};

export const SOCIAL_TTL_SECONDS = 24 * 60 * 60;
export const DM_TTL_SECONDS = 4 * 24 * 60 * 60;
const RETRY_BASE_MS = 800;
const RETRY_MAX_MS = 5000;

export type DeliveryResult = {
  delivered: string[];
  /** 404 or 410: the browser dropped this subscription. Delete it. */
  gone: string[];
  failed: string[];
};

function statusOf(error: unknown): number | null {
  const code = (error as { statusCode?: unknown } | null)?.statusCode;
  return typeof code === "number" ? code : null;
}

function retryAfterMs(error: unknown): number {
  const headers = (error as { headers?: Record<string, string | undefined> } | null)?.headers;
  const seconds = Number(headers?.["retry-after"]);
  if (Number.isFinite(seconds) && seconds > 0) return Math.min(seconds * 1000, RETRY_MAX_MS);
  return RETRY_BASE_MS;
}

/**
 * Web Push Topic: the push service keeps only the newest undelivered message
 * per topic, so a phone that was offline wakes to one push per group.
 * At most 32 base64url characters.
 */
export function pushTopic(tag: string): string {
  return createHash("sha256").update(tag).digest("base64url").slice(0, 32);
}

export function sendOptions(payload: PushPayload, config: PushServerConfig): WebPushOptions {
  const dm = payload.kind === "dm";
  return {
    TTL: dm ? DM_TTL_SECONDS : SOCIAL_TTL_SECONDS,
    urgency: dm ? "high" : "normal",
    topic: pushTopic(payload.tag),
    vapidDetails: {
      subject: config.subject,
      publicKey: config.publicKey,
      privateKey: config.privateKey,
    },
  };
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Send one payload to each subscription. 404/410 mark it gone, 413 resends a
 * shorter body once, and 429/5xx (or a network error) retry once after a
 * pause before counting as failed. Nothing here logs endpoints or text.
 */
export async function deliver(input: {
  sender: WebPushSender;
  config: PushServerConfig;
  subscriptions: readonly PushSubscriptionRow[];
  payload: PushPayload;
  sleep?: (ms: number) => Promise<void>;
}): Promise<DeliveryResult> {
  const sleep = input.sleep ?? defaultSleep;
  const result: DeliveryResult = { delivered: [], gone: [], failed: [] };
  const options = sendOptions(input.payload, input.config);

  await Promise.all(
    input.subscriptions.map(async (sub) => {
      const target = { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } };
      let payload = input.payload;
      let retried = false;
      let trimmed = false;
      for (;;) {
        try {
          await input.sender.sendNotification(target, encodePayload(payload), options);
          result.delivered.push(sub.id);
          return;
        } catch (error) {
          const status = statusOf(error);
          if (status === 404 || status === 410) {
            result.gone.push(sub.id);
            return;
          }
          if (status === 413 && !trimmed) {
            trimmed = true;
            payload = trimmedForRetry(payload);
            continue;
          }
          const retryable = status === null || status === 429 || status >= 500;
          if (retryable && !retried) {
            retried = true;
            await sleep(retryAfterMs(error));
            continue;
          }
          result.failed.push(sub.id);
          return;
        }
      }
    }),
  );
  return result;
}
