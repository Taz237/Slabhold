const MAX_NEXT_LENGTH = 512;

function hasControls(value: string): boolean {
  return /[\u0000-\u001F\u007F]/.test(value);
}

/**
 * Scheme on the path only. A query may contain a URL, such as /search?q=http://x.
 * javascript: and https: on the path itself are still rejected.
 */
function hasScheme(value: string): boolean {
  const path = value.split("?")[0] ?? "";
  return /^(?:[a-z][a-z0-9+.-]*:)/i.test(path) || /(?:https?:|javascript:)/i.test(path);
}

/** Encoded double-slash or encoded backslash, any case. */
function hasEncodedBypass(value: string): boolean {
  const lower = value.toLowerCase();
  return lower.includes("%2f%2f") || lower.includes("%5c");
}

function structurallySafe(value: string): boolean {
  if (value.length === 0 || value.length > MAX_NEXT_LENGTH) return false;
  if (!value.startsWith("/")) return false;
  if (value.startsWith("//")) return false;
  if (value.startsWith("/\\")) return false;
  if (value.includes("\\")) return false;
  if (hasControls(value)) return false;
  if (hasScheme(value)) return false;
  if (hasEncodedBypass(value)) return false;
  return true;
}

/**
 * Internal return path. Anything that could leave the site, or that is not a
 * single-slash path, becomes "/".
 */
export function safeNext(value: string | null | undefined): string {
  if (typeof value !== "string") return "/";
  if (!structurallySafe(value)) return "/";
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return "/";
  }
  if (decoded !== value && !structurallySafe(decoded)) return "/";
  return value;
}

export function signupPath(pathname: string): string {
  return `/signup?next=${encodeURIComponent(safeNext(pathname))}`;
}

export function loginPath(pathname: string): string {
  return `/login?next=${encodeURIComponent(safeNext(pathname))}`;
}

/** Landing signup. Home (including a rejected next) stays a plain /signup link. */
export function landingSignupHref(next: string): string {
  return next === "/" ? "/signup" : signupPath(next);
}

/** Landing login. Home (including a rejected next) stays a plain /login link. */
export function landingLoginHref(next: string): string {
  return next === "/" ? "/login" : loginPath(next);
}

/** Auth screen logo. A real return path is kept on the landing page. */
export function authLogoHref(next: string): string {
  return next === "/" ? "/" : `/?next=${encodeURIComponent(next)}`;
}

/** Pathname plus the current query string. safeNext still checks the result. */
export function pathWithQuery(pathname: string, search: string): string {
  const path = pathname || "/";
  const query = search.replace(/^\?/, "");
  return query ? `${path}?${query}` : path;
}

/** Drop auth screens so a successful login does not bounce forever. */
export function afterAuthPath(next: string | null | undefined): string {
  const safe = safeNext(next);
  const path = safe.split("?")[0];
  if (
    path === "/login" ||
    path === "/signup" ||
    path === "/auth/confirm" ||
    path === "/auth/callback"
  ) {
    return "/";
  }
  return safe;
}

/** Email confirmation lands on /auth/confirm with the same safe next. */
export function emailConfirmRedirect(origin: string, next: string | null | undefined): string {
  const url = new URL("/auth/confirm", origin);
  url.searchParams.set("next", safeNext(next));
  return url.toString();
}
