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
