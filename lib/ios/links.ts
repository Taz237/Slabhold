/**
 * Where a link goes inside the iOS app. Pure, so it's tested without a WebView.
 * - "browser": another site. Opens in the in-app browser (SFSafariViewController).
 * - "app": a Slabhold page. Stays in the app, at `path`.
 * - null: leave it to the WebView (mailto:, tel:, a same-tab Slabhold link).
 */
export const APP_HOSTS: readonly string[] = ["slabhold.app", "www.slabhold.app"];

export type LinkRoute = { kind: "browser"; url: string } | { kind: "app"; path: string } | null;

function parse(href: string, base: string): URL | null {
  try {
    return new URL(href, base);
  } catch {
    return null;
  }
}

function isAppHost(url: URL, here: URL): boolean {
  return url.origin === here.origin || APP_HOSTS.includes(url.hostname);
}

function pathOf(url: URL): string {
  return `${url.pathname}${url.search}${url.hash}`;
}

/** A tapped <a>. `newTab` is target="_blank". */
export function routeLink(input: { href: string; here: string; newTab: boolean }): LinkRoute {
  const here = parse(input.here, input.here);
  const url = here ? parse(input.href, here.href) : null;
  if (!here || !url) return null;
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (!isAppHost(url, here)) return { kind: "browser", url: url.href };
  // Same origin, same tab: the router already has it.
  if (url.origin === here.origin && !input.newTab) return null;
  return { kind: "app", path: pathOf(url) };
}

/**
 * window.open(url) in the app. A WebView has no tabs, so every web page, ours
 * included (a share image, say), opens in the in-app browser.
 */
export function routeWindowOpen(input: { url: string; here: string }): string | null {
  const url = parse(input.url, input.here);
  if (!url || (url.protocol !== "https:" && url.protocol !== "http:")) return null;
  return url.href;
}

/** A universal link (https://slabhold.app/u/name) opened the app: the page to show. */
export function appLinkPath(link: string): string | null {
  const url = parse(link, "https://slabhold.app");
  if (!url || url.protocol !== "https:" || !APP_HOSTS.includes(url.hostname)) return null;
  return pathOf(url) || "/";
}
