import { installPlatform, type InstallPlatform } from "@/lib/pwa/install-step";
import { loadSupabaseBrowser } from "@/lib/supabase/browser-lazy";
import { pushPublicKey } from "./config";
import type { PushPlatform } from "./endpoint";
import type { PermissionState } from "./soft-ask";

/** Push is on for this build (the VAPID public key was set). The server can still say no. */
export function pushFeatureOn(): boolean {
  return pushPublicKey() !== "";
}

type NavigatorWithExtras = Navigator & {
  standalone?: boolean;
  setAppBadge?: (count?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
};

export function devicePlatform(): InstallPlatform {
  const nav = window.navigator as NavigatorWithExtras;
  return installPlatform({
    userAgent: nav.userAgent ?? "",
    platform: nav.platform,
    maxTouchPoints: nav.maxTouchPoints ?? 0,
    navigatorStandalone: nav.standalone === true,
    displayModeStandalone: Boolean(window.matchMedia?.("(display-mode: standalone)").matches),
  });
}

function isIosFamily(): boolean {
  const nav = window.navigator;
  if (/iPhone|iPad|iPod/i.test(nav.userAgent)) return true;
  return nav.platform === "MacIntel" && (nav.maxTouchPoints ?? 0) > 1 && /Macintosh/i.test(nav.userAgent);
}

/** The browser has the Push API. */
export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/**
 * This device can register the push worker: the Push API is there, and on
 * iPhone and iPad only inside the installed app (Safari tabs can't get pushes).
 */
export function pushReady(platform: InstallPlatform = devicePlatform()): boolean {
  if (!pushSupported()) return false;
  if (platform === "in-app") return false;
  if (isIosFamily()) return platform === "installed";
  return true;
}

export function permissionState(): PermissionState {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission as PermissionState;
}

export function subscriptionPlatform(platform: InstallPlatform = devicePlatform()): PushPlatform {
  if (isIosFamily()) return "ios";
  if (platform === "android" || /Android/i.test(navigator.userAgent)) return "android";
  if (platform === "desktop") return "desktop";
  return "other";
}

async function authHeaders(): Promise<Record<string, string>> {
  try {
    const client = await loadSupabaseBrowser();
    const { data } = (await client?.auth.getSession()) ?? { data: null };
    const token = data?.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

/** Fire and forget: tell the server to send the pushes this user's action caused. */
export function firePushFlush(): void {
  if (!pushFeatureOn()) return;
  void (async () => {
    const headers = await authHeaders();
    await fetch("/api/push/flush", { method: "POST", keepalive: true, credentials: "same-origin", headers });
  })().catch(() => undefined);
}

/** GET /api/push/subscribe: whether the server can send right now. */
export async function pushServerAvailable(): Promise<boolean> {
  if (!pushFeatureOn()) return false;
  try {
    const response = await fetch("/api/push/subscribe", { cache: "no-store" });
    const body = (await response.json()) as { available?: unknown };
    return body.available === true;
  } catch {
    return false;
  }
}

export function registerPushWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!pushFeatureOn() || !pushReady()) return Promise.resolve(null);
  return navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => null);
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  try {
    const registration = await navigator.serviceWorker.getRegistration("/");
    return (await registration?.pushManager.getSubscription()) ?? null;
  } catch {
    return null;
  }
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const padded = `${base64url}${"=".repeat((4 - (base64url.length % 4)) % 4)}`.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
  return bytes;
}

function sameKey(subscription: PushSubscription, key: Uint8Array): boolean {
  const current = subscription.options?.applicationServerKey;
  if (!current) return true;
  const bytes = new Uint8Array(current);
  return bytes.length === key.length && bytes.every((byte, index) => byte === key[index]);
}

/** On this device, for this user: the master switch. */
export function deviceOptInKey(userId: string): string {
  return `slabhold.push.on.${userId}`;
}

function rememberOptIn(userId: string, on: boolean) {
  try {
    if (on) localStorage.setItem(deviceOptInKey(userId), "1");
    else localStorage.removeItem(deviceOptInKey(userId));
  } catch {
    // Private mode: the switch just won't survive a sign-out.
  }
}

export function deviceOptedIn(userId: string): boolean {
  try {
    return localStorage.getItem(deviceOptInKey(userId)) === "1";
  } catch {
    return false;
  }
}

/**
 * Subscribe this device and save it for this user. Call only once
 * Notification.permission is "granted".
 */
export async function subscribeDevice(userId: string): Promise<boolean> {
  if (!pushFeatureOn() || !pushReady() || permissionState() !== "granted") return false;
  try {
    const registration = (await registerPushWorker()) ?? (await navigator.serviceWorker.ready);
    await navigator.serviceWorker.ready;
    const key = keyBytes(pushPublicKey());
    let subscription = await registration.pushManager.getSubscription();
    if (subscription && !sameKey(subscription, key)) {
      await subscription.unsubscribe();
      subscription = null;
    }
    subscription ??= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
    const json = subscription.toJSON();
    const response = await fetch("/api/push/subscribe", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys, platform: subscriptionPlatform() }),
    });
    if (!response.ok) return false;
    rememberOptIn(userId, true);
    return true;
  } catch {
    return false;
  }
}

/** The master switch off: forget this device on the server and in the browser. */
export async function unsubscribeDevice(userId: string): Promise<void> {
  rememberOptIn(userId, false);
  const subscription = await currentSubscription();
  if (!subscription) return;
  try {
    await fetch("/api/push/subscribe", {
      method: "DELETE",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    });
  } finally {
    await subscription.unsubscribe().catch(() => false);
  }
}

/**
 * Sign-out: the DELETE goes out (keepalive) while the session is still valid,
 * and the browser drops the subscription, so a shared device never gets the
 * previous user's pushes. Resolves as soon as the request is on its way.
 */
export async function forgetDeviceOnSignOut(): Promise<void> {
  const subscription = await currentSubscription();
  if (!subscription) return;
  const headers = await authHeaders();
  void fetch("/api/push/subscribe", {
    method: "DELETE",
    keepalive: true,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ endpoint: subscription.endpoint }),
  }).catch(() => undefined);
  void subscription.unsubscribe().catch(() => false);
}

/** The app icon badge: unread notifications plus unread DMs. */
export function setAppBadge(count: number): void {
  const nav = navigator as NavigatorWithExtras;
  try {
    if (count > 0 && typeof nav.setAppBadge === "function") void nav.setAppBadge(count).catch(() => undefined);
    else if (count <= 0 && typeof nav.clearAppBadge === "function") void nav.clearAppBadge().catch(() => undefined);
  } catch {
    // Not every browser badges.
  }
}

export async function sendTestPush(): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await fetch("/api/push/test", {
      method: "POST",
      credentials: "same-origin",
      headers: await authHeaders(),
    });
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    return response.ok ? { ok: true } : { ok: false, error: body.error ?? "Could not send a test." };
  } catch {
    return { ok: false, error: "Could not send a test. Check your connection." };
  }
}
