import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  SHEET_CLOSE_RATIO,
  SHEET_FLICK_VELOCITY,
  sheetDragClaims,
  sheetDragOffset,
  sheetReleaseCloses,
} from "./sheet-drag";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("swipe a bottom sheet down to close", () => {
  it("takes over on a downward drag, and leaves taps, sideways moves and upward moves alone", () => {
    assert.equal(sheetDragClaims({ deltaX: 0, deltaY: 4, scrollTop: 0 }), "wait");
    assert.equal(sheetDragClaims({ deltaX: 2, deltaY: 20, scrollTop: 0 }), "claim");
    assert.equal(sheetDragClaims({ deltaX: 30, deltaY: 6, scrollTop: 0 }), "release");
    assert.equal(sheetDragClaims({ deltaX: 0, deltaY: -20, scrollTop: 0 }), "release");
  });

  it("lets a list inside the sheet scroll until it is back at its top", () => {
    assert.equal(sheetDragClaims({ deltaX: 0, deltaY: 20, scrollTop: 120 }), "release");
    assert.equal(sheetDragClaims({ deltaX: 0, deltaY: 20, scrollTop: 0 }), "claim");
  });

  it("follows the finger down and never rises above where it rests", () => {
    assert.equal(sheetDragOffset(64), 64);
    assert.equal(sheetDragOffset(-40), 0);
  });

  it("closes past 30% of its height or on a quick flick down, not on a flick back up", () => {
    const height = 400;
    assert.equal(sheetReleaseCloses({ deltaY: height * SHEET_CLOSE_RATIO, height, velocity: 0 }), true);
    assert.equal(sheetReleaseCloses({ deltaY: 60, height, velocity: 0 }), false);
    assert.equal(sheetReleaseCloses({ deltaY: 40, height, velocity: SHEET_FLICK_VELOCITY }), true);
    assert.equal(sheetReleaseCloses({ deltaY: 300, height, velocity: -SHEET_FLICK_VELOCITY }), false);
    assert.equal(sheetReleaseCloses({ deltaY: 0, height, velocity: 2 }), false);
    assert.equal(sheetReleaseCloses({ deltaY: 200, height: 0, velocity: 0 }), false);
  });
});

describe("bottom sheet motion", () => {
  const css = read("app/globals.css");

  it("slides the whole sheet up from the bottom edge on a spring, with transform only", () => {
    const frames = css.slice(css.indexOf("@keyframes sheet-slide"), css.indexOf("}\n}", css.indexOf("@keyframes sheet-slide")) + 3);
    assert.match(frames, /from \{\s*transform: translateY\(100%\);/);
    assert.doesNotMatch(frames, /\b(top|bottom|height|margin|opacity)\s*:/);
    assert.match(css, /--sheet-spring: linear\(0, /);
    assert.match(css, /\.sheet-slide \{\s*animation: sheet-slide var\(--sheet-ms\) var\(--sheet-spring\) both;/);
  });

  it("only appears, without the slide, with Reduce Motion on", () => {
    const rule = css.indexOf(".sheet-slide {");
    const guard = css.lastIndexOf("@media (prefers-reduced-motion: no-preference)", rule);
    assert.ok(guard > 0 && css.slice(guard, rule).split("}\n}").length === 1, ".sheet-slide sits inside the motion-safe block");
    const hook = read("lib/ui/use-sheet-drag.ts");
    assert.match(hook, /if \(!panel \|\| reducedMotion\(\)\) \{\s*onCloseRef\.current\(\);/);
  });

  it("moves the sheet with transform and fades with opacity, nothing else", () => {
    const hook = read("lib/ui/use-sheet-drag.ts");
    const set = [...hook.matchAll(/\.style\.(\w+) =/g)].map((match) => match[1]);
    assert.deepEqual([...new Set(set)].sort(), ["animation", "opacity", "transform", "transition", "willChange"]);
    assert.doesNotMatch(hook, /transition = `(?!transform|opacity)/);
  });

  it("is on the share, send, mark sold and Add card sheets: swipe down, and a slide away on close", () => {
    for (const file of [
      "components/share-sheet-view.tsx",
      "components/send-post-sheet-view.tsx",
      "components/deal-sheet.tsx",
      "components/add-card/add-card-sheet.tsx",
    ]) {
      const source = read(file);
      assert.match(source, /const dismiss = useSheetDrag\(/, file);
      assert.match(source, /sheet-slide/, file);
      assert.match(source, /onClick=\{dismiss\}/, file);
    }
  });

  it("keeps a tap on the backdrop from opening the post behind the sheet", () => {
    assert.match(read("lib/ui/use-sheet-drag.ts"), /event\?\.stopPropagation\?\.\(\);\s*if \(closing\.current\) return;/);
  });

  it("pops the post menus open from their corner", () => {
    assert.match(css, /@keyframes menu-pop \{\s*from \{\s*opacity: 0;\s*transform: scale\(0\.94\);/);
    const tweet = read("components/tweet.tsx");
    assert.equal((tweet.match(/role="menu"\s+className="menu-pop /g) ?? []).length, 2);
  });
});
