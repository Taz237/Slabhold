/**
 * Browser push services we send to. The server only ever POSTs to these, so a
 * client cannot point the sender at an internal or third-party URL.
 */
export const PUSH_SERVICE_HOSTS = [
  "fcm.googleapis.com",
  "push.apple.com",
  "push.services.mozilla.com",
  "notify.windows.com",
  "push.api.chromium.org",
] as const;

const MAX_ENDPOINT_LENGTH = 1024;

/** https, the default port, no credentials, and a host that is or ends in an allowed service. */
export function isAllowedPushEndpoint(raw: unknown): raw is string {
  if (typeof raw !== "string" || raw.length > MAX_ENDPOINT_LENGTH) return false;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  if (url.username || url.password) return false;
  if (url.port && url.port !== "443") return false;
  const host = url.hostname.toLowerCase();
  if (!host || host.endsWith(".")) return false;
  return PUSH_SERVICE_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}

export type PushPlatform = "ios" | "android" | "desktop" | "other";

export type SubscriptionInput = {
  endpoint: string;
  p256dh: string;
  auth: string;
  platform: PushPlatform;
};

/** Unpadded base64url, as PushSubscription.toJSON() writes keys. */
const BASE64URL = /^[A-Za-z0-9_-]+={0,2}$/;

function key(value: unknown, min: number, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length < min || trimmed.length > max || !BASE64URL.test(trimmed)) return null;
  return trimmed;
}

function platformOf(value: unknown): PushPlatform {
  return value === "ios" || value === "android" || value === "desktop" ? value : "other";
}

/** `{ endpoint, keys: { p256dh, auth }, platform }`, or null when anything is off. */
export function parseSubscriptionBody(body: unknown): SubscriptionInput | null {
  if (!body || typeof body !== "object") return null;
  const input = body as { endpoint?: unknown; keys?: unknown; platform?: unknown };
  if (!isAllowedPushEndpoint(input.endpoint)) return null;
  const keys = (input.keys && typeof input.keys === "object" ? input.keys : {}) as {
    p256dh?: unknown;
    auth?: unknown;
  };
  // A P-256 public key is 65 bytes (87 chars); the auth secret 16 bytes (22 chars).
  const p256dh = key(keys.p256dh, 80, 100);
  const auth = key(keys.auth, 16, 32);
  if (!p256dh || !auth) return null;
  return { endpoint: input.endpoint, p256dh, auth, platform: platformOf(input.platform) };
}

/** Just the endpoint, for DELETE. */
export function parseEndpointBody(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const endpoint = (body as { endpoint?: unknown }).endpoint;
  return isAllowedPushEndpoint(endpoint) ? endpoint : null;
}
