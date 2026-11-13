import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

/**
 * Accessibility floor for the screens every collector sees: the shell (header,
 * tab bar), the five tabs' first screens, and the scan and Add card sheets.
 * Read from source, so a new icon-only button or a 10px label fails here.
 */
export const CHROME_FILES = [
  "components/app-shell.tsx",
  "components/offline-banner.tsx",
  "components/timeline-ui.tsx",
  "components/tweet.tsx",
  "components/leaderboard-view.tsx",
  "components/collection-header.tsx",
  "components/card-tile.tsx",
  "components/messages-view.tsx",
  "components/message-thread.tsx",
  "components/moving-today.tsx",
  "components/scan/comp-sheet.tsx",
  "components/scan/confirm-sheet.tsx",
  "components/scan/listing-photo.tsx",
  "components/scan/sales-dots.tsx",
  "components/scan/scan-add-card.tsx",
  "components/scan/scan-entry.tsx",
  "components/scan/scan-hub.tsx",
  "components/scan/sheet-parts.tsx",
  "components/add-card/add-card-sheet.tsx",
  "components/add-card/flow-ui.tsx",
];

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

/** Every <button>, <Link> and <a> in the file: its opening tag and what's inside it. */
function controls(source: string): { tag: string; open: string; inner: string; line: number }[] {
  const found: { tag: string; open: string; inner: string; line: number }[] = [];
  const opener = /<(button|Link|a)\b/g;
  for (let match = opener.exec(source); match; match = opener.exec(source)) {
    const tag = match[1];
    // The opening tag ends at the first ">" outside braces and quotes ("=>" is inside braces).
    let depth = 0;
    let quote = "";
    let end = -1;
    for (let i = match.index; i < source.length; i += 1) {
      const char = source[i];
      if (quote) {
        if (char === quote) quote = "";
      } else if (char === '"' || char === "'" || char === "`") quote = char;
      else if (char === "{") depth += 1;
      else if (char === "}") depth -= 1;
      else if (char === ">" && depth === 0) {
        end = i;
        break;
      }
    }
    if (end < 0) continue;
    const open = source.slice(match.index, end + 1);
    const selfClosing = open.endsWith("/>");
    const close = selfClosing ? end : source.indexOf(`</${tag}>`, end);
    const inner = selfClosing || close < 0 ? "" : source.slice(end + 1, close);
    found.push({ tag, open, inner, line: source.slice(0, match.index).split("\n").length });
  }
  return found;
}

/** True when the inside has something a screen reader can say: words, or a {value}. */
function hasText(inner: string): boolean {
  const withoutHidden = inner.replace(/<[A-Za-z][^<>]*aria-hidden[^<>]*\/>/g, "");
  // Children that are components other than plain icons may carry text: {label}, <Name />, words.
  const withoutTags = withoutHidden.replace(/<\/?[A-Za-z][^<>]*>/g, " ");
  const withoutComments = withoutTags.replace(/\{\/\*[\s\S]*?\*\/\}/g, " ");
  return /[A-Za-z0-9{]/.test(withoutComments);
}

describe("accessibility floor: shell, tabs and scan sheets", () => {
  for (const file of CHROME_FILES) {
    const source = read(file);

    it(`${file}: every icon-only control has a name`, () => {
      const unnamed = controls(source)
        .filter(({ open, inner }) => !/aria-label|aria-labelledby|\{\.\.\./.test(open) && !hasText(inner))
        .map(({ tag, line }) => `${file}:${line} <${tag}>`);
      assert.deepEqual(unnamed, []);
    });

    it(`${file}: no text under 11px`, () => {
      const small = source
        .split("\n")
        .map((text, index) => ({ text, line: index + 1 }))
        // An arrow glyph hidden from screen readers is a picture, not text.
        .filter(({ text }) => /text-\[(\d+(?:\.\d+)?)px\]/.test(text) && !/aria-hidden|MoveArrow/.test(text))
        .filter(({ text }) => [...text.matchAll(/text-\[(\d+(?:\.\d+)?)px\]/g)].some((m) => Number(m[1]) < 11))
        .map(({ line }) => `${file}:${line}`);
      assert.deepEqual(small, []);
      assert.doesNotMatch(source, /text-\[0?\.\d+rem\]|text-\[\d+pt\]/, "sizes stay in px so this check sees them");
    });

    it(`${file}: grey text keeps AA contrast in dark and light`, () => {
      // zinc-500 on the dark background is 4.1:1 (AA needs 4.5:1), so it needs a lighter dark: partner.
      // zinc-400 on white is 2.6:1, so as text it is only ever the dark: partner.
      const weak: string[] = [];
      for (const match of source.matchAll(/(["'`])((?:(?!\1)[^\\\n])*)\1/g)) {
        const classes = match[2];
        if (!/(^|\s)text-zinc-500(\s|$)/.test(classes)) continue;
        if (/dark:text-/.test(classes)) continue;
        weak.push(`${file}:${source.slice(0, match.index).split("\n").length}`);
      }
      assert.deepEqual(weak, []);
    });
  }

  it("the tab labels still fit at 390px at their new size", async () => {
    const nav = read("lib/ui/bottom-nav.ts");
    assert.match(nav, /Rough Geist 11px width/);
    const { BOTTOM_NAV, QUICK_COMP_TAB, bottomNavLabelsFit, bottomNavTabs } = await import("@/lib/ui/bottom-nav");
    assert.equal(bottomNavLabelsFit(BOTTOM_NAV.map((tab) => tab.label)), true);
    assert.equal(bottomNavLabelsFit(bottomNavTabs(true).map((tab) => tab.label)), true);
    assert.equal(QUICK_COMP_TAB.label.length <= 11, true);
  });
});
