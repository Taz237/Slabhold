import { isReservedUsername, normalizeUsername } from "@/lib/social/local-db";

/** Who sent you: the inviter's username from /i/<username>, kept on this device. */
export const INVITE_STORAGE_KEY = "slabhold_invite";

/** Seven days, like the UTM first touch. */
export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const HANDLE = /^[a-z0-9_]{3,20}$/;

export type InviteStore = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

/** A handle the invite page may remember, or null. Reserved names never are. */
export function inviteHandle(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const handle = normalizeUsername(value.replace(/^@/, ""));
  if (!HANDLE.test(handle) || isReservedUsername(handle)) return null;
  return handle;
}

/** Remember the inviter. A newer invite link replaces an older one. */
export function rememberInvite(username: string, store: InviteStore, now = Date.now()): boolean {
  const handle = inviteHandle(username);
  if (!handle) return false;
  try {
    store.setItem(INVITE_STORAGE_KEY, JSON.stringify({ username: handle, savedAt: now }));
    return true;
  } catch {
    return false;
  }
}

/** The remembered inviter, or null when missing, expired or not a valid handle. */
export function readInvite(store: InviteStore, now = Date.now()): string | null {
  let raw: string | null;
  try {
    raw = store.getItem(INVITE_STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const { username, savedAt } = parsed as { username?: unknown; savedAt?: unknown };
  if (typeof savedAt !== "number" || !Number.isFinite(savedAt)) return null;
  if (savedAt > now + 60_000 || now - savedAt > INVITE_TTL_MS) return null;
  return inviteHandle(typeof username === "string" ? username : null);
}

export function clearInvite(store: InviteStore) {
  try {
    store.removeItem(INVITE_STORAGE_KEY);
  } catch {
    // Storage is off. Nothing to clear.
  }
}

/** The browser's localStorage, or null on the server or when it's blocked. */
export function inviteStore(): InviteStore | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}
