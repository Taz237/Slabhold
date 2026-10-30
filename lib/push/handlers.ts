import { parseEndpointBody, parseSubscriptionBody } from "./endpoint";
import { consumeFlushLimit, consumeTestLimit, type ConsumeLimit } from "./rate";

export type HandlerResult = { status: number; body: Record<string, unknown> };

/** Writes with the service role, so the allowlist above can't be skipped. */
export type SubscriptionWriter = {
  /** Insert, or move an existing endpoint to this user (a shared device). */
  upsert(row: {
    user_id: string;
    endpoint: string;
    p256dh: string;
    auth: string;
    platform: string;
    user_agent: string | null;
  }): Promise<{ error: string | null }>;
  remove(userId: string, endpoint: string): Promise<{ error: string | null }>;
};

export const UNAVAILABLE: HandlerResult = { status: 200, body: { ok: true, available: false } };
const UNAUTHORIZED: HandlerResult = { status: 401, body: { error: "Log in to turn on notifications." } };

export async function handleSubscribe(input: {
  available: boolean;
  userId: string | null;
  body: unknown;
  userAgent: string | null;
  writer: SubscriptionWriter | null;
}): Promise<HandlerResult> {
  if (!input.available || !input.writer) return UNAVAILABLE;
  if (!input.userId) return UNAUTHORIZED;
  const parsed = parseSubscriptionBody(input.body);
  if (!parsed) return { status: 400, body: { error: "That push subscription isn't supported." } };
  const { error } = await input.writer.upsert({
    user_id: input.userId,
    endpoint: parsed.endpoint,
    p256dh: parsed.p256dh,
    auth: parsed.auth,
    platform: parsed.platform,
    user_agent: input.userAgent ? input.userAgent.slice(0, 200) : null,
  });
  if (error) return { status: 500, body: { error: "Could not save this device." } };
  return { status: 200, body: { ok: true, available: true } };
}

export async function handleUnsubscribe(input: {
  available: boolean;
  userId: string | null;
  body: unknown;
  writer: SubscriptionWriter | null;
}): Promise<HandlerResult> {
  if (!input.available || !input.writer) return UNAVAILABLE;
  if (!input.userId) return UNAUTHORIZED;
  const endpoint = parseEndpointBody(input.body);
  if (!endpoint) return { status: 400, body: { error: "Unknown device." } };
  const { error } = await input.writer.remove(input.userId, endpoint);
  if (error) return { status: 500, body: { error: "Could not remove this device." } };
  return { status: 200, body: { ok: true } };
}

/** Gate for POST /api/push/flush. `run` says whether to drain the caller's outbox. */
export async function gateFlush(input: {
  available: boolean;
  userId: string | null;
  consume: ConsumeLimit;
}): Promise<HandlerResult & { run: boolean }> {
  if (!input.available) return { ...UNAVAILABLE, run: false };
  if (!input.userId) return { ...UNAUTHORIZED, run: false };
  if (!(await consumeFlushLimit(input.consume, input.userId))) {
    return { status: 429, body: { error: "Too many requests." }, run: false };
  }
  return { status: 202, body: { ok: true }, run: true };
}

export async function gateTest(input: {
  available: boolean;
  userId: string | null;
  consume: ConsumeLimit;
}): Promise<HandlerResult & { run: boolean }> {
  if (!input.available) return { ...UNAVAILABLE, run: false };
  if (!input.userId) return { ...UNAUTHORIZED, run: false };
  if (!(await consumeTestLimit(input.consume, input.userId))) {
    return { status: 429, body: { error: "One test a minute. Try again shortly." }, run: false };
  }
  return { status: 200, body: { ok: true }, run: true };
}
