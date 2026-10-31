import { isReservedUsername, normalizeUsername } from "@/lib/social/usernames";
import { inviteCode } from "./code";

/** Who sent you: the inviter's username and code from /i/<username>?c=<code>, kept on this device. */
export const INVITE_STORAGE_KEY = "slabhold_invite";

/** Seven days, like the UTM first touch. */
export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const HANDLE = /^[a-z0-9_]{3,20}$/;

/** A remembered invite. The code is null for a link without one (no follow-back). */
export type Invite = { username: string; code: string | null };

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

/** Remember the inviter and their code. A newer invite link replaces an older one. */
export function rememberInvite(username: string, code: string | null, store: InviteStore, now = Date.now()): boolean {
  const handle = inviteHandle(username);
  if (!handle) return false;
  try {
    store.setItem(INVITE_STORAGE_KEY, JSON.stringify({ username: handle, code: inviteCode(code), savedAt: now }));
    return true;
  } catch {
    return false;
  }
}

/** The remembered invite, or null when missing, expired or not a valid handle. A bad code reads as null. */
export function readInvite(store: InviteStore, now = Date.now()): Invite | null {
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
  const { username, code, savedAt } = parsed as { username?: unknown; code?: unknown; savedAt?: unknown };
  if (typeof savedAt !== "number" || !Number.isFinite(savedAt)) return null;
  if (savedAt > now + 60_000 || now - savedAt > INVITE_TTL_MS) return null;
  const handle = inviteHandle(typeof username === "string" ? username : null);
  return handle ? { username: handle, code: inviteCode(code) } : null;
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
