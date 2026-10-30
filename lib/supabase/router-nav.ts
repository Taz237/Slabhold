/**
 * Set by proxy.ts on a visit from inside the app. Next strips its own router
 * headers (rsc, next-router-prefetch, ...) before the proxy and pages run,
 * so the proxy reads what still arrives and passes this mark on. A forged
 * value only makes a page skip its server first-screen read.
 */
export const ROUTER_NAV_HEADER = "x-slabhold-nav";

/** Next's router headers. Stripped before the proxy in Next 16; checked in case they arrive. */
const ROUTER_HEADERS = ["rsc", "next-router-prefetch", "next-router-segment-prefetch"];

/**
 * A request from the app's router, not a page load. Every browser fetch()
 * carries Sec-Fetch-Mode, and only a page load says "navigate". The router
 * also sends Next-Url, which Next leaves in place.
 */
export function routerRequest(headers: { get(name: string): string | null }): boolean {
  if (ROUTER_HEADERS.some((name) => headers.get(name) !== null)) return true;
  if (headers.get("next-url") !== null) return true;
  const mode = headers.get("sec-fetch-mode");
  return mode !== null && mode !== "navigate";
}

/** Request headers with the nav mark added, or null for a full page load. */
export function markRouterRequest(incoming: Headers): Headers | null {
  if (!routerRequest(incoming)) return null;
  const headers = new Headers(incoming);
  headers.set(ROUTER_NAV_HEADER, "1");
  return headers;
}

/** True when the proxy marked this request as a visit from inside the app. */
export function isRouterNavigation(headers: { get(name: string): string | null }): boolean {
  return headers.get(ROUTER_NAV_HEADER) === "1";
}
