import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CompsList } from "@/components/comps-list";
import type { CompListing } from "@/lib/types";

/** Sample sales only. */
const comps: CompListing[] = [1, 2].map((n) => ({
  id: `c${n}`,
  itemId: `item-${n}`,
  title: "2023 Prizm Sample Rookie PSA 10",
  soldPrice: 30 + n,
  soldDate: "2026-10-20",
  platform: "eBay",
  condition: "Graded",
  shipping: null,
  url: `https://example.com/item-${n}`,
}));

const px = (cls: string, prefix: string) => {
  const step = cls.split(/\s+/).find((c) => c.startsWith(`${prefix}-`))?.slice(prefix.length + 1);
  assert.ok(step && /^\d+(\.\d+)?$/.test(step), `no ${prefix}-* in "${cls}"`);
  return Number(step) * 4;
};

/** The action cluster after the first sale row's select button. */
function cluster(html: string) {
  const start = html.indexOf('<div class="flex shrink-0 items-center');
  assert.ok(start > 0, "no action cluster");
  return html.slice(start, html.indexOf("</li>", start));
}

const classOf = (html: string, marker: RegExp) => html.match(marker)?.[1] ?? "";

describe("comps list: ↗ and ⋯ hit areas", () => {
  it("keeps the two 44px targets on an owner row from overlapping", () => {
    const html = cluster(
      renderToStaticMarkup(createElement(CompsList, { comps, cardId: "fixture-card", canFlag: true, onSelect: () => {} })),
    );
    const wrap = classOf(html, /^<div class="([^"]*)"/);
    const link = classOf(html, /<a [^>]*class="([^"]*)"/);
    const menu = classOf(html, /<button [^>]*aria-haspopup="menu"[^>]*class="([^"]*)"/);
    for (const cls of [link, menu]) assert.ok(cls.split(/\s+/).includes("hit-44"), cls);
    // Glyph boxes keep today's sizes.
    assert.equal(px(link, "w"), 20);
    assert.equal(px(menu, "w"), 28);
    const centres = px(link, "w") / 2 + px(wrap, "gap") + px(menu, "w") / 2;
    assert.ok(centres >= 44, `centres ${centres}px apart, 44px boxes overlap`);
  });

  it("leaves a public row's lone ↗ as it was", () => {
    const html = cluster(renderToStaticMarkup(createElement(CompsList, { comps, onSelect: () => {} })));
    assert.doesNotMatch(html, /aria-haspopup="menu"/);
    assert.match(html, /<a [^>]*class="hit-44 grid h-5 w-5 place-items-center rounded-md/);
    assert.match(html, /^<div class="flex shrink-0 items-center [^"]*pt-3"/);
  });
});
