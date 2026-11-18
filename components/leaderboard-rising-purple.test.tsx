import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DeltaChip } from "@/components/sales-chart";
import { LB_CARD_TOP, LB_RANK_TEXT, LB_YOU, LB_YOU_TINT, LB_YOU_TINT_ALPHA } from "@/lib/leaderboard/theme";
import { boardHtml, pageModel, render, rows, snap } from "@/lib/test/leaderboard-view";

/** Slabhold purple (violet-600): the board accent and the viewer row's tint. */
const VIOLET_600 = "#7c3aed";
/** Rank numerals sit on the board card. Its lighter top is the hardest place for them, so they need 4.5:1 there. */
const BOARD_BG = LB_CARD_TOP;
const EMERALD = /#10b981|emerald|16,\s*185,\s*129/i;

function rgb(hex: string): [number, number, number] {
  const value = hex.replace("#", "");
  return [0, 2, 4].map((at) => parseInt(value.slice(at, at + 2), 16)) as [number, number, number];
}

function luminance([r, g, b]: [number, number, number]): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(a: [number, number, number], b: [number, number, number]): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** `over` at `alpha` on top of `under`, as the viewer row's tint draws. */
function blend(over: string, alpha: number, under: string): [number, number, number] {
  const top = rgb(over);
  const bottom = rgb(under);
  return top.map((c, i) => Math.round(c * alpha + bottom[i] * (1 - alpha))) as [number, number, number];
}

/** Rising collectors with 8 fake rows; the viewer "u5" sits at #6, in the rank rows. */
function risingBoard(): string {
  return boardHtml(render(pageModel(snap({ "rising-collectors": rows(8) }), "u5")), "rising-collectors");
}

describe("Rising collectors board in Slabhold purple", () => {
  it("draws no emerald and uses violet-600 for the board accent", () => {
    const html = risingBoard();
    assert.doesNotMatch(html, EMERALD);
    assert.match(html, new RegExp(`--lb-accent:${VIOLET_600}`, "i"), "board accent");
    assert.equal(LB_YOU_TINT.toLowerCase(), VIOLET_600, "the viewer row is tinted with brand purple");
    const alpha = Math.round(LB_YOU_TINT_ALPHA * 255).toString(16).padStart(2, "0");
    assert.match(html, new RegExp(`background-color:${LB_YOU_TINT}${alpha}`, "i"), "viewer row tint");
    // The viewer row's edge is drawn inside the row, so it shares the row's box and corners.
    assert.match(html, new RegExp(`box-shadow:inset 0 0 0 1.5px ${LB_YOU}`, "i"), "viewer row edge");
  });

  it("keeps rank numerals at 4.5:1 or better on the board and the viewer's tinted row", () => {
    const html = risingBoard();
    const colors = [...html.matchAll(/data-rank-numeral=""[^>]*style="color:(#[0-9a-f]{6})"/gi)].map((m) => m[1]);
    assert.ok(colors.length > 0, "rank rows render a numeral color");
    const text = colors[0];
    assert.ok(colors.every((color) => color === text), "one numeral color per board");
    const onBoard = contrast(rgb(text), rgb(BOARD_BG));
    assert.equal(text, LB_RANK_TEXT);
    const onViewerRow = contrast(rgb(text), blend(LB_YOU_TINT, LB_YOU_TINT_ALPHA, BOARD_BG));
    assert.ok(onBoard >= 4.5, `numeral on board ${onBoard.toFixed(2)}:1`);
    assert.ok(onViewerRow >= 4.5, `numeral on viewer row ${onViewerRow.toFixed(2)}:1`);
    assert.ok(contrast(rgb(VIOLET_600), rgb(BOARD_BG)) < 4.5, "violet-600 alone is too dark for small text here");
  });

  it("leaves the other two boards' accents alone", () => {
    const html = render(
      pageModel(snap({ "top-card-post": rows(5), "most-cards-added": rows(5) }), null),
    );
    assert.match(boardHtml(html, "top-card-post"), /--lb-accent:#7c5cff/);
    assert.match(boardHtml(html, "most-cards-added"), /--lb-accent:#A78BFA/);
  });

  it("keeps up chips purple and down chips gray, never green or red", () => {
    const up = renderToStaticMarkup(createElement(DeltaChip, { pct: 12 }));
    const down = renderToStaticMarkup(createElement(DeltaChip, { pct: -8 }));
    assert.match(up, /data-delta-chip="up"/);
    assert.match(up, /text-violet-700/);
    assert.match(down, /data-delta-chip="down"/);
    assert.match(down, /text-zinc-600/);
    assert.doesNotMatch(up + down, /emerald|rose/);
  });
});
