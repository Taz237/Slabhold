import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BOTTOM_NAV, QUICK_COMP_TAB, bottomNavLabelsFit, bottomNavTabs, labelWidthFits } from "./bottom-nav";
import { SIDE_MENU_ITEMS } from "./side-menu";
import { sideMenuItems } from "./side-menu-items";
import { isRootScreen, navKind } from "./nav-motion";

describe("Quick Comp in the nav lists", () => {
  it("keeps today's bar with the flag off", () => {
    assert.equal(bottomNavTabs(false), BOTTOM_NAV);
    assert.deepEqual(
      bottomNavTabs(false).map((tab) => [tab.href, tab.label]),
      BOTTOM_NAV.map((tab) => [tab.href, tab.label]),
    );
  });

  it("swaps Leaderboard for Quick Comp in slot 2 with the flag on", () => {
    const tabs = bottomNavTabs(true);
    assert.deepEqual(
      tabs.map((tab) => tab.label),
      ["Home", "Quick Comp", "Add card", "Collection", "Messages"],
    );
    assert.equal(tabs[1]?.href, "/comp");
    assert.equal(tabs[2]?.href, "/cards/new");
    assert.equal(tabs.some((tab) => tab.href === "/leaderboard"), false);
    assert.deepEqual(QUICK_COMP_TAB, { href: "/comp", label: "Quick Comp" });
  });

  it("fits the flag-on labels at 390px and 320px like Leaderboard does", () => {
    const labels = bottomNavTabs(true).map((tab) => tab.label);
    assert.equal(bottomNavLabelsFit(labels), true);
    assert.equal(labelWidthFits("Quick Comp", 5), true);
    // Never wider than the label it replaces, so 320px behaves the same.
    assert.ok("Quick Comp".length <= "Leaderboard".length);
  });

  it("keeps today's drawer with the flag off", () => {
    assert.equal(sideMenuItems(false), SIDE_MENU_ITEMS);
  });

  it("puts Quick Comp right above Add card with the flag on and keeps Leaderboard", () => {
    const items = sideMenuItems(true);
    const labels = items.map((item) => item.label);
    const quick = labels.indexOf("Quick Comp");
    assert.ok(quick >= 0);
    assert.equal(labels[quick + 1], "Add card");
    assert.equal(items[quick]?.href, "/comp");
    assert.ok(labels.includes("Leaderboard"));
    assert.equal(items.length, SIDE_MENU_ITEMS.length + 1);
  });

  it("treats /comp as a root screen only with the flag on", () => {
    // Unset in tests: /comp is a pushed screen, as before.
    assert.equal(process.env.NEXT_PUBLIC_QUICK_COMP, undefined);
    assert.equal(isRootScreen("/comp"), false);
    assert.equal(navKind({ from: "/", to: "/comp", direction: "push" }), "forward");
    process.env.NEXT_PUBLIC_QUICK_COMP = "1";
    try {
      assert.equal(isRootScreen("/comp"), true);
      assert.equal(isRootScreen("/comp/"), true);
      assert.equal(isRootScreen("/comp/abc"), false);
      assert.equal(isRootScreen("/leaderboard"), true);
      assert.equal(navKind({ from: "/", to: "/comp", direction: "push" }), "fade");
    } finally {
      delete process.env.NEXT_PUBLIC_QUICK_COMP;
    }
    assert.equal(isRootScreen("/comp"), false);
  });
});
