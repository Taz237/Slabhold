import { hasSessionCookie } from "@/lib/auth/session-hint";

/** Signed-out Home's own route. proxy.ts serves it at /; the address bar stays /. */
export const LANDING_PATH = "/welcome";

/**
 * Home for a visitor: no Supabase session cookie means nobody is signed in,
 * so / is the landing page with none of the app's code. With a cookie (even
 * a stale one) / stays the app's Home, which shows the timeline or, once the
 * session turns out empty, the same landing page. Local accounts (no Supabase
 * keys) keep their session in storage, so they always get the app's Home.
 */
export function servesLanding(input: {
  pathname: string;
  cookieHeader: string;
  supabaseConfigured: boolean;
}): boolean {
  return input.pathname === "/" && input.supabaseConfigured && !hasSessionCookie(input.cookieHeader);
}
