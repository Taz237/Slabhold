import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { join } from "node:path";
import {
  BOTTOM_NAV,
  BOTTOM_NAV_MAX_ITEMS,
  BOTTOM_NAV_VIEWPORT_PX,
  MOVED_TO_MORE,
  bottomNavLabelsFit,
  labelWidthFits,
} from "./bottom-nav";

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("bottom nav", () => {
  it("keeps five labels that fit at 390px, with Leaderboard on the bar", () => {
    const labels = BOTTOM_NAV.map((tab) => tab.label);
    assert.equal(labels.length, BOTTOM_NAV_MAX_ITEMS);
    assert.equal(BOTTOM_NAV_VIEWPORT_PX, 390);
    assert.equal(bottomNavLabelsFit(labels), true);
    assert.equal(labelWidthFits("Leaderboard", 5), true);
    assert.equal(labelWidthFits("Leaderboard", 6), false);
    assert.equal(labelWidthFits("Leaderboard", 7), false);
    assert.equal(BOTTOM_NAV.some((tab) => tab.href === "/leaderboard" && tab.label === "Leaderboard"), true);
    assert.deepEqual(
      MOVED_TO_MORE.map((tab) => tab.label),
      ["Messages", "Profile"],
    );
    const shell = read("components/app-shell.tsx");
    const nav = read("lib/ui/bottom-nav.ts");
    assert.match(shell, /Trophy/);
    assert.match(shell, /BOTTOM_NAV/);
    assert.match(shell, /TAB_ICONS/);
    for (const tab of BOTTOM_NAV) {
      assert.match(nav, new RegExp(`href: "${tab.href}", label: "${tab.label}"`));
    }
    assert.doesNotMatch(shell, /href: "\/messages"/);
    const more = read("components/more-view.tsx");
    assert.match(more, /href="\/profile"/);
    assert.match(more, /href="\/messages"/);
    assert.match(more, /Messages, \$\{unreadMessageCount\} unread/);
  });
});
