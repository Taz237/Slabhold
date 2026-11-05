import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { EDGE_COMMIT_RATIO, EDGE_FLICK_VELOCITY, EDGE_START_PX } from "@/lib/ui/nav-motion";
import {
  MENU_OPEN_RATIO,
  MENU_FLICK_VELOCITY,
  MENU_EDGE_PX,
  menuDragProgress,
  menuEdgeSwipeAllowed,
  menuReleaseOpens,
} from "@/lib/ui/side-menu";

const read = (file: string) => readFileSync(join(process.cwd(), file), "utf8");

describe("drawer edge swipe", () => {
  it("uses the same thresholds as the back swipe", () => {
    assert.equal(MENU_OPEN_RATIO, EDGE_COMMIT_RATIO);
    assert.equal(MENU_FLICK_VELOCITY, EDGE_FLICK_VELOCITY);
    assert.equal(MENU_EDGE_PX, EDGE_START_PX);
  });

  it("maps finger travel to 0..1 of the panel width", () => {
    assert.equal(menuDragProgress(0, 300), 0);
    assert.equal(menuDragProgress(150, 300), 0.5);
    assert.equal(menuDragProgress(300, 300), 1);
    assert.equal(menuDragProgress(500, 300), 1);
    assert.equal(menuDragProgress(-40, 300), 0);
    assert.equal(menuDragProgress(100, 0), 0);
  });

  it("opens past 35% or on a flick to the right", () => {
    assert.equal(menuReleaseOpens({ progress: 0.3, velocity: 0, wasOpen: false }), false);
    assert.equal(menuReleaseOpens({ progress: 0.36, velocity: 0, wasOpen: false }), true);
    assert.equal(menuReleaseOpens({ progress: 0.1, velocity: 0.45, wasOpen: false }), true);
    assert.equal(menuReleaseOpens({ progress: 0.8, velocity: -0.5, wasOpen: false }), false);
  });

  it("closes once dragged 35% back or on a flick to the left", () => {
    assert.equal(menuReleaseOpens({ progress: 0.9, velocity: 0, wasOpen: true }), true);
    assert.equal(menuReleaseOpens({ progress: 0.7, velocity: 0, wasOpen: true }), true);
    assert.equal(menuReleaseOpens({ progress: 0.6, velocity: 0, wasOpen: true }), false);
    assert.equal(menuReleaseOpens({ progress: 0.95, velocity: -0.45, wasOpen: true }), false);
    assert.equal(menuReleaseOpens({ progress: 0.5, velocity: 0.6, wasOpen: true }), true);
  });

  it("arms only on Home, from the left edge, with nothing else open", () => {
    const base = { pathname: "/", startX: 8, menuOpen: false, modalOpen: false };
    assert.equal(menuEdgeSwipeAllowed(base), true);
    assert.equal(menuEdgeSwipeAllowed({ ...base, startX: 21 }), false);
    assert.equal(menuEdgeSwipeAllowed({ ...base, pathname: "/collection" }), false);
    assert.equal(menuEdgeSwipeAllowed({ ...base, pathname: "/u/collector" }), false);
    assert.equal(menuEdgeSwipeAllowed({ ...base, menuOpen: true }), false);
    assert.equal(menuEdgeSwipeAllowed({ ...base, modalOpen: true }), false);
  });

  it("wires a passive edge listener that moves the panel with transform only", () => {
    const menu = read("components/side-menu.tsx");
    assert.match(menu, /addEventListener\("touchstart", onEdgeStart, \{ passive: true \}\)/);
    assert.match(menu, /edgeSwipeClaims\(/);
    assert.match(menu, /menuEdgeSwipeAllowed\(/);
    assert.match(menu, /menuReleaseOpens\(/);
    assert.doesNotMatch(menu, /style\.(left|top|width|height|marginLeft)\s*=/);
    assert.doesNotMatch(menu, /transition-all/);
    // The drawer slides in 300ms on the sheet easing.
    assert.match(menu, /duration-300 ease-\[cubic-bezier\(0\.22,1,0\.36,1\)\]/);
  });
});
