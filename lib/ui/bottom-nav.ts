/** Phone width the bottom bar must stay readable at. */
export const BOTTOM_NAV_VIEWPORT_PX = 390;

/** More than this and the labels crowd, including "Leaderboard". */
export const BOTTOM_NAV_MAX_ITEMS = 5;

/**
 * Tabs on the bar, left to right. Add card stays in the center.
 * A Value board is not a tab here. It will be a tab on /leaderboard later.
 */
export const BOTTOM_NAV = [
  { href: "/", label: "Home" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/cards/new", label: "Add card" },
  { href: "/collection", label: "Collection" },
  { href: "/messages", label: "Messages" },
] as const;

/**
 * Taken off the bar so five labels fit at 390px. The side menu opens them
 * from the avatar at the top left, like X. Settings and the old More links
 * live there too, so the bar has room for Messages and its unread badge.
 */
export const MOVED_TO_MENU = [{ href: "/profile", label: "Profile" }] as const;

/** Rough Geist 10px width. Wide enough that a passing label is not cramped. */
const LABEL_PX_PER_CHAR = 6.2;

/** Width of one label inside an equal tab slot at the phone width. */
export function labelWidthFits(
  label: string,
  tabCount: number,
  viewportPx = BOTTOM_NAV_VIEWPORT_PX,
): boolean {
  if (tabCount <= 0) return false;
  const rowPadding = 8;
  const tabPadding = 4;
  const slot = (viewportPx - rowPadding) / tabCount - tabPadding;
  return label.length * LABEL_PX_PER_CHAR <= slot;
}

/**
 * True when every label fits in an equal slot at the phone width.
 * Horizontal padding matches the bar: px-1 on the row, px-0.5 on each tab.
 */
export function bottomNavLabelsFit(
  labels: readonly string[],
  viewportPx = BOTTOM_NAV_VIEWPORT_PX,
): boolean {
  if (labels.length === 0 || labels.length > BOTTOM_NAV_MAX_ITEMS) return false;
  return labels.every((label) => labelWidthFits(label, labels.length, viewportPx));
}
