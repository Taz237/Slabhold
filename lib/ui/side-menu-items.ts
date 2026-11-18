import { SIDE_MENU_ITEMS } from "./side-menu";

export type SideMenuItem = (typeof SIDE_MENU_ITEMS)[number];

/**
 * The drawer's main items. Quick Comp has no item of its own any more: its search is on the Scan
 * screen. Its own module, so pages that import only constants from side-menu.ts (privacy lists,
 * More, the admin link) don't ship it.
 */
export function sideMenuItems(): readonly SideMenuItem[] {
  return SIDE_MENU_ITEMS;
}
