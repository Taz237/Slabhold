/**
 * The iOS app's native layer. Loaded only inside the app (see NativeBoot), by
 * `await import()`, so no web visitor downloads a byte of it.
 * - hides the launch splash once the page is up
 * - status bar text follows light and dark mode
 * - universal links (https://slabhold.app/...) open the page in the app
 * - links to other sites, and window.open, use the in-app browser
 */
import { appLinkPath, routeLink, routeWindowOpen } from "@/lib/ios/links";

export type ShellDeps = { navigate: (path: string) => void };

const LAUNCH_KEY = "slabhold.native.launch-url";

function hereHref() {
  return window.location.href;
}

function currentPath() {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

/** Each launch link is followed once, not again on every reload. */
function firstTimeFor(url: string): boolean {
  try {
    if (window.sessionStorage.getItem(LAUNCH_KEY) === url) return false;
    window.sessionStorage.setItem(LAUNCH_KEY, url);
  } catch {
    // Storage blocked: follow it anyway.
  }
  return true;
}

export async function startNativeShell({ navigate }: ShellDeps): Promise<() => void> {
  const [{ SplashScreen }, { StatusBar, Style }, { App }, { Browser }] = await Promise.all([
    import("@capacitor/splash-screen"),
    import("@capacitor/status-bar"),
    import("@capacitor/app"),
    import("@capacitor/browser"),
  ]);

  const openInBrowser = (url: string) => void Browser.open({ url, presentationStyle: "popover" }).catch(() => {});
  const go = (path: string) => {
    if (path !== currentPath()) navigate(path);
  };

  function onClick(event: MouseEvent) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    const anchor = (event.target as Element | null)?.closest?.("a[href]");
    if (!(anchor instanceof HTMLAnchorElement) || anchor.hasAttribute("download")) return;
    const route = routeLink({
      href: anchor.getAttribute("href") ?? "",
      here: hereHref(),
      newTab: anchor.target === "_blank",
    });
    if (!route) return;
    event.preventDefault();
    if (route.kind === "browser") openInBrowser(route.url);
    else go(route.path);
  }
  document.addEventListener("click", onClick, true);

  const webOpen = window.open;
  window.open = (url?: string | URL, target?: string, features?: string) => {
    const href = url === undefined ? null : routeWindowOpen({ url: String(url), here: hereHref() });
    if (!href) return webOpen.call(window, url, target, features);
    openInBrowser(href);
    return null;
  };

  const urlOpen = App.addListener("appUrlOpen", ({ url }) => {
    const path = appLinkPath(url);
    if (path) go(path);
  });

  void App.getLaunchUrl()
    .then((launch) => {
      const path = launch?.url ? appLinkPath(launch.url) : null;
      if (path && launch && firstTimeFor(launch.url)) go(path);
    })
    .catch(() => {});

  void StatusBar.setStyle({ style: Style.Default }).catch(() => {});
  void SplashScreen.hide({ fadeOutDuration: 200 }).catch(() => {});

  return () => {
    document.removeEventListener("click", onClick, true);
    window.open = webOpen;
    void urlOpen.then((handle) => handle.remove()).catch(() => {});
  };
}
