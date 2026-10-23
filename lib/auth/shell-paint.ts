import { requiresAccount } from "./route-access";

function pathOnly(pathname: string): string {
  const cut = pathname.split("?")[0]?.split("#")[0] ?? "/";
  if (cut.length > 1 && cut.endsWith("/")) return cut.slice(0, -1);
  return cut || "/";
}

/** Signed-out `/` and `/home` are the marketing page. They need no social snapshot. */
export function isGuestHome(pathname: string, signedIn: boolean): boolean {
  if (signedIn) return false;
  const path = pathOnly(pathname);
  return path === "/" || path === "/home";
}

/**
 * Skip the site snapshot once we know the visitor is signed out on the landing
 * page. Wait while the session read is still in flight so a signed-in home
 * still loads its feed.
 */
export function shouldSkipSocialSnapshot(input: {
  pathname: string;
  sessionKnown: boolean;
  sessionUserId: string | null;
}): boolean {
  if (!input.sessionKnown) return false;
  return isGuestHome(input.pathname, Boolean(input.sessionUserId));
}

/**
 * What to paint while getSession is still in flight. The static shell has no
 * landing page, join bar, nav, or auth CTA. Home and account routes stay empty
 * so they can swap to the landing page, the feed, or a gate once the session
 * is known. Other pages may show their own children.
 */
export function paintBeforeSession(pathname: string): {
  showLanding: boolean;
  showJoinBar: boolean;
  showNav: boolean;
  showChildren: boolean;
} {
  const home = isGuestHome(pathname, false);
  const account = requiresAccount(pathname);
  return {
    showLanding: false,
    showJoinBar: false,
    showNav: false,
    showChildren: !home && !account,
  };
}

/** How long the shell waits on getSession before painting the signed-out state. */
export const SESSION_READ_MS = 5_000;

/**
 * Resolve a session read, or null when it exceeds the timeout or rejects.
 * Null is the guest fallback so a hung getSession cannot hold the shell.
 */
export function withSessionTimeout<T>(read: Promise<T>, ms = SESSION_READ_MS): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    read.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      },
    );
  });
}
