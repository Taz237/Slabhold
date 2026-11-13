import { userHref } from "@/lib/social/user-href";

/** Opens the side menu on the home page. Old /more links land here. */
export const MENU_OPEN_HREF = "/?menu=open";

/** Panel width: about 80% of the screen, never wider than this. */
export const SIDE_MENU_MAX_PX = 320;

/** Leftward finger travel, in px, that closes the menu. */
export const SWIPE_CLOSE_PX = 60;

/** "Invite a collector" opens the share sheet with your invite link; it isn't a page. */
export const INVITE_MENU_HREF = "#invite";

/** Main items, top to bottom. Achievements shows only with hosted accounts. */
export const SIDE_MENU_ITEMS = [
  { href: "/profile", label: "Profile" },
  { href: "/collection", label: "Collection" },
  { href: "/achievements", label: "Achievements" },
  { href: "/messages", label: "Messages" },
  { href: "/cards/new", label: "Add card" },
  { href: "/leaderboard", label: "Leaderboard" },
  // Literals, not MOVING_TODAY_PATH/TITLE: that module also carries helpers this constants file shouldn't pull in.
  { href: "/moving-today", label: "Moving today" },
  { href: INVITE_MENU_HREF, label: "Invite a collector" },
] as const;

/** Below the divider. Log out is a button after these. */
export const SIDE_MENU_SETTINGS = [
  { href: "/settings/notifications", label: "Notifications" },
  { href: "/settings/privacy", label: "Privacy & safety" },
  { href: "/settings/invite", label: "Invite friends" },
  { href: "/settings/collecting", label: "Collecting settings" },
  { href: "/about", label: "About" },
  { href: "/privacy", label: "Privacy policy" },
  { href: "/terms", label: "Terms" },
] as const;

/** Below the settings links. Apple asks for an easy way to reach support. */
export const SIDE_MENU_SUPPORT = { href: "/support", label: "Help & support" } as const;

/** Straight to Delete account on Privacy & safety. Apple asks that it's easy to find. */
export const SIDE_MENU_DELETE = { href: "/settings/privacy#delete-account", label: "Delete account" } as const;

/** Replays the quick tour. A button after the settings links. */
export const TAKE_TOUR_LABEL = "Take the tour";

/** Opens the Add to Home Screen guide. Phones only, never inside the installed app. */
export const ADD_TO_HOME_LABEL = "Add to Home Screen";

/** The menu slides out (300ms) before the tour or the home-screen guide starts. */
export const TOUR_AFTER_CLOSE_MS = 340;

/** Admin-only. Hidden until the admin check allows them. */
export const SIDE_MENU_ADMIN = [
  { href: "/admin/reports", label: "Reports" },
  { href: "/admin/comp-flags", label: "Comp flags" },
] as const;

/** True when ?menu=open is on the URL. */
export function menuQueryOpens(search: string): boolean {
  return new URLSearchParams(search).get("menu") === "open";
}

/** A mostly sideways swipe to the left closes the menu. */
export function swipeCloses(deltaX: number, deltaY: number): boolean {
  return deltaX <= -SWIPE_CLOSE_PX && Math.abs(deltaX) > Math.abs(deltaY);
}

/** The panel follows the finger left only, never past its open spot. */
export function dragOffset(deltaX: number): number {
  return Math.min(0, deltaX);
}

/** Exact match, or a child page of the item. Profile also owns your /u/ page. */
export function menuItemActive(pathname: string, href: string, username: string | null): boolean {
  if (pathname === href || pathname.startsWith(`${href}/`)) return true;
  if (href === "/profile" && username) {
    return pathname.toLowerCase() === userHref(username).toLowerCase();
  }
  return false;
}

/** "9+" past nine, like the other count badges. */
export function countLabel(count: number): string {
  return count > 9 ? "9+" : String(count);
}

/*
 * Edge swipe to open (Home only). Same feel as the back swipe in
 * lib/ui/nav-motion.ts: the EDGE_* numbers there, copied so this constants
 * file stays light. drawer-swipe.test.ts keeps them equal.
 */

/** Touches that start this close to the left edge can pull the menu out. */
export const MENU_EDGE_PX = 20;

/** Past this share of the panel width, letting go opens (or keeps open). */
export const MENU_OPEN_RATIO = 0.35;

/** A flick this fast (px per ms) opens or closes even when it is short. */
export const MENU_FLICK_VELOCITY = 0.45;

/** How far open the panel is, 0..1, for finger travel `dx` from closed. */
export function menuDragProgress(dx: number, width: number): number {
  if (width <= 0) return 0;
  return Math.min(1, Math.max(0, dx / width));
}

/**
 * Letting go: a flick wins, otherwise it opens once past 35% from closed, and
 * an open menu closes once dragged 35% back.
 */
export function menuReleaseOpens(input: { progress: number; velocity: number; wasOpen: boolean }): boolean {
  if (input.velocity >= MENU_FLICK_VELOCITY) return true;
  if (input.velocity <= -MENU_FLICK_VELOCITY) return false;
  return input.wasOpen ? input.progress > 1 - MENU_OPEN_RATIO : input.progress > MENU_OPEN_RATIO;
}

/**
 * Only on Home: every other page keeps the far-left edge for the back swipe.
 * Never while the menu or another dialog is already open.
 */
export function menuEdgeSwipeAllowed(input: {
  pathname: string;
  startX: number;
  menuOpen: boolean;
  modalOpen: boolean;
}): boolean {
  if (input.pathname !== "/" || input.menuOpen || input.modalOpen) return false;
  return input.startX >= 0 && input.startX <= MENU_EDGE_PX;
}
