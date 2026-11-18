import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

const shell = read("components/app-shell.tsx");
const css = read("app/globals.css");
const nav = shell.slice(shell.indexOf('viewTransitionName: "app-nav"'), shell.indexOf("</nav>"));

describe("floating glass tab bar", () => {
  it("floats: inset from the edges, above the home indicator, fully rounded", () => {
    assert.match(nav, /fixed inset-x-2 bottom-\[var\(--tabbar-bottom\)\]/);
    assert.match(nav, /rounded-full/);
    assert.doesNotMatch(nav, /inset-x-0 bottom-0|border-t/);
    assert.match(css, /--tabbar-h: 3\.75rem;/);
    assert.match(css, /--tabbar-bottom: max\(0\.5rem, calc\(env\(safe-area-inset-bottom\) - 0\.75rem\)\);/);
  });

  it("has one shared pill that slides with transform, not a highlight per tab", () => {
    assert.equal((nav.match(/data-tab-pill=""/g) ?? []).length, 1);
    assert.ok(nav.indexOf("data-tab-pill") < nav.indexOf("tabs.map("), "drawn once, outside the tab loop");
    assert.match(nav, /transform: `translateX\(\$\{Math\.max\(0, pillIndex\) \* 100\}%\)`/);
    assert.match(nav, /glass-highlight pointer-events-none absolute[^`]*transition-\[transform,opacity\][^`]*motion-reduce:transition-none/);
    assert.doesNotMatch(nav, /transition-all/);
    // Scan is the purple button, never under the pill.
    assert.match(shell, /const pillShown = pillIndex >= 0 && pillHref !== SCAN_TAB_HREF;/);
  });

  it("moves the pill on the tap and forgets the tap once the path changes", () => {
    assert.match(shell, /if \(tapped && tapped\.from !== pathname\) setTapped\(null\);/);
    assert.match(shell, /setTapped\(\{ href, from: pathname \}\)/);
  });

  it("keeps every tab, its tour hook, the badge, scroll-to-top and the view transition", () => {
    assert.match(nav, /tabs\.map\(/);
    assert.equal((nav.match(/data-tour=\{tab\.tour\}/g) ?? []).length, 2);
    assert.equal((nav.match(/onClick=\{\(event\) => onTabClick\(event, tab\.href\)\}/g) ?? []).length, 2);
    assert.match(nav, /`Messages, \$\{messageBadge\} unread`/);
    assert.match(nav, /aria-label="Scan"/);
    assert.match(nav, /bg-violet-600/);
  });

  it("leaves room under the page so the last row clears the bar and the Post button", () => {
    assert.match(shell, /pb-\[calc\(7\.5rem\+env\(safe-area-inset-bottom\)\)\]/);
  });
});
