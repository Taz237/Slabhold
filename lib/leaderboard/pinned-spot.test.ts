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
    assert.deepEqual(cards?.you?.rival, { name: "Flaherty", need: 2, tied: false });
    assert.equal(cards?.yourSpot, null, "yourSpot keeps its old meaning");

    const section = boardHtml(render(model), "most-cards-added");
    const bar = barHtml(section);
    assert.ok(bar, "the bar is drawn");
    assert.match(text(bar), /You're #3 · 2 cards behind Flaherty/);
    assert.match(bar, /href="\/cards\/new"[^>]*>Add card</);
    const tag = bar.slice(0, bar.indexOf(">"));
    const classes = (tag.match(/class="([^"]*)"/)?.[1] ?? "").split(/\s+/);
    assert.ok(classes.includes("sticky"), "sticky, not fixed");
    assert.ok(classes.includes(BOTTOM), "sits just above the bottom tab bar");
    assert.doesNotMatch(tag, /\bfixed\b/);
    assert.match(tag, /z-10/);
    assert.match(tag, /backdrop-blur/);
    assert.match(tag, /bg-zinc-900\/95/);
    assert.match(bar, /width:28px;height:28px/);
    assert.match(bar, /class="sr-only">You: #3</);
    assert.match(section, /^data-board="most-cards-added"[^>]*class="[^"]*\boverflow-clip\b/);
    assert.doesNotMatch(section.slice(0, section.indexOf(">")), /overflow-hidden/);
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
    assert.deepEqual(tiedCards?.you?.rival, { name: "Flaherty", need: 0, tied: true });
    assert.match(text(barHtml(boardHtml(render(tied), "most-cards-added")) ?? ""), /You're #2 · tied with Flaherty/);

    const leading = pageModel(snap({ "most-cards-added": [row("me", 8), row("b", 5, { title: "Flaherty" })] }), "me");
    assert.deepEqual(leading.boards[0]?.you?.rival, { name: "Flaherty", need: 3, tied: false });
    assert.match(text(barHtml(boardHtml(render(leading), "most-cards-added")) ?? ""), /You're #1 · 3 cards ahead of Flaherty/);

    const one = pageModel(snap({ "most-cards-added": [row("b", 2, { title: "Flaherty" }), row("me", 1)] }), "me");
    assert.match(text(barHtml(boardHtml(render(one), "most-cards-added")) ?? ""), /You're #2 · 1 card behind Flaherty/);

    const alone = pageModel(snap({ "most-cards-added": [row("me", 4)] }), "me");
    assert.equal(alone.boards[0]?.you?.rival, null);
    const aloneBar = text(barHtml(boardHtml(render(alone), "most-cards-added")) ?? "");
    assert.match(aloneBar, /You're #1/);
    assert.doesNotMatch(aloneBar, /ahead|behind|tied/);
  });

  it("keeps the top-10 gap below rank 10 and the board's step when unranked", () => {
    const outside = pageModel(snap({ "most-cards-added": [...rows(12), row("me", 1)] }), "me");
    assert.equal(outside.boards[0]?.you?.rival, null);
    const markup = render(outside);
    assert.match(text(barHtml(boardHtml(markup, "most-cards-added")) ?? ""), /You're #13 · \d+ more cards? to reach the top 10/);

    const risingBar = barHtml(boardHtml(markup, "rising-collectors")) ?? "";
    assert.equal(outside.boards[1]?.you?.rival, null);
    assert.match(text(risingBar), /Not ranked yet · /);
    assert.match(risingBar, /href="\/search"[^>]*>Find collectors</);
    const postBar = barHtml(boardHtml(markup, "top-card-post")) ?? "";
    assert.match(text(postBar), /Not ranked yet · /);
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
    assert.deepEqual(posts?.you?.rival, { name: "@flaherty", need: 1, tied: false });
    const bar = barHtml(boardHtml(render(model), "top-card-post")) ?? "";
    assert.match(text(bar), /You're #3 · 1 reply behind @flaherty/);
    assert.match(bar, /href="\/compose"[^>]*>Post a card</);
  });

  it("shares the profile from Rising collectors when ranked", () => {
    const model = pageModel(snap({ "rising-collectors": [row("a", 5, { title: "Flaherty" }), row("me", 3)] }), "me");
    const bar = barHtml(boardHtml(render(model), "rising-collectors")) ?? "";
    assert.match(text(bar), /You're #2 · 2 new followers behind Flaherty/);
    assert.match(bar, /<button[^>]*aria-label="Share profile"/);
    assert.doesNotMatch(bar, /href="\/search"/);
  });

  it("shows the finished rank on Last week with no action, and nothing when unranked there", () => {
    const last = pageModel(snap({}, { "most-cards-added": [row("a", 9), row("b", 6), row("me", 3)] }), "me", "previous");
    const markup = render(last);
    const bar = barHtml(boardHtml(markup, "most-cards-added")) ?? "";
    assert.match(text(bar), /You finished #3/);
    assert.doesNotMatch(text(bar), /behind|ahead|tied/);
    assert.doesNotMatch(bar, /<a |<button/);
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
