import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { BOTTOM_NAV, SCAN_TAB_HREF, bottomNavLabelsFit } from "./bottom-nav";
import { SIDE_MENU_ITEMS } from "./side-menu";
import { sideMenuItems } from "./side-menu-items";

/** One Scan flow: Quick Comp lives on the Scan screen, Catalog takes its slot on the bar. */
describe("the nav with one Scan flow", () => {
  it("the bar is Home, Catalog, Scan, Collection, Messages: no Quick Comp, no Add card tab", () => {
    assert.deepEqual(
      BOTTOM_NAV.map((tab) => [tab.href, tab.label]),
      [
        ["/", "Home"],
        ["/catalog", "Catalog"],
        ["/scan", "Scan"],
        ["/collection", "Collection"],
        ["/messages", "Messages"],
      ],
    );
    assert.equal(SCAN_TAB_HREF, "/scan");
    assert.equal(bottomNavLabelsFit(BOTTOM_NAV.map((tab) => tab.label)), true);
  });

  it("the drawer has no Catalog and no Quick Comp; Add card by hand and Leaderboard stay", () => {
    const labels: string[] = sideMenuItems().map((item) => item.label);
    assert.equal(sideMenuItems(), SIDE_MENU_ITEMS);
    assert.ok(!labels.includes("Catalog"));
    assert.ok(!labels.includes("Quick Comp"));
    assert.ok(labels.includes("Add card"));
    assert.ok(labels.includes("Leaderboard"));
  });

  it("the center Scan tab goes straight to the Scan screen: no Add card sheet in between", () => {
    const shell = readFileSync(join(process.cwd(), "components/app-shell.tsx"), "utf8");
    assert.match(shell, /if \(tab\.href === SCAN_TAB_HREF\)/);
    assert.match(shell, /aria-label="Scan"/);
    assert.doesNotMatch(shell, /openAddCardSheet\(\)/);
    assert.doesNotMatch(shell, /NEXT_PUBLIC_QUICK_COMP/);
  });
});
