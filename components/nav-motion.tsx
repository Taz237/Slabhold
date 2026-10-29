"use client";

import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useRef } from "react";
import {
  RESTORE_TIMEOUT_MS,
  canGoBack,
  edgeBackdrop,
  edgeReleaseGoesBack,
  edgeSwipeAllowed,
  edgeSwipeClaims,
  navKind,
  restoreStep,
  routeStep,
  startStack,
  type NavIntent,
  type NavKind,
  type NavStack,
} from "@/lib/ui/nav-motion";

/** The page column the shell renders. The edge swipe moves it. */
export const PAGE_SELECTOR = "main[data-page]";

const REDUCED = "(prefers-reduced-motion: reduce)";
const SNAPSHOT_LIMIT = 6;
const SETTLE_MS = 260;

type Snapshot = { node: HTMLElement; scrollY: number; top: number };

function hereHref() {
  return `${window.location.pathname}${window.location.search}`;
}

function isStandalone() {
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true || window.matchMedia("(display-mode: standalone)").matches;
}

function reducedMotion() {
  return window.matchMedia(REDUCED).matches;
}

function maxScroll() {
  const root = document.scrollingElement ?? document.documentElement;
  return Math.max(0, root.scrollHeight - window.innerHeight);
}

function setNav(kind: NavKind) {
  document.documentElement.dataset.nav = kind;
}

/**
 * Scroll back to a saved spot. A page that is still filling in (a feed
 * drawing from memory, images sizing) gets a few frames to grow. Any touch,
 * wheel or key from the reader stops it.
 */
function restoreScroll(target: number, current: { current: (() => void) | null }) {
  current.current?.();
  const started = performance.now();
  let frame = 0;
  const stop = () => {
    window.cancelAnimationFrame(frame);
    window.removeEventListener("touchstart", stop);
    window.removeEventListener("wheel", stop);
    window.removeEventListener("keydown", stop);
    if (current.current === stop) current.current = null;
  };
  const step = () => {
    const room = maxScroll();
    window.scrollTo(0, Math.min(target, room));
    if (restoreStep({ target, maxScroll: room }) === "scroll") return stop();
    if (performance.now() - started > RESTORE_TIMEOUT_MS) return stop();
    frame = window.requestAnimationFrame(step);
  };
  current.current = stop;
  window.addEventListener("touchstart", stop, { passive: true });
  window.addEventListener("wheel", stop, { passive: true });
  window.addEventListener("keydown", stop);
  step();
}

/** Set while goBackWithMotion waits for the router to draw the page it went back to. */
let manualBack: (() => void) | null = null;

/**
 * history.back() with the slide-back motion. The router draws a popped page
 * outside React's view transitions, so this starts one by hand: the current
 * page is captured, Back runs inside the transition, and the route effect
 * names the page it lands on. Falls back to a plain Back without the API.
 */
export function goBackWithMotion(back: () => void) {
  const start = (document as Document & {
    startViewTransition?: (update: () => Promise<void>) => { finished: Promise<void> };
  }).startViewTransition?.bind(document);
  const page = document.querySelector<HTMLElement>(PAGE_SELECTOR);
  if (!start || !page || reducedMotion() || manualBack) {
    back();
    return;
  }
  page.style.setProperty("view-transition-name", "page-back-old");
  setNav("back");
  const transition = start(
    () =>
      new Promise<void>((resolve) => {
        const timer = window.setTimeout(done, 1000);
        function done() {
          window.clearTimeout(timer);
          manualBack = null;
          resolve();
        }
        manualBack = done;
        back();
      }),
  );
  void transition.finished.finally(() => {
    document.querySelector<HTMLElement>(PAGE_SELECTOR)?.style.removeProperty("view-transition-name");
  });
}

/** A sheet or menu is open. Closed ones stay mounted but inert or hidden. */
function modalOpen() {
  return [...document.querySelectorAll<HTMLElement>("[role='dialog'][aria-modal='true']")].some(
    (dialog) => !dialog.closest("[inert]") && getComputedStyle(dialog).visibility !== "hidden",
  );
}

/** An in-app link or post row the tap is about to open, or null. */
function tappedHref(event: MouseEvent): string | null {
  if (event.defaultPrevented || event.button !== 0) return null;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
  const target = event.target instanceof Element ? event.target : null;
  const link = target?.closest<HTMLElement>("a[href], [data-nav-href]");
  if (!link) return null;
  if (link instanceof HTMLAnchorElement) {
    if (link.target && link.target !== "_self") return null;
    if (link.hasAttribute("download")) return null;
    const url = new URL(link.href, window.location.href);
    if (url.origin !== window.location.origin) return null;
    return `${url.pathname}${url.search}`;
  }
  const href = link.dataset.navHref;
  return href && href.startsWith("/") ? href : null;
}

/**
 * Route motion for the whole app. Tags each page change on <html> so the
 * view-transition CSS slides or fades it, keeps an in-app back stack,
 * puts the scroll back where you were on Back, and in the home-screen app
 * adds an iOS-style back swipe from the left edge of pushed screens.
 */
export function NavMotion() {
  const pathname = usePathname() || "/";
  const stackRef = useRef<NavStack | null>(null);
  const currentRef = useRef<string | null>(null);
  /** How the next route change started: a tap, or what the Navigation API reported. */
  const intent = useRef<{ type: NavIntent; href: string | null; back?: boolean }>({ type: null, href: null });
  const positions = useRef(new Map<string, number>());
  const snapshots = useRef(new Map<string, Snapshot>());
  const swipeDone = useRef(false);
  const cleanupSwipe = useRef<(() => void) | null>(null);
  const clearNav = useRef<number | null>(null);
  const stopRestore = useRef<(() => void) | null>(null);

  // Route change. Runs in the same commit as the new page, before the
  // view transition paints its new snapshot.
  useLayoutEffect(() => {
    const next = hereHref();
    const previous = currentRef.current;
    currentRef.current = next;
    if (!stackRef.current || previous === null) {
      stackRef.current = startStack(next);
      return;
    }
    if (previous === next) return;
    const said = intent.current;
    intent.current = { type: null, href: null };
    const type = said.href === null || said.href === next ? said.type : null;
    const step = routeStep(stackRef.current, next, swipeDone.current ? "traverse" : type);
    stackRef.current = step.stack;
    const pop = step.direction !== "push";
    // A back arrow that links to the parent page still slides back.
    const direction = said.back && type === "push" ? "back" : step.direction;

    const kind: NavKind = swipeDone.current
      ? "none"
      : navKind({ from: previous, to: next, direction });
    swipeDone.current = false;
    setNav(kind);
    if (clearNav.current !== null) window.clearTimeout(clearNav.current);
    clearNav.current = window.setTimeout(() => {
      clearNav.current = null;
      delete document.documentElement.dataset.nav;
    }, 700);

    cleanupSwipe.current?.();
    cleanupSwipe.current = null;
    if (pop) restoreScroll(positions.current.get(next) ?? 0, stopRestore);
    // A Back started by goBackWithMotion: name the new page and let the transition capture it.
    if (manualBack) {
      document.querySelector<HTMLElement>(PAGE_SELECTOR)?.style.setProperty("view-transition-name", "page-back-new");
      manualBack();
    }
  }, [pathname]);

  // Scroll memory, the push/traverse hint, and the early nav tag on taps.
  useEffect(() => {
    const restoring = stopRestore;
    const history = window.history;
    const before = history.scrollRestoration;
    history.scrollRestoration = "manual";

    let saveFrame = 0;
    function onScroll() {
      if (saveFrame) return;
      saveFrame = window.requestAnimationFrame(() => {
        saveFrame = 0;
        const href = hereHref();
        // Only while the URL still matches the page on screen.
        if (href === currentRef.current) positions.current.set(href, window.scrollY);
      });
    }

    // Where supported, the Navigation API says push or traverse before the
    // router draws anything. Elsewhere a tapped link marks a push, and the
    // stack recognizes Back.
    type NavigateEvent = Event & { navigationType?: string; destination?: { url?: string } };
    const navigation = (window as Window & { navigation?: EventTarget }).navigation;
    function onNavigate(event: Event) {
      const { navigationType, destination } = event as NavigateEvent;
      if (navigationType !== "push" && navigationType !== "replace" && navigationType !== "traverse") return;
      const from = currentRef.current;
      if (from !== null) positions.current.set(from, window.scrollY);
      let href: string | null = null;
      if (destination?.url) {
        const url = new URL(destination.url);
        href = `${url.pathname}${url.search}`;
      }
      // The router also rewrites history state in place; that is not a move.
      if (navigationType !== "traverse" && href === hereHref()) return;
      intent.current = { type: navigationType, href: navigationType === "traverse" ? null : href };
    }

    function onClick(event: MouseEvent) {
      const to = tappedHref(event);
      const from = currentRef.current;
      if (!to || from === null || to === from) return;
      positions.current.set(from, window.scrollY);
      const back = event.target instanceof Element && Boolean(event.target.closest("[data-nav-back]"));
      intent.current = { type: "push", href: to, back };
      setNav(navKind({ from, to, direction: back ? "back" : "push" }));
      if (!isStandalone()) return;
      const page = document.querySelector<HTMLElement>(PAGE_SELECTOR);
      if (!page) return;
      const node = page.cloneNode(true) as HTMLElement;
      node.removeAttribute("data-page");
      const top = page.getBoundingClientRect().top + window.scrollY;
      const saved = snapshots.current;
      saved.delete(from);
      saved.set(from, { node, scrollY: window.scrollY, top });
      while (saved.size > SNAPSHOT_LIMIT) {
        const oldest = saved.keys().next().value;
        if (oldest === undefined) break;
        saved.delete(oldest);
      }
    }

    // iOS only paints :active press states when the page listens for touches.
    const noop = () => {};
    document.addEventListener("touchstart", noop, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    navigation?.addEventListener("navigate", onNavigate);
    document.addEventListener("click", onClick, true);
    return () => {
      history.scrollRestoration = before;
      window.cancelAnimationFrame(saveFrame);
      document.removeEventListener("touchstart", noop);
      window.removeEventListener("scroll", onScroll);
      navigation?.removeEventListener("navigate", onNavigate);
      document.removeEventListener("click", onClick, true);
      restoring.current?.();
    };
  }, []);

  // Back swipe from the left edge, home-screen app only. Safari keeps its own.
  useEffect(() => {
    if (!isStandalone()) return;

    let tracking = false;
    let claimed = false;
    let startX = 0;
    let startY = 0;
    let deltaX = 0;
    let frame = 0;
    let samples: Array<{ x: number; t: number }> = [];
    let page: HTMLElement | null = null;
    let behind: HTMLDivElement | null = null;
    let dim: HTMLDivElement | null = null;

    function paint() {
      frame = 0;
      if (!page) return;
      const width = window.innerWidth;
      const x = Math.max(0, deltaX);
      const { offsetRatio, dim: shade } = edgeBackdrop(x / width);
      page.style.transform = `translate3d(${x}px, 0, 0)`;
      if (behind) behind.style.transform = `translate3d(${offsetRatio * width}px, 0, 0)`;
      if (dim) dim.style.opacity = String(shade);
    }

    function schedule() {
      if (!frame) frame = window.requestAnimationFrame(paint);
    }

    function buildBehind(): HTMLDivElement {
      const layer = document.createElement("div");
      layer.setAttribute("aria-hidden", "true");
      layer.inert = true;
      layer.dataset.swipeBehind = "";
      layer.style.cssText =
        "position:fixed;inset:0;z-index:5;overflow:hidden;pointer-events:none;background:var(--background);will-change:transform;";
      const shot = currentRef.current ? snapshots.current.get(previousHref() ?? "") : undefined;
      if (shot) {
        const copy = shot.node.cloneNode(true) as HTMLElement;
        copy.style.position = "absolute";
        copy.style.left = "0";
        copy.style.right = "0";
        copy.style.top = `${shot.top - shot.scrollY}px`;
        layer.appendChild(copy);
      }
      const shade = document.createElement("div");
      shade.style.cssText = "position:absolute;inset:0;background:#000;opacity:0.28;";
      layer.appendChild(shade);
      dim = shade;
      document.body.appendChild(layer);
      return layer;
    }

    function previousHref(): string | null {
      const stack = stackRef.current;
      if (!stack || stack.index === 0) return null;
      return stack.entries[stack.index - 1] ?? null;
    }

    function claim() {
      page = document.querySelector<HTMLElement>(PAGE_SELECTOR);
      if (!page) return false;
      claimed = true;
      behind = buildBehind();
      page.style.willChange = "transform";
      page.style.zIndex = "10";
      page.style.backgroundColor = "var(--background)";
      page.style.boxShadow = "-12px 0 32px -14px rgb(0 0 0 / 0.45)";
      page.style.transition = "none";
      if (behind) behind.style.transition = "none";
      return true;
    }

    function reset() {
      if (page) {
        page.style.transform = "";
        page.style.transition = "";
        page.style.willChange = "";
        page.style.zIndex = "";
        page.style.backgroundColor = "";
        page.style.boxShadow = "";
      }
      behind?.remove();
      page = null;
      behind = null;
      dim = null;
    }

    function settle(goBack: boolean) {
      const target = page;
      const layer = behind;
      if (!target) return reset();
      const width = window.innerWidth;
      const ms = reducedMotion() ? 0 : SETTLE_MS;
      const curve = `${ms}ms cubic-bezier(0.2, 0.8, 0.2, 1)`;
      target.style.transition = `transform ${curve}`;
      if (layer) layer.style.transition = `transform ${curve}`;
      if (dim) dim.style.transition = `opacity ${curve}`;
      deltaX = goBack ? width : 0;
      paint();
      const done = () => {
        if (!goBack) return reset();
        // Leave the page off screen and the one behind showing until the
        // router swaps them, so nothing flashes. The route effect cleans up.
        cleanupSwipe.current = reset;
        swipeDone.current = true;
        setNav("none");
        window.history.back();
        window.setTimeout(() => {
          if (cleanupSwipe.current !== reset) return;
          cleanupSwipe.current = null;
          swipeDone.current = false;
          reset();
        }, 1500);
      };
      if (ms === 0) done();
      else window.setTimeout(done, ms);
    }

    function stopWatching() {
      window.removeEventListener("touchmove", onTouchMove);
    }

    function onTouchStart(event: TouchEvent) {
      stopWatching();
      tracking = false;
      claimed = false;
      if (event.touches.length !== 1 || page) return;
      const touch = event.touches[0];
      const stack = stackRef.current;
      if (
        !edgeSwipeAllowed({
          standalone: true,
          pathname: window.location.pathname,
          canGoBack: Boolean(stack && canGoBack(stack)) && window.history.length > 1,
          startX: touch.clientX,
        })
      ) {
        return;
      }
      if (modalOpen()) return;
      tracking = true;
      startX = touch.clientX;
      startY = touch.clientY;
      deltaX = 0;
      samples = [{ x: touch.clientX, t: event.timeStamp }];
      window.addEventListener("touchmove", onTouchMove, { passive: false });
    }

    function onTouchMove(event: TouchEvent) {
      if (!tracking || event.touches.length !== 1) return;
      const touch = event.touches[0];
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;
      if (!claimed) {
        const decision = edgeSwipeClaims(dx, dy);
        if (decision === "release") {
          tracking = false;
          stopWatching();
          return;
        }
        if (decision === "wait" || !claim()) return;
      }
      if (event.cancelable) event.preventDefault();
      deltaX = dx;
      samples.push({ x: touch.clientX, t: event.timeStamp });
      if (samples.length > 5) samples.shift();
      schedule();
    }

    function onTouchEnd() {
      stopWatching();
      if (!tracking) return;
      tracking = false;
      if (!claimed) return;
      claimed = false;
      const first = samples[0];
      const last = samples[samples.length - 1];
      const elapsed = first && last ? last.t - first.t : 0;
      const velocity = first && last && elapsed > 0 ? (last.x - first.x) / elapsed : 0;
      settle(edgeReleaseGoesBack({ deltaX, width: window.innerWidth, velocity }));
    }

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchend", onTouchEnd);
    window.addEventListener("touchcancel", onTouchEnd);
    return () => {
      stopWatching();
      window.cancelAnimationFrame(frame);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchEnd);
      reset();
    };
  }, []);

  return null;
}
