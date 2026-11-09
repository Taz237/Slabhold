import { authHeaders } from "./client";
import type { AskSurface } from "./soft-ask";

/** The iPhone app's notification permission, from the PushNotifications plugin. */
export type NativePermission = "granted" | "denied" | "prompt";

/** The last APNs token this phone saved, so sign-out and the switch can remove it. */
export const APNS_TOKEN_KEY = "slabhold.apns.token";

/**
 * What the iPhone app can offer. Old TestFlight builds (2 and 3) have no
 * plugin; with APNs off on the server there's nothing to turn on. Denied
 * goes to Settings, never a prompt.
 */
export function nativeAskSurface(input: {
  pluginAvailable: boolean;
  serverAvailable: boolean;
  permission: NativePermission | null;
  optedIn: boolean;
}): AskSurface | null {
  if (!input.pluginAvailable || !input.serverAvailable) return null;
  if (input.permission === "prompt") return "push";
  if (input.permission === "granted" && !input.optedIn) return "push";
  return null;
}

/** Settings > Notifications in the app: the real settings, or today's note. */
export function nativeSettingsMode(input: { pluginAvailable: boolean; serverAvailable: boolean }): "settings" | "note" {
  return input.pluginAvailable && input.serverAvailable ? "settings" : "note";
}

let available: Promise<boolean> | null = null;

/** GET /api/push/apns, once per page load. Any failure reads as off. */
export function apnsServerAvailable(): Promise<boolean> {
  available ??= fetch("/api/push/apns", { cache: "no-store" })
    .then((response) => response.json() as Promise<{ available?: unknown }>)
    .then((body) => body.available === true)
    .catch(() => false);
  return available;
}

function readToken(): string | null {
  try {
    return localStorage.getItem(APNS_TOKEN_KEY);
  } catch {
    return null;
  }
}

function writeToken(token: string | null) {
  try {
    if (token) localStorage.setItem(APNS_TOKEN_KEY, token);
    else localStorage.removeItem(APNS_TOKEN_KEY);
  } catch {
    // Private storage blocked: sign-out just can't remove it, and APNs drops it later.
  }
}

/** POST /api/push/apns: this iPhone's token, for the signed-in user. A cheap upsert. */
export async function saveApnsToken(token: string): Promise<boolean> {
  try {
    const response = await fetch("/api/push/apns", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ token }),
    });
    if (!response.ok) return false;
    writeToken(token);
    return true;
  } catch {
    return false;
  }
}

/**
 * DELETE /api/push/apns for the last saved token. keepalive for sign-out,
 * where the request goes out while the session is still valid.
 */
export async function forgetApnsToken(options: { keepalive?: boolean } = {}): Promise<void> {
  const token = readToken();
  if (!token) return;
  writeToken(null);
  const request = fetch("/api/push/apns", {
    method: "DELETE",
    keepalive: options.keepalive === true,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ token }),
  }).catch(() => undefined);
  if (!options.keepalive) await request;
}

/** Fire and forget: send the pushes this user's action caused (web and iPhone recipients). */
export function fireNativeFlush(): void {
  void (async () => {
    const headers = await authHeaders();
    await fetch("/api/push/flush", { method: "POST", keepalive: true, credentials: "same-origin", headers });
  })().catch(() => undefined);
}
