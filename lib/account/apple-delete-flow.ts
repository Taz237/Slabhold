import type { AccountDeleteResult } from "@/lib/account/delete-account";

/**
 * Deleting a Sign in with Apple account, with the Apple token revoked first.
 *
 * We never store Apple tokens. Supabase hands one over only at sign-in, so
 * when revoke is set up the delete goes: type DELETE, Continue with Apple once
 * more, then the delete runs with the fresh token. Two short-lived httpOnly
 * cookies carry that across the trip to Apple. Both name the user they belong
 * to, so a different login can never pick them up.
 *
 * Pure: no Node or Next imports, so the screen can share the constants.
 */

/** "DELETE was typed by this user." Set by the delete route, read by /auth/oauth and the delete route. */
export const DELETE_PENDING_COOKIE = "sh-delete-pending";
/** The Apple token to revoke. Set by /auth/oauth, sent only to the delete route. */
export const APPLE_TOKEN_COOKIE = "sh-apple-revoke";
/** Minutes, not days: long enough for Face ID, short enough to forget. */
export const DELETE_FLOW_MAX_AGE_SECONDS = 10 * 60;
export const DELETE_API_PATH = "/api/account/delete";
/** Where Continue with Apple comes back to. The screen then finishes the delete by itself. */
export const DELETE_RESUME_PATH = "/settings/privacy?delete=resume";

/** Cookies hold about 4 KB. Apple's tokens are far shorter; anything longer is skipped. */
const MAX_TOKEN_LENGTH = 3000;

export type AppleTokenHint = "refresh_token" | "access_token";

/** A cookie to set. maxAge 0 clears it. */
export type FlowCookie = { name: string; value: string; path: string; maxAge: number };

/** How every flow cookie is set: httpOnly, Secure, SameSite=Lax, short. */
export function flowCookieOptions(cookie: FlowCookie) {
  return { httpOnly: true, secure: true, sameSite: "lax" as const, path: cookie.path, maxAge: cookie.maxAge };
}

function pendingCookie(userId: string, tried: boolean): FlowCookie {
  return { name: DELETE_PENDING_COOKIE, value: `${tried ? "t" : "p"}.${userId}`, path: "/", maxAge: DELETE_FLOW_MAX_AGE_SECONDS };
}

const CLEAR: FlowCookie[] = [
  { name: DELETE_PENDING_COOKIE, value: "", path: "/", maxAge: 0 },
  { name: APPLE_TOKEN_COOKIE, value: "", path: DELETE_API_PATH, maxAge: 0 },
];

/** The pending cookie, only if it belongs to this user. `tried`: Apple came back without a token. */
export function parsePending(raw: string | null | undefined, userId: string | null): { tried: boolean } | null {
  if (!raw || !userId) return null;
  if (raw === `p.${userId}`) return { tried: false };
  if (raw === `t.${userId}`) return { tried: true };
  return null;
}

/** The token cookie, only if it belongs to this user. */
export function parseAppleToken(
  raw: string | null | undefined,
  userId: string | null,
): { token: string; hint: AppleTokenHint } | null {
  if (!raw || !userId) return null;
  const kind = raw.slice(0, 2);
  if (kind !== "r." && kind !== "a.") return null;
  const owner = `${userId}.`;
  if (!raw.startsWith(owner, 2)) return null;
  const token = raw.slice(2 + owner.length);
  if (!token) return null;
  return { token, hint: kind === "r." ? "refresh_token" : "access_token" };
}

function usableToken(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const token = value.trim();
  return token && token.length <= MAX_TOKEN_LENGTH ? token : null;
}

/**
 * /auth/oauth, after the code is swapped: the cookies to set. Nothing unless
 * a delete is pending. A different login clears the pending delete. The same
 * login with a provider token (refresh first) gets the token cookie; without
 * one the pending cookie is marked tried, so the delete can still go on.
 */
export function oauthFlowCookies(input: {
  pendingRaw: string | null | undefined;
  userId: string | null | undefined;
  session: { provider_refresh_token?: unknown; provider_token?: unknown } | null | undefined;
}): FlowCookie[] {
  if (!input.pendingRaw) return [];
  const userId = input.userId ?? null;
  if (!userId || !parsePending(input.pendingRaw, userId)) return CLEAR;
  const refresh = usableToken(input.session?.provider_refresh_token);
  const access = refresh ? null : usableToken(input.session?.provider_token);
  const token = refresh ?? access;
  if (!token) return [pendingCookie(userId, true)];
  return [
    {
      name: APPLE_TOKEN_COOKIE,
      value: `${refresh ? "r" : "a"}.${userId}.${token}`,
      path: DELETE_API_PATH,
      maxAge: DELETE_FLOW_MAX_AGE_SECONDS,
    },
  ];
}

/** True for the query Continue with Apple comes back with. */
export function isDeleteResume(search: string | null | undefined): boolean {
  if (!search) return false;
  const query = search.includes("?") ? search.slice(search.indexOf("?") + 1) : search;
  return new URLSearchParams(query).get("delete") === "resume";
}

export const DELETE_NOT_FINISHED = "Apple sign-in didn't finish, so your account is not deleted. Type DELETE to try again.";

export type AccountDeleteReply = {
  status: number;
  body: { ok?: boolean; error?: string; apple?: true; needApple?: true };
  cookies: FlowCookie[];
};

/**
 * POST /api/account/delete, without Next. The user id is the session's; the
 * body only says whether this is the automatic call after Continue with Apple.
 *
 * - Apple login, revoke set up, no token yet: nothing is deleted. The pending
 *   cookie is set and the screen is told to Continue with Apple.
 * - The automatic call deletes only when this user's pending cookie is there,
 *   so a link to the resume page can't delete an account by itself.
 * - Otherwise: revoke when there is a token, then always delete. A failed
 *   revoke never blocks the delete. `apple: true` (show the Settings steps)
 *   only when an Apple login was deleted and the revoke didn't succeed.
 */
export async function handleAccountDelete(input: {
  sessionUserId: string | null;
  /** The service-role client is there. Without it runDelete answers 500. */
  ready: boolean;
  body: unknown;
  apple: boolean;
  revokeConfigured: boolean;
  pendingRaw: string | null | undefined;
  tokenRaw: string | null | undefined;
  revoke: (token: string, hint: AppleTokenHint) => Promise<{ revoked: boolean }>;
  runDelete: () => Promise<AccountDeleteResult>;
}): Promise<AccountDeleteReply> {
  const userId = input.sessionUserId;
  const resume = (input.body as { resume?: unknown } | null)?.resume === true;
  const pending = parsePending(input.pendingRaw, userId);
  const token = parseAppleToken(input.tokenRaw, userId);

  if (userId && input.ready) {
    const notFinished: AccountDeleteReply = { status: 409, body: { error: DELETE_NOT_FINISHED }, cookies: CLEAR };
    if (resume && !pending) return notFinished;
    if (input.apple && input.revokeConfigured && !token && !pending?.tried) {
      if (resume) return notFinished;
      return { status: 200, body: { needApple: true }, cookies: [pendingCookie(userId, false)] };
    }
  }

  let revoked = false;
  if (userId && input.ready && input.apple && token) {
    try {
      revoked = (await input.revoke(token.token, token.hint)).revoked === true;
    } catch {
      revoked = false;
    }
  }
  const result = await input.runDelete();
  const body = result.status === 200 && input.apple && !revoked ? { ...result.body, apple: true as const } : result.body;
  return { status: result.status, body, cookies: CLEAR };
}
