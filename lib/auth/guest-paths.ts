function pathOnly(pathname: string): string {
  const cut = pathname.split("?")[0]?.split("#")[0] ?? "/";
  if (cut.length > 1 && cut.endsWith("/")) return cut.slice(0, -1);
  return cut || "/";
}

/** Signed-out post, public card, and profile screens. */
export function isJoinBarPage(pathname: string): boolean {
  const path = pathOnly(pathname);
  if (/^\/posts\/[^/]+$/.test(path)) return true;
  if (/^\/u\/[^/]+$/.test(path)) return true;
  if (/^\/u\/[^/]+\/cards\/[^/]+$/.test(path)) return true;
  if (/^\/cards\/[^/]+\/posts$/.test(path)) return true;
  if (/^\/p\/[^/]+$/.test(path)) return true;
  return false;
}

export function shouldShowJoinBar(signedIn: boolean, pathname: string): boolean {
  return !signedIn && isJoinBarPage(pathname);
}

/** Pages a signed-out visitor can read without the logged-in nav. */
export function isGuestContentPage(pathname: string): boolean {
  const path = pathOnly(pathname);
  if (path === "/terms" || path === "/about" || path === "/privacy") return true;
  if (isJoinBarPage(path)) return true;
  if (/^\/u\/[^/]+\/(?:followers|following)$/.test(path)) return true;
  return false;
}

export function isAuthPage(pathname: string): boolean {
  const path = pathOnly(pathname);
  return (
    path === "/login" ||
    path === "/signup" ||
    path === "/forgot-password" ||
    path === "/reset-password"
  );
}
