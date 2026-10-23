function pathOnly(pathname: string): string {
  const cut = pathname.split("?")[0]?.split("#")[0] ?? "/";
  if (cut.length > 1 && cut.endsWith("/")) return cut.slice(0, -1);
  return cut || "/";
}

/**
 * Routes that need an account. Signed-out visitors are sent to
 * /login?next=… Everything else renders, including unknown URLs (404)
 * and pages that call notFound().
 *
 * Account:
 * /collection, /portfolio,
 * /cards/new, /cards/:id, /cards/:id/edit,
 * /compose, /scan,
 * /messages, /messages/:username,
 * /notifications, /more,
 * /profile, /profile/followers, /profile/following,
 * /settings, /settings/privacy (and any other /settings/*)
 */
const ACCOUNT_EXACT = new Set([
  "/collection",
  "/portfolio",
  "/cards/new",
  "/compose",
  "/scan",
  "/messages",
  "/notifications",
  "/more",
  "/profile",
  "/profile/followers",
  "/profile/following",
  "/settings",
  "/settings/privacy",
]);

/**
 * Pages a signed-out visitor can open: marketing, auth, search, and
 * public posts, profiles, and cards.
 */
const PUBLIC_EXACT = new Set([
  "/",
  "/home",
  "/about",
  "/privacy",
  "/terms",
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/auth/callback",
  "/auth/confirm",
  "/search",
  "/moving-today",
]);

/**
 * Files the browser fetches while installing or unfurling a link.
 * These must never be rewritten to the 404 or sent to signup.
 */
export function isStaticPublicPath(pathname: string): boolean {
  const path = pathOnly(pathname);
  if (path === "/manifest.webmanifest" || path === "/robots.txt" || path === "/favicon.ico") {
    return true;
  }
  if (path === "/apple-touch-icon.png" || path === "/apple-icon.png") return true;
  if (path === "/icons" || path.startsWith("/icons/")) return true;
  if (path === "/_next" || path.startsWith("/_next/")) return true;
  if (/(?:^|\/)(?:opengraph-image|twitter-image)$/.test(path)) return true;
  return false;
}

export type RouteAccess = "public" | "account" | "unknown";

function isAccountPath(path: string): boolean {
  if (ACCOUNT_EXACT.has(path)) return true;
  if (path.startsWith("/settings/")) return true;
  if (/^\/messages\/[^/]+$/.test(path)) return true;
  if (/^\/cards\/[^/]+\/edit$/.test(path)) return true;
  if (/^\/cards\/[^/]+$/.test(path)) return true;
  return false;
}

function isPublicPath(path: string): boolean {
  if (PUBLIC_EXACT.has(path)) return true;
  // Retired composer. next.config sends /mail-day to /cards/new before this
  // app runs. Keeping the path public means a signed-out visit is not the
  // branded 404 (unknown) and is not sent to log in with next=/mail-day.
  // /cards/new is the account page, so login returns them there.
  if (path === "/mail-day" || path.startsWith("/mail-day/")) return true;
  if (/^\/posts\/[^/]+$/.test(path)) return true;
  if (/^\/u\/[^/]+$/.test(path)) return true;
  if (/^\/u\/[^/]+\/(?:followers|following)$/.test(path)) return true;
  if (/^\/u\/[^/]+\/cards\/[^/]+$/.test(path)) return true;
  if (/^\/cards\/[^/]+\/posts$/.test(path)) return true;
  if (/^\/p\/[^/]+$/.test(path)) return true;
  return false;
}

export function routeAccess(pathname: string): RouteAccess {
  const path = pathOnly(pathname);
  if (isStaticPublicPath(path)) return "public";
  if (isAccountPath(path)) return "account";
  if (isPublicPath(path)) return "public";
  return "unknown";
}

/** True only for screens that should redirect signed-out visitors to log in. */
export function requiresAccount(pathname: string): boolean {
  return routeAccess(pathname) === "account";
}
