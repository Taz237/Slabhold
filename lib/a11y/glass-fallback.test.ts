import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

const css = read("app/globals.css");

/** Chrome that blurs what's behind it: still blurred, and marked for the solid fallback. */
const GLASS: [file: string, marker: RegExp][] = [
  ["components/app-shell.tsx", /glass sticky top-0 z-20 bg-\[var\(--chrome-bg\)\][^`]*backdrop-blur-xl/],
  // The floating tab bar and the side menu panel: liquid glass, blurred in globals.css.
  ["components/app-shell.tsx", /glass liquid-glass fixed inset-x-2 bottom-\[var\(--tabbar-bottom\)\] z-30/],
  ["components/side-menu.tsx", /glass liquid-glass-panel absolute inset-y-0 left-0/],
  ["components/timeline-ui.tsx", /glass bg-\[var\(--chrome-bg\)\] backdrop-blur-xl/],
  ["components/add-card/flow-ui.tsx", /glass bg-\[color-mix[^"]*backdrop-blur-xl/],
  ["components/message-thread.tsx", /glass bg-\[color-mix[^"]*backdrop-blur-xl/],
];
const SCRIMS: [file: string, marker: RegExp][] = [
  ["components/scan/sheet-parts.tsx", /glass-scrim bg-zinc-950\/70 backdrop-blur-xl/],
  ["components/add-card/add-card-sheet.tsx", /glass-scrim absolute inset-0 bg-zinc-950\/55 backdrop-blur-md/],
  ["components/card-added-panel.tsx", /glass-scrim absolute inset-0 bg-zinc-950\/75 backdrop-blur-xl/],
  ["components/new-message-sheet.tsx", /glass-scrim absolute inset-0 bg-zinc-950\/40 backdrop-blur/],
  ["components/push/soft-ask.tsx", /glass-scrim absolute inset-0 bg-black\/40 backdrop-blur/],
];

describe("glass: blur stays, with a solid fallback", () => {
  for (const [file, marker] of [...GLASS, ...SCRIMS]) {
    it(`${file} keeps its blur and takes the fallback`, () => {
      assert.match(read(file), marker);
    });
  }

  const block = css.slice(css.indexOf("Glass fallback."));

  it("keeps liquid glass as one reusable style: blur, tint, a bright top edge, an inner shadow and a drop shadow", () => {
    const liquid = css.slice(css.indexOf("Liquid glass."), css.indexOf("Glass fallback."));
    assert.match(liquid, /\.liquid-glass,\s*\.liquid-glass-panel \{\s*-webkit-backdrop-filter: blur\(24px\) saturate\(1\.8\);\s*backdrop-filter: blur\(24px\) saturate\(1\.8\);/);
    assert.match(liquid, /\.liquid-glass \{\s*background-color: var\(--glass-tint\);\s*box-shadow:\s*inset 0 1px 0 var\(--glass-edge\),\s*inset 0 0 0 1px var\(--glass-line\),\s*inset 0 -10px 14px -12px var\(--glass-inner\),\s*var\(--glass-drop\);/);
    assert.match(liquid, /\.glass-highlight \{/);
    // Tinted enough to read over a photo: at least 78% in both themes.
    const tints = [...liquid.matchAll(/--glass-tint(?:-panel)?: rgb\([\d ]+\/ (0\.\d+)\)/g)].map((m) => Number(m[1]));
    assert.equal(tints.length, 4);
    assert.ok(tints.every((alpha) => alpha >= 0.78), tints.join(", "));
    assert.doesNotMatch(liquid, /teal|cyan|aqua|emerald/i);
    // Only transform and opacity move. A blur is never animated.
    assert.doesNotMatch(liquid, /transition[^;]*(backdrop|filter)|@keyframes[^}]*blur/);
  });

  it("goes solid when Reduce Transparency is on", () => {
    const media = block.slice(block.indexOf("@media (prefers-reduced-transparency: reduce)"), block.indexOf("@supports"));
    assert.match(media, /\.glass \{\s*background-color: var\(--background\) !important;\s*-webkit-backdrop-filter: none !important;\s*backdrop-filter: none !important;/);
    assert.match(media, /\.glass-scrim \{\s*background-color: rgb\(9 9 11 \/ 0\.9\) !important;/);
  });

  it("goes solid in a browser with no backdrop-filter", () => {
    const supports = block.slice(block.indexOf("@supports not ((-webkit-backdrop-filter: blur(1px)) or (backdrop-filter: blur(1px)))"));
    assert.match(supports, /\.glass \{\s*background-color: var\(--background\) !important;/);
    assert.match(supports, /\.glass-scrim \{\s*background-color: rgb\(9 9 11 \/ 0\.9\) !important;/);
  });

  it("uses zinc only: no teal, cyan or other hue", () => {
    assert.ok(block.length > 0);
    assert.doesNotMatch(block, /teal|cyan|aqua|emerald|#[0-9a-f]{3,8}\b|hsl|oklch/i);
  });
});
