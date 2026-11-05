import { APP_RETURN_PATH, HANDLE_PATH, OAUTH_PATH } from "@/lib/auth/oauth-paths";
import { afterAuthPath, safeNext } from "@/lib/auth/safe-next";

/**
 * Continue with Apple / Google. Pure, so it's tested without Supabase.
 *
 * Web: Supabase sends the person back to /auth/oauth, which swaps the code
 * for a session (PKCE) and goes on to `next`, like email login.
 * iOS app: the sign-in page opens in the in-app browser (Google blocks it in
 * a WebView) and comes back on /auth/app-return, a universal link. The app
 * then loads /auth/oauth in its WebView, where the PKCE verifier lives.
 */
export type OAuthProvider = "apple" | "google";

export { APP_RETURN_PATH, HANDLE_PATH, OAUTH_PATH };

/** Apple first (App Store rule 4.8), each only when its flag is "1". */
export function oauthProviders(flags: { apple?: string; google?: string }): OAuthProvider[] {
  const list: OAuthProvider[] = [];
  if (flags.apple === "1") list.push("apple");
  if (flags.google === "1") list.push("google");
  return list;
}

/** Read at build time. Both off until the providers are set up in Supabase. */
export const ENABLED_PROVIDERS: readonly OAuthProvider[] = oauthProviders({
  apple: process.env.NEXT_PUBLIC_AUTH_APPLE,
  google: process.env.NEXT_PUBLIC_AUTH_GOOGLE,
});

/** The redirectTo passed to signInWithOAuth, keeping a safe `next`. */
export function oauthRedirectTo(origin: string, next: string | null | undefined, native: boolean): string {
  const url = new URL(native ? APP_RETURN_PATH : OAUTH_PATH, origin);
  url.searchParams.set("next", afterAuthPath(next));
  return url.toString();
}

/**
 * The iOS app opened on a link: if it's the sign-in return, the WebView page
 * that finishes it (/auth/oauth with the same query). Null for any other link.
 * `path` is what appLinkPath returned.
 */
export function oauthReturnPath(path: string | null): string | null {
  if (!path) return null;
  const match = /^\/auth\/app-return\/?(\?[^#]*)?(?:#.*)?$/.exec(path);
  if (!match) return null;
  return `${OAUTH_PATH}${match[1] ?? ""}`;
}

/** /auth/app-return opened in the browser (no universal link): hand it to the app's own scheme. */
export function appSchemeReturn(search: string): string {
  return `slabhold://auth/app-return${search}`;
}

type AuthUserLike = {
  app_metadata?: { provider?: unknown } | null;
  user_metadata?: { username?: unknown } | null;
};

/**
 * Email signups choose their @handle while signing up (it's in user_metadata).
 * An Apple or Google account starts on a handle from its email, so it picks
 * one first. Saving the handle writes user_metadata.username, which ends this.
 */
export function needsHandle(user: AuthUserLike | null | undefined): boolean {
  if (!user) return false;
  const provider = user.app_metadata?.provider;
  if (provider !== "apple" && provider !== "google") return false;
  const username = user.user_metadata?.username;
  return typeof username !== "string" || username.trim() === "";
}

/** Where /auth/oauth sends someone once the code is swapped (or not). */
export function oauthLandingPath(input: {
  next: string | null | undefined;
  ok: boolean;
  needsHandle: boolean;
}): string {
  const next = afterAuthPath(input.next);
  if (!input.ok) return `/login?next=${encodeURIComponent(safeNext(next))}&oauth=failed`;
  if (input.needsHandle) return `${HANDLE_PATH}?next=${encodeURIComponent(next)}`;
  return next;
}

export const OAUTH_FAILED = "That sign-in didn't finish. Try again, or use your email.";
