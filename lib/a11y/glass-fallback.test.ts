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
  ["components/app-shell.tsx", /glass fixed inset-x-0 bottom-0 z-30[^"]*backdrop-blur-xl/],
  ["components/timeline-ui.tsx", /glass bg-\[var\(--chrome-bg\)\] backdrop-blur-xl/],
  ["components/moving-today-page.tsx", /glass bg-\[var\(--chrome-bg\)\] backdrop-blur-xl/],
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
