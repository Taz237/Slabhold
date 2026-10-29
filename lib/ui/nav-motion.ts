/**
 * Route motion: which way a page change slides, the in-app back stack, the
 * standalone edge swipe, and where to put the scroll when you come back.
 * Pure functions only. The browser wiring is in components/nav-motion.tsx.
 */

/** Screens on the bottom bar or the top bar. Moving between them cross-fades. */
export const ROOT_SCREENS = [
  "/",
  "/leaderboard",
  "/cards/new",
  "/collection",
  "/portfolio",
  "/messages",
  "/notifications",
  "/search",
  "/profile",
] as const;

function cleanPath(path: string): string {
  const cut = path.split("?")[0]?.split("#")[0] ?? "/";
  if (cut.length > 1 && cut.endsWith("/")) return cut.slice(0, -1);
  return cut || "/";
}

/** True for a tab root. Everything else (post, profile, card, DM thread, settings page) is pushed. */
export function isRootScreen(path: string): boolean {
  return (ROOT_SCREENS as readonly string[]).includes(cleanPath(path));
}

/**
 * forward: a pushed screen slides in from the right.
 * back: the screen slides off to the right.
 * fade: a quick cross-fade between tabs.
 * none: no animation (same page, or the swipe already moved it).
 */
export type NavKind = "forward" | "back" | "fade" | "none";

export function navKind(input: { from: string; to: string; direction: "push" | "back" | "forward" }): NavKind {
  const from = cleanPath(input.from);
  const to = cleanPath(input.to);
  if (from === to) return "none";
  const fromRoot = isRootScreen(from);
  const toRoot = isRootScreen(to);
  if (input.direction === "back") return fromRoot && toRoot ? "fade" : "back";
  if (toRoot) return "fade";
  return "forward";
}

/** In-app history, so a back swipe only shows when there is a page to go back to. */
export type NavStack = { entries: readonly string[]; index: number };

export function startStack(href: string): NavStack {
  return { entries: [href], index: 0 };
}

export function pushEntry(stack: NavStack, href: string): NavStack {
  if (stack.entries[stack.index] === href) return stack;
  return { entries: [...stack.entries.slice(0, stack.index + 1), href], index: stack.index + 1 };
}

/** Browser back or forward. An entry we never saw starts a new stack and reads as back. */
export function popEntry(stack: NavStack, href: string): { stack: NavStack; direction: "back" | "forward" } {
  if (stack.index > 0 && stack.entries[stack.index - 1] === href) {
    return { stack: { ...stack, index: stack.index - 1 }, direction: "back" };
  }
  if (stack.entries[stack.index + 1] === href) {
    return { stack: { ...stack, index: stack.index + 1 }, direction: "forward" };
  }
  return { stack: startStack(href), direction: "back" };
}

/** What the browser said this navigation was, when it said anything. */
export type NavIntent = "push" | "replace" | "traverse" | null;

/**
 * Apply one route change to the stack. The router can draw the new page
 * before any popstate listener runs, so Back is also recognized from the
 * stack itself: landing on the entry just below is Back unless we know it
 * was a fresh push (a tapped link, or the Navigation API said so).
 */
export function routeStep(
  stack: NavStack,
  href: string,
  intent: NavIntent,
): { stack: NavStack; direction: "push" | "back" | "forward" } {
  if (intent === "push") return { stack: pushEntry(stack, href), direction: "push" };
  if (intent === "replace") {
    const entries = [...stack.entries];
    entries[stack.index] = href;
    return { stack: { entries, index: stack.index }, direction: "push" };
  }
  const known =
    (stack.index > 0 && stack.entries[stack.index - 1] === href) || stack.entries[stack.index + 1] === href;
  if (intent === "traverse" || known) return popEntry(stack, href);
  return { stack: pushEntry(stack, href), direction: "push" };
}

function pathOf(href: string): string {
  return href.split("?")[0]?.split("#")[0] ?? href;
}

/**
 * A page that swaps only its query in place (history.replaceState, like the
 * /moving-today tabs) keeps its pathname, so the route effect never runs.
 * Returns the stack with the current entry renamed to the URL on screen, or
 * null when there is nothing to sync.
 */
export function querySync(stack: NavStack, current: string, here: string): NavStack | null {
  if (current === here || pathOf(current) !== pathOf(here)) return null;
  return routeStep(stack, here, "replace").stack;
}

export function canGoBack(stack: NavStack): boolean {
  return stack.index > 0;
}

/** Touches that start this close to the left edge can swipe back. */
export const EDGE_START_PX = 20;

/** Past this share of the screen width, letting go goes back. */
export const EDGE_COMMIT_RATIO = 0.35;

/** A flick this fast (px per ms) goes back even when it is short. */
export const EDGE_FLICK_VELOCITY = 0.45;

/** Sideways travel before the swipe takes over from a vertical scroll. */
export const EDGE_ARM_PX = 10;

/**
 * The swipe is ours only in the home-screen app (Safari has its own), only
 * on a pushed screen with somewhere to go back to, and only from the edge.
 */
export function edgeSwipeAllowed(input: {
  standalone: boolean;
  pathname: string;
  canGoBack: boolean;
  startX: number;
}): boolean {
  if (!input.standalone || !input.canGoBack) return false;
  if (isRootScreen(input.pathname)) return false;
  return input.startX >= 0 && input.startX <= EDGE_START_PX;
}

/** Once armed, a mostly sideways move to the right claims the gesture. */
export function edgeSwipeClaims(deltaX: number, deltaY: number): "wait" | "claim" | "release" {
  if (Math.abs(deltaY) > EDGE_ARM_PX && Math.abs(deltaY) > Math.abs(deltaX)) return "release";
  if (deltaX < -EDGE_ARM_PX) return "release";
  if (deltaX > EDGE_ARM_PX && deltaX > Math.abs(deltaY)) return "claim";
  return "wait";
}

/** Letting go: far enough, or a quick flick to the right. A flick back to the left cancels. */
export function edgeReleaseGoesBack(input: { deltaX: number; width: number; velocity: number }): boolean {
  if (input.width <= 0 || input.deltaX <= 0) return false;
  if (input.velocity <= -EDGE_FLICK_VELOCITY / 2) return false;
  if (input.velocity >= EDGE_FLICK_VELOCITY) return true;
  return input.deltaX / input.width >= EDGE_COMMIT_RATIO;
}

/** How the page behind moves and dims while the top page follows the finger. */
export function edgeBackdrop(progress: number): { offsetRatio: number; dim: number } {
  const p = Math.min(1, Math.max(0, progress));
  return { offsetRatio: -0.3 * (1 - p), dim: 0.28 * (1 - p) };
}

/**
 * Where to scroll on return. Waits while the page is still shorter than the
 * saved spot, so a feed that renders in a moment still lands exactly.
 */
export function restoreStep(input: { target: number; maxScroll: number }): "scroll" | "wait" {
  if (input.target <= 0) return "scroll";
  return input.maxScroll >= input.target ? "scroll" : "wait";
}

/** Give up waiting for content after this long and keep the closest spot. */
export const RESTORE_TIMEOUT_MS = 1500;
