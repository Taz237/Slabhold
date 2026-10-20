const MAX_NEXT_LENGTH = 512;

function hasControls(value: string): boolean {
  return /[\u0000-\u001F\u007F]/.test(value);
}

/** http:, https:, javascript:, or any other scheme. */
function hasScheme(value: string): boolean {
  return /^(?:[a-z][a-z0-9+.-]*:)/i.test(value) || /(?:https?:|javascript:)/i.test(value);
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
