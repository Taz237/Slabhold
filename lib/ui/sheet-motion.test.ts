import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const read = (file: string) => readFileSync(join(process.cwd(), file), "utf8");

function block(css: string, selector: string): string {
  const start = css.indexOf(selector);
  assert.ok(start >= 0, selector);
  return css.slice(start, css.indexOf("}", start) + 1);
}

describe("sheet motion", () => {
  const css = read("app/globals.css");

  it("adds sheet-up and backdrop-in with transform and opacity only", () => {
    const up = css.slice(css.indexOf("@keyframes sheet-up"), css.indexOf("@keyframes backdrop-in"));
    assert.match(up, /transform: translateY\(/);
    assert.match(up, /opacity: 0/);
    assert.doesNotMatch(up, /\b(left|top|width|height|margin)\s*:/);
    const backdrop = css.slice(css.indexOf("@keyframes backdrop-in"));
    assert.match(backdrop.slice(0, backdrop.indexOf("}\n}") + 3), /opacity: 0/);
    assert.match(block(css, ".sheet-up {"), /300ms cubic-bezier\(0\.22, 1, 0\.36, 1\)/);
    assert.match(block(css, ".backdrop-in {"), /300ms cubic-bezier\(0\.22, 1, 0\.36, 1\)/);
  });

  it("runs them only when motion is allowed", () => {
    const tail = css.slice(css.indexOf("@keyframes sheet-up"));
    const safe = tail.slice(tail.indexOf("@media (prefers-reduced-motion: no-preference)"));
    assert.ok(tail.includes("@media (prefers-reduced-motion: no-preference)"));
    assert.ok(safe.indexOf(".sheet-up {") > 0 && safe.indexOf(".backdrop-in {") > 0);
    // Nothing outside the guard animates them.
    assert.equal(tail.slice(0, tail.indexOf("@media (prefers-reduced-motion: no-preference)")).includes(".sheet-up {"), false);
  });

  it("uses them on the deal, profile edit and share sheets", () => {
    for (const file of ["components/deal-sheet.tsx", "components/profile-edit-sheet.tsx", "components/share-sheet-view.tsx"]) {
      const source = read(file);
      assert.match(source, /backdrop-in/, file);
      assert.match(source, /sheet-up/, file);
    }
  });

  it("slides tab underlines with transform in 180ms and never unmounts them", () => {
    const lanes = read("components/timeline-ui.tsx");
    const underline = lanes.slice(lanes.indexOf("data-lane-underline"), lanes.indexOf("</span>", lanes.indexOf("data-lane-underline")));
    assert.match(underline, /transition-transform duration-\[180ms\]/);
    assert.match(underline, /translateX\(/);

    const profile = read("components/profile-view.tsx");
    assert.match(profile, /data-profile-underline=""/);
    const bar = profile.slice(profile.indexOf("data-profile-underline"), profile.indexOf("</span>", profile.indexOf("data-profile-underline")));
    assert.match(bar, /transition-transform duration-\[180ms\]/);
    assert.match(bar, /translateX\(/);
    assert.doesNotMatch(profile, /\{active \? \(\s*<span className="absolute bottom-0/);
    assert.doesNotMatch(lanes + profile, /transition-all/);
  });

  it("gives drawer rows, sheet rows and tabs press feedback", () => {
    const menu = read("components/side-menu.tsx");
    assert.match(menu, /const mainRow =\s*"tap-fade /);
    assert.match(menu, /const settingsRow =\s*"tap-fade /);
    assert.match(read("components/share-sheet-view.tsx"), /const rowClass =\s*"tap-fade /);
    assert.match(read("components/timeline-ui.tsx"), /role="tab"[\s\S]*?className=\{`tap-fade /);
    assert.match(read("components/profile-view.tsx"), /role="tab"[\s\S]*?className=\{`tap-fade /);
  });
});
