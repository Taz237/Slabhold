import assert from "node:assert/strict";
import { createElement } from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "node:test";
import { join } from "node:path";
import { CollectionHeader } from "@/components/collection-header";
import { FirstCardWelcome } from "@/components/first-card-welcome";

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

const focusRing = /focus-visible:ring-2/;

describe("Add a card on Collection", () => {
  it("is the main call to action when the collection is empty", () => {
    const html = renderToStaticMarkup(createElement(FirstCardWelcome));
    assert.match(html, /Your collection starts here/);
    assert.match(html, /href="\/cards\/new"/);
    assert.match(html, />Add a card</);
    assert.match(html, /min-h-12/);
    assert.match(html, focusRing);
    assert.doesNotMatch(html, /Add your first card/);
  });

  it("stays in the header when the collection has cards", () => {
    const html = renderToStaticMarkup(createElement(CollectionHeader));
    assert.match(html, /href="\/cards\/new"/);
    assert.match(html, />Add a card</);
    assert.match(html, /min-h-11/);
    assert.match(html, focusRing);
    assert.match(html, /flex-wrap/);
    assert.doesNotMatch(html, /Mail Day/);
    assert.doesNotMatch(html, /\/mail-day/);

    const dash = read("components/dashboard.tsx");
    const header = dash.indexOf("<CollectionHeader");
    const welcome = dash.indexOf("<FirstCardWelcome");
    const cards = dash.indexOf("visible.map");
    assert.ok(header > 0 && welcome > header && cards > header);
    const emptyBranch = dash.indexOf("cards.length === 0 ? (");
    assert.ok(emptyBranch > header);
    assert.ok(welcome > emptyBranch);
  });

  it("does not offer Mail Day from the header or the create menu", () => {
    const html = renderToStaticMarkup(createElement(CollectionHeader));
    assert.doesNotMatch(html, /Mail Day/);
    assert.doesNotMatch(html, /href="\/mail-day"/);
    assert.match(html, />Add a card</);
    const menu = read("components/create-menu.tsx");
    assert.doesNotMatch(menu, /Mail Day/);
    assert.doesNotMatch(menu, /\/mail-day/);
    assert.match(menu, />\s*Post\s*</);
    assert.match(menu, />\s*Add card\s*</);
  });

  it("is also in the create menu and More, and the camera tab adds a card", () => {
    const menu = read("components/create-menu.tsx");
    assert.match(menu, /href="\/cards\/new"/);
    assert.match(menu, />\s*Add card\s*</);
    assert.match(menu, /aria-label="Post"/);
    assert.match(menu, />\s*Post\s*</);
    assert.doesNotMatch(menu, /Mail Day/);
    assert.doesNotMatch(menu, /\/mail-day/);
    const more = read("components/more-view.tsx");
    assert.match(more, /href="\/cards\/new"/);
    assert.match(more, />\s*Add card\s*</);
    assert.doesNotMatch(more, /href="\/scan"/);
    assert.doesNotMatch(more, /Scan a card/);
    const shell = read("components/app-shell.tsx");
    assert.match(read("lib/ui/bottom-nav.ts"), /href: "\/cards\/new", label: "Add card"/);
    assert.match(shell, /BOTTOM_NAV/);
    assert.match(shell, /aria-label="Add card"/);
    assert.match(shell, />\s*Add card\s*</);
    assert.doesNotMatch(shell, /href: "\/scan"/);
    assert.doesNotMatch(shell, /Scan a card/);
    assert.match(read("app/scan/page.tsx"), /ScanView/);
  });
});
