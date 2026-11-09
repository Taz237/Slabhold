import { sign } from "node:crypto";
import { connect, constants, type ClientHttp2Stream } from "node:http2";
import type { ApnsConfig } from "./apns-config";
import { sameOriginPath, trimmedForRetry, truncate, type PushPayload } from "./payload";
import { DM_TTL_SECONDS, SOCIAL_TTL_SECONDS, pushTopic, type DeliveryResult } from "./send";

/** Production only: TestFlight and App Store builds both use it. */
export const APNS_ORIGIN = "https://api.push.apple.com";
/** Apple wants the provider token refreshed between 20 and 60 minutes. */
export const JWT_MAX_AGE_MS = 40 * 60 * 1000;
export const APNS_MAX_BYTES = 4096;
const REQUEST_TIMEOUT_MS = 10_000;
const RETRY_BASE_MS = 800;
const RETRY_MAX_MS = 5000;

/** One row of push_apns_devices. */
export type ApnsDevice = { id: string; token: string };

export type ApnsReply = { status: number; reason: string | null; retryAfter: string | null };

/** One HTTP/2 connection to APNs, for one send batch. */
export type ApnsConnection = {
  post(path: string, headers: Record<string, string>, body: string): Promise<ApnsReply>;
  close(): void;
};

/** How we reach APNs. Tests pass a fake; production uses node:http2. */
export type ApnsTransport = { connect(origin: string): ApnsConnection };

export type ApnsSender = {
  send(
    devices: readonly ApnsDevice[],
    payload: PushPayload,
    options?: { sleep?: (ms: number) => Promise<void> },
  ): Promise<DeliveryResult>;
};

/** 400 reasons that mean this token will never work again for us. */
const GONE_REASONS = new Set(["BadDeviceToken", "DeviceTokenNotForTopic"]);

function base64url(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
}

/** The ES256 provider token: header {alg, kid}, claims {iss, iat}. */
export function apnsJwt(config: Pick<ApnsConfig, "keyId" | "teamId" | "privateKey">, nowMs: number): string {
  const header = base64url(JSON.stringify({ alg: "ES256", kid: config.keyId }));
  const claims = base64url(JSON.stringify({ iss: config.teamId, iat: Math.floor(nowMs / 1000) }));
  const input = `${header}.${claims}`;
  const signature = sign("sha256", Buffer.from(input), { key: config.privateKey, dsaEncoding: "ieee-p1363" });
  return `${input}.${base64url(signature)}`;
}

export function apnsHeaders(payload: PushPayload, jwt: string, bundleId: string, nowMs: number): Record<string, string> {
  const dm = payload.kind === "dm";
  const ttl = dm ? DM_TTL_SECONDS : SOCIAL_TTL_SECONDS;
  return {
    authorization: `bearer ${jwt}`,
    "apns-topic": bundleId,
    "apns-push-type": "alert",
    "apns-priority": dm ? "10" : "5",
    "apns-expiration": String(Math.floor(nowMs / 1000) + ttl),
    "apns-collapse-id": pushTopic(payload.tag),
  };
}

function bodyJson(title: string, body: string, payload: PushPayload): string {
  return JSON.stringify({
    aps: { alert: { title, body }, sound: "default", "thread-id": payload.tag },
    url: sameOriginPath(payload.url),
  });
}

function byteLength(text: string): number {
  return Buffer.byteLength(text, "utf8");
}

/** The APNs JSON: alert, sound, thread, and the page to open. No badge. Trimmed to fit 4 KB. */
export function apnsBody(payload: PushPayload, maxBytes = APNS_MAX_BYTES): string {
  let { title, body } = payload;
  let json = bodyJson(title, body, payload);
  while (byteLength(json) > maxBytes && Array.from(body).length > 1) {
    body = truncate(body, Math.floor(Array.from(body).length * 0.7));
    json = bodyJson(title, body, payload);
  }
  while (byteLength(json) > maxBytes && Array.from(title).length > 1) {
    title = truncate(title, Math.floor(Array.from(title).length * 0.7));
    json = bodyJson(title, body, payload);
  }
  return json;
}

function retryAfterMs(reply: ApnsReply | null): number {
  const seconds = Number(reply?.retryAfter);
  if (Number.isFinite(seconds) && seconds > 0) return Math.min(seconds * 1000, RETRY_MAX_MS);
  return RETRY_BASE_MS;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** node:http2 to APNs. Errors reject; nothing here logs tokens or bodies. */
export function http2Transport(): ApnsTransport {
  return {
    connect(origin) {
      const session = connect(origin);
      // A failed connection rejects each request below; this only stops an unhandled 'error'.
      session.on("error", () => undefined);
      return {
        post(path, headers, body) {
          return new Promise<ApnsReply>((resolve, reject) => {
            let settled = false;
            const done = (fn: () => void) => {
              if (settled) return;
              settled = true;
              fn();
            };
            let stream: ClientHttp2Stream;
            try {
              stream = session.request({
                ":method": "POST",
                ":path": path,
                ...headers,
                "content-type": "application/json",
                "content-length": String(Buffer.byteLength(body)),
              });
            } catch (error) {
              reject(error);
              return;
            }
            let status = 0;
            let retryAfter: string | null = null;
            let text = "";
            stream.setEncoding("utf8");
            stream.setTimeout(REQUEST_TIMEOUT_MS, () => stream.close(constants.NGHTTP2_CANCEL));
            stream.on("response", (responseHeaders) => {
              status = Number(responseHeaders[":status"]) || 0;
              const after = responseHeaders["retry-after"];
              retryAfter = typeof after === "string" ? after : null;
            });
            stream.on("data", (chunk: string) => {
              if (text.length < 2048) text += chunk;
            });
            stream.on("error", (error) => done(() => reject(error)));
            stream.on("close", () =>
              done(() => {
                if (!status) {
                  reject(new Error("APNs request closed"));
                  return;
                }
                let reason: string | null = null;
                try {
                  const parsed = JSON.parse(text) as { reason?: unknown };
                  reason = typeof parsed.reason === "string" ? parsed.reason : null;
                } catch {
                  reason = null;
                }
                resolve({ status, reason, retryAfter });
              }),
            );
            stream.end(body);
          });
        },
        close() {
          try {
            session.close();
          } catch {
            // Already gone.
          }
        },
      };
    },
  };
}

/**
 * Sends to iPhones through APNs, mapped like web push's deliver(): 200
 * delivered; 410, or 400 BadDeviceToken / DeviceTokenNotForTopic, gone;
 * 413 resends a shorter body once; 403 ExpiredProviderToken rebuilds the
 * token once; 429/5xx/network retry once after a pause; anything else failed.
 */
export function createApnsSender(
  config: ApnsConfig,
  deps: { transport?: ApnsTransport; now?: () => number } = {},
): ApnsSender {
  const transport = deps.transport ?? http2Transport();
  const now = deps.now ?? Date.now;
  let cached: { jwt: string; at: number } | null = null;

  function providerToken(fresh = false): string {
    const at = now();
    if (fresh || !cached || at - cached.at >= JWT_MAX_AGE_MS || at < cached.at) {
      cached = { jwt: apnsJwt(config, at), at };
    }
    return cached.jwt;
  }

  return {
    async send(devices, payload, options = {}) {
      const result: DeliveryResult = { delivered: [], gone: [], failed: [] };
      if (devices.length === 0) return result;
      const sleep = options.sleep ?? defaultSleep;
      let connection: ApnsConnection;
      try {
        connection = transport.connect(APNS_ORIGIN);
      } catch {
        result.failed.push(...devices.map((device) => device.id));
        return result;
      }
      try {
        await Promise.all(
          devices.map(async (device) => {
            let current = payload;
            let retried = false;
            let trimmed = false;
            let refreshed = false;
            for (;;) {
              let reply: ApnsReply | null;
              try {
                reply = await connection.post(
                  `/3/device/${device.token}`,
                  apnsHeaders(current, providerToken(), config.bundleId, now()),
                  apnsBody(current),
                );
              } catch {
                reply = null;
              }
              const status = reply?.status ?? null;
              if (status === 200) {
                result.delivered.push(device.id);
                return;
              }
              if (status === 410 || (status === 400 && GONE_REASONS.has(reply?.reason ?? ""))) {
                result.gone.push(device.id);
                return;
              }
              if (status === 413 && !trimmed) {
                trimmed = true;
                current = trimmedForRetry(current);
                continue;
              }
              if (status === 403 && reply?.reason === "ExpiredProviderToken" && !refreshed) {
                refreshed = true;
                providerToken(true);
                continue;
              }
              const retryable = status === null || status === 429 || status >= 500;
              if (retryable && !retried) {
                retried = true;
                await sleep(retryAfterMs(reply));
                continue;
              }
              result.failed.push(device.id);
              return;
            }
          }),
        );
      } finally {
        connection.close();
      }
      return result;
    },
  };
}
