/** Finger travel, in px, before a pull at the top of the page refreshes. */
export const PULL_THRESHOLD_PX = 70;

export type PullPhase = "idle" | "pulling" | "refresh";

export type PullGesture = {
  /** Coarse / touch pointer. Desktop fine pointers stay idle. */
  touch: boolean;
  scrollTop: number;
  /** Positive when the finger moves down the screen. */
  deltaY: number;
  deltaX: number;
  refreshing: boolean;
};

/**
 * A pull refreshes only from the top of a touch gesture.
 * Any other movement is idle so the page can scroll and Safari can bounce.
 */
export function pullPhase(gesture: PullGesture): PullPhase {
  if (!gesture.touch || gesture.refreshing) return "idle";
  if (gesture.scrollTop > 0) return "idle";
  if (gesture.deltaY <= 0) return "idle";
  if (Math.abs(gesture.deltaX) > gesture.deltaY) return "idle";
  if (gesture.deltaY >= PULL_THRESHOLD_PX) return "refresh";
  return "pulling";
}

/** Own the gesture only while a downward pull is in progress. */
export function shouldClaimPull(phase: PullPhase): boolean {
  return phase === "pulling" || phase === "refresh";
}

export type TabPress = "navigate" | "scroll-top" | "refresh";

/** Already-active tab: scroll up, or refresh when the page is already at the top. */
export function activeTabAction(input: { onThisScreen: boolean; scrollTop: number }): TabPress {
  if (!input.onThisScreen) return "navigate";
  if (input.scrollTop > 0) return "scroll-top";
  return "refresh";
}

/** True when this bottom tab already shows the screen it links to. */
export function isCurrentTabScreen(pathname: string, href: string, username: string | null): boolean {
  const cut = pathname.split("?")[0]?.split("#")[0] ?? "/";
  const path = cut.length > 1 && cut.endsWith("/") ? cut.slice(0, -1) : cut || "/";
  if (href === "/profile") {
    if (path === "/profile") return true;
    if (!username) return false;
    return path.toLowerCase() === `/u/${username.toLowerCase()}`;
  }
  return path === href;
}

type Refresh = () => void;

const listeners = new Set<Refresh>();

export function onPageRefresh(listener: Refresh): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Run every mounted pull-to-refresh. False when the page has none. */
export function requestPageRefresh(): boolean {
  if (listeners.size === 0) return false;
  for (const listener of listeners) listener();
  return true;
}
