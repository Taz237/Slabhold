/**
 * Feedback on the press itself, before the router has anything to show.
 * Only DOM attributes change here, never React state, so a tap does no
 * render work: CSS draws `[data-pressed]` and `html[data-nav-pending]`.
 */

/** Past this many px of travel, a press is a scroll and lets go. */
const PRESS_SLOP_PX = 10;

/** A pending skeleton that never got its route clears itself. */
const PENDING_TIMEOUT_MS = 8000;

const CARD_PAGE = /^\/u\/[^/?#]+\/cards\/[^/?#]+$/;
const POST_PAGE = /^\/posts\/[^/?#]+$/;
const PROFILE_PAGE = /^\/u\/[^/?#]+$/;

export type PendingKind = "card" | "post" | "profile";

/** Which route skeleton to show at once for a tap on this href, if any. */
export function pendingSkeletonFor(href: string): PendingKind | null {
  const path = href.split(/[?#]/, 1)[0];
  if (CARD_PAGE.test(path)) return "card";
  if (POST_PAGE.test(path)) return "post";
  if (PROFILE_PAGE.test(path)) return "profile";
  return null;
}

let pendingTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * Show a route's skeleton now, for a navigation that is about to start.
 * Only for a skeleton we have, and not for the page already on screen.
 */
export function startPendingNav(win: Window, href: string, skip?: (path: string) => boolean): boolean {
  const url = new URL(href, win.location.href);
  const kind = pendingSkeletonFor(url.pathname);
  if (!kind || url.origin !== win.location.origin || url.pathname === win.location.pathname) return false;
  if (skip?.(url.pathname)) return false;
  const doc = win.document;
  doc.documentElement.dataset.navPending = kind;
  clearTimeout(pendingTimer);
  pendingTimer = setTimeout(() => clearPendingNav(doc), PENDING_TIMEOUT_MS);
  return true;
}

/** Drop the pending skeleton. True when one was showing. */
export function clearPendingNav(doc: Document): boolean {
  const root = doc.documentElement;
  if (!root.dataset.navPending) return false;
  delete root.dataset.navPending;
  return true;
}

function pressable(target: EventTarget | null): HTMLElement | null {
  const node = target as Element | null;
  if (!node || typeof node.closest !== "function") return null;
  // The nearest control wins: a button inside a post row presses the button, not the row.
  const hit = node.closest<HTMLElement>("a[href], button, [data-nav-href]");
  if (hit?.tagName === "BUTTON" && (hit as HTMLButtonElement).disabled) return null;
  return hit;
}

/** Anything a tap lands on that acts on its own. A post row opens only when the tap missed all of these. */
const ACTS = "a[href], button, [role='button'], input, textarea, select, summary, label, [data-nav-href]";

/**
 * The page a plain click will open in this tab, or null: a link, or a post
 * row (`data-nav-href`) tapped outside its own links and buttons. A card
 * page counts only from a card tile, as before.
 */
function tappedPageHref(event: MouseEvent): string | null {
  if (event.defaultPrevented || event.button !== 0) return null;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
  const node = event.target as Element | null;
  if (!node || typeof node.closest !== "function") return null;
  const hit = node.closest<HTMLElement>(ACTS);
  if (!hit) return null;
  let href: string | null = null;
  if (hit.tagName === "A") {
    const link = hit as HTMLAnchorElement;
    if ((link.target && link.target !== "_self") || link.hasAttribute("download")) return null;
    href = link.href;
  } else if (hit.tagName !== "BUTTON") {
    href = hit.dataset.navHref ?? null;
  }
  if (!href) return null;
  const kind = pendingSkeletonFor(new URL(href, node.ownerDocument.location.href).pathname);
  if (kind === "card" && !hit.closest("[data-tile]")) return null;
  return kind ? href : null;
}

/**
 * Press state on pointerdown, and the page's skeleton on the click that
 * opens a card, a post or a profile. Listeners are passive or capture-only
 * and never cancel the event, so the Link still does the one navigation.
 * `skip` names screens that open without a slide (your own profile is a tab).
 * Returns the cleanup.
 */
export function installTapFeedback(win: Window, options: { skip?: (path: string) => boolean } = {}): () => void {
  const doc = win.document;
  let pressed: HTMLElement | null = null;
  let startX = 0;
  let startY = 0;

  function release() {
    pressed?.removeAttribute("data-pressed");
    pressed = null;
  }

  function onPointerDown(event: PointerEvent) {
    release();
    if (event.button !== 0) return;
    const target = pressable(event.target);
    if (!target) return;
    pressed = target;
    startX = event.clientX;
    startY = event.clientY;
    target.setAttribute("data-pressed", "");
  }

  function onPointerMove(event: PointerEvent) {
    if (!pressed) return;
    if (Math.hypot(event.clientX - startX, event.clientY - startY) > PRESS_SLOP_PX) release();
  }

  function onClick(event: MouseEvent) {
    const href = tappedPageHref(event);
    if (href) startPendingNav(win, href, options.skip);
  }

  function onPopState() {
    release();
    clearPendingNav(doc);
  }

  const passive = { capture: true, passive: true } as const;
  doc.addEventListener("pointerdown", onPointerDown, passive);
  doc.addEventListener("pointermove", onPointerMove, passive);
  doc.addEventListener("pointerup", release, passive);
  doc.addEventListener("pointercancel", release, passive);
  doc.addEventListener("click", onClick, true);
  win.addEventListener("scroll", release, { passive: true });
  win.addEventListener("popstate", onPopState);
  return () => {
    release();
    clearTimeout(pendingTimer);
    doc.removeEventListener("pointerdown", onPointerDown, passive);
    doc.removeEventListener("pointermove", onPointerMove, passive);
    doc.removeEventListener("pointerup", release, passive);
    doc.removeEventListener("pointercancel", release, passive);
    doc.removeEventListener("click", onClick, true);
    win.removeEventListener("scroll", release);
    win.removeEventListener("popstate", onPopState);
  };
}
