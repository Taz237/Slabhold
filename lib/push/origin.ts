/**
 * A cheap CSRF check for the cookie-authenticated push routes, on top of the
 * session cookie's SameSite=Lax. Same-origin when the browser says so in
 * Sec-Fetch-Site, else when Origin is exactly this request's own origin
 * (so Vercel preview URLs work). Neither header: rejected, since browsers
 * send at least one on every POST and DELETE.
 */
export function isSameOriginRequest(request: Request): boolean {
  const site = request.headers.get("sec-fetch-site")?.trim().toLowerCase();
  if (site === "same-origin") return true;
  const origin = request.headers.get("origin")?.trim();
  if (!origin) return false;
  try {
    return origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

/** A Supabase access token rides in Authorization; no ambient cookie, so no CSRF risk. */
export function hasBearerToken(request: Request): boolean {
  const header = request.headers.get("authorization")?.trim() ?? "";
  return /^Bearer\s+\S/i.test(header);
}

/**
 * 403 for a cross-site, cookie-authenticated mutating request, else null.
 * Call it after the dormant answer and before any auth or database work.
 */
export function crossSiteRejection(request: Request): Response | null {
  if (hasBearerToken(request) || isSameOriginRequest(request)) return null;
  return Response.json({ error: "Forbidden" }, { status: 403 });
}
