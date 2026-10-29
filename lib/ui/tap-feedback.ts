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

/** Which route skeleton to show at once for a tap on this href, if any. */
export function pendingSkeletonFor(href: string): "card" | null {
  const path = href.split(/[?#]/, 1)[0];
  return CARD_PAGE.test(path) ? "card" : null;
}

let pendingTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * Show a route's skeleton now, for a navigation that is about to start.
 * Only for a skeleton we have, and not for the page already on screen.
 */
export function startPendingNav(win: Window, href: string): boolean {
  const url = new URL(href, win.location.href);
  const kind = pendingSkeletonFor(url.pathname);
  if (!kind || url.origin !== win.location.origin || url.pathname === win.location.pathname) return false;
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
  return node.closest<HTMLElement>("a[href], [data-nav-href]");
}

/** The card tile link a plain click will open in this tab, or null. */
function tileLinkHref(event: MouseEvent): string | null {
  if (event.defaultPrevented || event.button !== 0) return null;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
  const node = event.target as Element | null;
  if (!node || typeof node.closest !== "function") return null;
  const link = node.closest<HTMLAnchorElement>("[data-tile] a[href]");
  if (!link || (link.target && link.target !== "_self") || link.hasAttribute("download")) return null;
  return link.href;
}

/**
 * Press state on pointerdown, and the card skeleton on a card tile's click.
 * Listeners are passive or capture-only and never cancel the event, so the
 * Link still does the one navigation. Returns the cleanup.
 */
export function installTapFeedback(win: Window): () => void {
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
    const href = tileLinkHref(event);
    if (href) startPendingNav(win, href);
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
