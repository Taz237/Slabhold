import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { barHtml, boardHtml, pageModel, render, row, rows, snap } from "@/lib/test/leaderboard-view";

const BRAND_ID = "744fedf0-f012-4c9d-841f-18531fdde340";
const BOTTOM = "bottom-[calc(4.75rem+env(safe-area-inset-bottom))]";
const APOS = "(?:'|&#x27;)";

function text(html: string): string {
  return html.replace(/<[^>]+>/g, "").replace(/&#x27;/g, "'").replace(/&amp;/g, "&");
}

/** Viewer "me" at #3 on Most cards added, 2 behind Flaherty at #2. */
function third() {
  return snap({
    "most-cards-added": [
      row("lead", 10, { title: "Lead Collector" }),
      row("flaherty", 7, { title: "Flaherty" }),
      row("me", 5, { title: "Me" }),
      row("d", 1),
    ],
  });
}

describe("pinned your-spot bar", () => {
  it("names the rival one place ahead and pins the bar above the tab bar", () => {
    const model = pageModel(third(), "me");
    const cards = model.boards.find((board) => board.id === "most-cards-added");
    assert.deepEqual(cards?.you?.rival, { name: "Flaherty", handle: "@flaherty", need: 2, tied: false });
    assert.equal(cards?.yourSpot, null, "yourSpot keeps its old meaning");

    const section = boardHtml(render(model), "most-cards-added");
    const bar = barHtml(section);
    assert.ok(bar, "the bar is drawn");
    // The rank, then what it takes to pass: one more than the 2-card gap, because a tie passes no one.
    assert.match(text(bar), /^#33 cards to pass @flaherty/);
    assert.match(bar, />#3<\/span>/);
    assert.match(bar, />3 cards to pass @flaherty</);
    // A tap opens the two real scores and the board's own next step.
    const more = bar.slice(bar.indexOf("data-spot-more"));
    assert.match(bar, /<details[\s\S]*<summary[\s\S]*data-spot-more/);
    assert.match(more, /data-chase=""/);
    assert.match(text(more), /@flaherty7You5/);
    assert.match(more, /href="\/cards\/new"[^>]*>Add card</);
    // Sharing the rank is one tap, outside the disclosure.
    assert.match(bar.slice(bar.indexOf("</details>")), /<button[^>]*data-share-rank=""[^>]*aria-label="Share my rank"/);
    const tag = bar.slice(0, bar.indexOf(">"));
    const classes = (tag.match(/class="([^"]*)"/)?.[1] ?? "").split(/\s+/);
    assert.ok(classes.includes("sticky"), "sticky, not fixed");
    assert.ok(classes.includes(BOTTOM), "sits just above the bottom tab bar");
    assert.doesNotMatch(tag, /\bfixed\b/);
    assert.match(tag, /z-10/);
    // Nearly solid dark purple with a light blur: rows scrolling under it never show through the text.
    assert.ok(classes.includes("backdrop-blur-sm"), "a light blur");
    assert.ok(classes.includes("bg-[#24124D]/[0.97]"), "nearly solid dark purple");
    assert.ok(!classes.includes("bg-[#24124D]/90"), "no longer see-through");
    assert.match(tag, /\bmin-h-14\b/);
    assert.match(bar, /class="sr-only">You: #3</);
    // No overflow on the board, so the bar can stick and nothing in the board is clipped.
    assert.doesNotMatch(section.slice(0, section.indexOf(">")), /overflow-(?:hidden|clip)/);
    assert.ok(section.trimEnd().endsWith("</div>"), "the bar is the section's last child");
    assert.doesNotMatch(bar, /line-clamp/);
    assert.match(section, /data-board-rest=""[\s\S]*data-your-spot=""/);
    assert.doesNotMatch(section.slice(0, section.indexOf("data-board-rest")), /data-your-spot/);
  });

  it("draws podium ghosts with no tinted card behind them", () => {
    const section = boardHtml(render(pageModel(snap({ "most-cards-added": [row("solo", 2)] }))), "most-cards-added");
    for (const rank of [2, 3]) {
      const start = section.indexOf(`data-ghost-rank="${rank}"`);
      const ghost = section.slice(start, section.indexOf("</li>", start));
      assert.match(ghost, /<a [^>]*class="lb-ghost lb-ghost-\d[^"]*"[^>]*style="background:transparent"/);
    }
    const last = boardHtml(render(pageModel(snap({}), null, "previous")), "most-cards-added");
    const start = last.indexOf('data-ghost-rank="1"');
    assert.match(last.slice(start, last.indexOf("</li>", start)), /<div [^>]*class="lb-ghost lb-ghost-1[^"]*"[^>]*style="background:transparent"/);
  });

  it("says a tie, a lead, and a lone #1", () => {
    const tied = pageModel(snap({ "most-cards-added": [row("a", 9, { title: "Flaherty" }), row("me", 9, { title: "Zed" })] }), "me");
    const tiedCards = tied.boards.find((board) => board.id === "most-cards-added");
    assert.deepEqual(tiedCards?.you?.rival, { name: "Flaherty", handle: "@a", need: 0, tied: true });
    assert.match(text(barHtml(boardHtml(render(tied), "most-cards-added")) ?? ""), /^#21 card to pass @a/);

    const leading = pageModel(snap({ "most-cards-added": [row("me", 8), row("b", 5, { title: "Flaherty" })] }), "me");
    assert.deepEqual(leading.boards[0]?.you?.rival, { name: "Flaherty", handle: "@b", need: 3, tied: false });
    assert.match(text(barHtml(boardHtml(render(leading), "most-cards-added")) ?? ""), /^#13 cards ahead of @b/);

    const one = pageModel(snap({ "most-cards-added": [row("b", 2, { title: "Flaherty" }), row("me", 1)] }), "me");
    assert.match(text(barHtml(boardHtml(render(one), "most-cards-added")) ?? ""), /^#22 cards to pass @b/);

    const alone = pageModel(snap({ "most-cards-added": [row("me", 4)] }), "me");
    assert.equal(alone.boards[0]?.you?.rival, null);
    const aloneBar = text(barHtml(boardHtml(render(alone), "most-cards-added")) ?? "");
    assert.match(aloneBar, /^#1Top spot/);
    assert.doesNotMatch(aloneBar, /ahead|behind|tied|to pass/i);
    assert.doesNotMatch(barHtml(boardHtml(render(alone), "most-cards-added")) ?? "", /data-chase/, "no rival, no bars");
  });

  it("keeps the top-10 gap below rank 10 and the board's step when unranked", () => {
    const outside = pageModel(snap({ "most-cards-added": [...rows(12), row("me", 1)] }), "me");
    assert.equal(outside.boards[0]?.you?.rival, null);
    const markup = render(outside);
    assert.match(text(barHtml(boardHtml(markup, "most-cards-added")) ?? ""), /^#13\d+ more cards? to reach the top 10/);

    const risingBar = barHtml(boardHtml(markup, "rising-collectors")) ?? "";
    assert.equal(outside.boards[1]?.you?.rival, null);
    // Not ranked: the step is the button. The how-to sentence stays in the rules sheet.
    assert.equal(text(risingBar), "Not ranked yetYour rankFind collectors");
    assert.match(risingBar, /href="\/search"[^>]*>Find collectors</);
    assert.doesNotMatch(risingBar, /<details|data-share-rank/, "nothing to open and no rank to share");
    const postBar = barHtml(boardHtml(markup, "top-card-post")) ?? "";
    assert.equal(text(postBar), "Not ranked yetYour rankPost a card");
    assert.match(postBar, /href="\/compose"[^>]*>Post a card</);
  });

  it("uses the handle for the post board's rival and the board's own unit", () => {
    const model = pageModel(
      snap({
        "top-card-post": [
          row("p1", 6, { userId: "lead", title: "Wemby Prizm", subtitle: "@lead" }),
          row("p2", 4, { userId: "flaherty", title: "Rookie Auto", subtitle: "@flaherty" }),
          row("p3", 3, { userId: "me", title: "My Card", subtitle: "@me" }),
        ],
      }),
      "me",
    );
    const posts = model.boards.find((board) => board.id === "top-card-post");
    assert.deepEqual(posts?.you?.rival, { name: "@flaherty", handle: "@flaherty", need: 1, tied: false });
    const bar = barHtml(boardHtml(render(model), "top-card-post")) ?? "";
    assert.match(text(bar), /^#32 replies to pass @flaherty/);
    assert.match(bar, /href="\/compose"[^>]*>Post a card</);
  });

  it("finds collectors and shares the rank from Rising collectors when ranked", () => {
    const model = pageModel(snap({ "rising-collectors": [row("a", 5, { title: "Flaherty" }), row("me", 3)] }), "me");
    const bar = barHtml(boardHtml(render(model), "rising-collectors")) ?? "";
    assert.match(text(bar), /^#23 new followers to pass @a/);
    assert.match(bar, /href="\/search"[^>]*>Find collectors</);
    assert.match(bar, /<button[^>]*aria-label="Share my rank"/);
  });

  it("shows the finished rank on Last week, read-only but shareable, and nothing when unranked there", () => {
    const last = pageModel(snap({}, { "most-cards-added": [row("a", 9), row("b", 6), row("me", 3)] }), "me", "previous");
    const markup = render(last);
    const bar = barHtml(boardHtml(markup, "most-cards-added")) ?? "";
    assert.match(text(bar), /^You finished #3/);
    assert.doesNotMatch(text(bar), /behind|ahead|tied|to pass/);
    // Read-only: no link, no next step, nothing to open. The one button shares the finish.
    assert.doesNotMatch(bar, /<a |<details|data-chase/);
    assert.equal((bar.match(/<button/g) ?? []).length, 1);
    assert.match(bar, /<button[^>]*aria-label="Share my rank"/);
    assert.equal(barHtml(boardHtml(markup, "rising-collectors")), null);
    assert.equal(barHtml(boardHtml(markup, "top-card-post")), null);
  });

  it("draws no bar when signed out or for the brand account", () => {
    const guest = render(pageModel(third()));
    assert.doesNotMatch(guest, /data-your-spot/);

    const brandModel = pageModel(snap({ "most-cards-added": [row(BRAND_ID, 3), row("b", 1)] }), BRAND_ID);
    for (const board of brandModel.boards) {
      assert.equal(board.you, null);
      assert.equal(board.yourSpot, null);
    }
    assert.doesNotMatch(render(brandModel), /data-your-spot/);
    assert.doesNotMatch(render(pageModel(third(), "6d31ab97-9162-4296-876d-9e0378872fce")), /data-your-spot/);
  });

  it(`never shows "You${APOS}re" text outside the bar for a guest`, () => {
    assert.doesNotMatch(render(pageModel(third())), new RegExp(`You${APOS}re #`));
  });
});
