import { userHref } from "@/lib/social/user-href";

/** Opens the side menu on the home page. Old /more links land here. */
export const MENU_OPEN_HREF = "/?menu=open";

/** Panel width: about 80% of the screen, never wider than this. */
export const SIDE_MENU_MAX_PX = 320;

/** Leftward finger travel, in px, that closes the menu. */
export const SWIPE_CLOSE_PX = 60;

/** Main items, top to bottom. Achievements shows only with hosted accounts. */
export const SIDE_MENU_ITEMS = [
  { href: "/profile", label: "Profile" },
  { href: "/collection", label: "Collection" },
  { href: "/achievements", label: "Achievements" },
  { href: "/messages", label: "Messages" },
  { href: "/cards/new", label: "Add card" },
  { href: "/leaderboard", label: "Leaderboard" },
] as const;

/** Below the divider. Log out is a button after these. */
export const SIDE_MENU_SETTINGS = [
  { href: "/settings/privacy", label: "Privacy & safety" },
  { href: "/settings/collecting", label: "Collecting settings" },
  { href: "/about", label: "About" },
  { href: "/privacy", label: "Privacy policy" },
  { href: "/terms", label: "Terms" },
] as const;

/** Replays the quick tour. A button after the settings links. */
export const TAKE_TOUR_LABEL = "Take the tour";

/** The menu slides out (200ms) before the tour starts. */
export const TOUR_AFTER_CLOSE_MS = 240;

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
