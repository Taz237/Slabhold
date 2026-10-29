import { userHref } from "@/lib/social/user-href";

/** Finger travel, in px, before a pull at the top of the page refreshes. */
export const PULL_THRESHOLD_PX = 70;

/**
 * Downward travel ignored before the pull calls preventDefault.
 * A smaller wobble must not freeze an iOS scroll or a sideways swipe.
 */
export const PULL_ARM_PX = 8;

/** The pull never shows further than this, however far the finger goes. */
export const PULL_MAX_PX = 120;

/** Where the indicator waits while the refresh runs. */
export const PULL_HOLD_PX = 56;

/**
 * Rubber band: close to 1:1 at first, then heavier the further you pull.
 * About 53px of travel shows at the 70px trigger, and it tops out near 120px.
 */
export function rubberBand(deltaY: number): number {
  if (deltaY <= 0) return 0;
  return PULL_MAX_PX * (1 - Math.exp(-deltaY / PULL_MAX_PX));
}

/** 0 to 1 on the way to the trigger. Drives the mark's turn and fade. */
export function pullProgress(deltaY: number): number {
  if (deltaY <= 0) return 0;
  return Math.min(1, deltaY / PULL_THRESHOLD_PX);
}

/** True on the one move that crosses the trigger, for the "click" moment. */
export function crossedTrigger(previousDeltaY: number, deltaY: number): boolean {
  return previousDeltaY < PULL_THRESHOLD_PX && deltaY >= PULL_THRESHOLD_PX;
}

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

/** Start the pull only after the finger has moved down past the slop. */
export function shouldStartPull(phase: PullPhase, deltaY: number): boolean {
  return deltaY > PULL_ARM_PX && shouldClaimPull(phase);
}

/** Modified clicks open a new tab or window. The active tab must not swallow them. */
export function keepsBrowserTabGesture(input: {
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
}): boolean {
  return input.metaKey || input.ctrlKey || input.shiftKey;
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
    return path.toLowerCase() === userHref(username).toLowerCase();
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
