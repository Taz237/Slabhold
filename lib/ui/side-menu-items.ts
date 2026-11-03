import { SIDE_MENU_ITEMS } from "./side-menu";

export type SideMenuItem = (typeof SIDE_MENU_ITEMS)[number] | { href: "/comp"; label: "Quick Comp" };

/**
 * The drawer's main items for this build. With Quick Comp on, it sits right
 * above Add card. Its own module, so pages that import only constants from
 * side-menu.ts (privacy lists, More, the admin link) don't ship it.
 */
export function sideMenuItems(quickComp: boolean): readonly SideMenuItem[] {
  if (!quickComp) return SIDE_MENU_ITEMS;
  return SIDE_MENU_ITEMS.flatMap((item): SideMenuItem[] =>
    item.href === "/cards/new" ? [{ href: "/comp", label: "Quick Comp" }, item] : [item],
  );
}
