import { routeAccess } from "./route-access";

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

/** /i/<username>: the invite landing draws its own full-screen page, like Home's landing. */
export function isInvitePage(pathname: string): boolean {
  return /^\/i\/[^/]+$/.test(pathOnly(pathname));
}

/** /compose: the composer is a full-screen sheet, so no header, tabs or join bar around it. */
export function isChromelessPath(pathname: string): boolean {
  return pathOnly(pathname) === "/compose";
}

/**
 * What the shell draws before the social snapshot says who is looking.
 * "plain": unknown URLs (404s) in the plain shell, whoever is looking.
 * "shell": public pages in the plain shell (no nav, join bar or Log in yet)
 * unless the reader is already known. "bare": Home, which draws its own
 * landing page. "blank": pages that redirect or swap layout once the session
 * is known. "chromeless": the composer, which draws its own sheet skeleton.
 */
export function loadingShellFor(
  pathname: string,
): "plain" | "shell" | "bare" | "blank" | "chromeless" {
  if (isChromelessPath(pathname)) return "chromeless";
  const access = routeAccess(pathname);
  if (access === "unknown") return "plain";
  if (access === "account") return "blank";
  const path = pathOnly(pathname);
  if (path === "/") return "bare";
  if (isAuthPage(path) || isInvitePage(path)) return "blank";
  return "shell";
}
