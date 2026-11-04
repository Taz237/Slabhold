import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { presentLeaderboard } from "./present";
import { LEADERBOARD_MIN_ENTRIES } from "./rules";
import { VIEW_NOW, boardHtml, pageModel, render, row, rows, snap } from "@/lib/test/leaderboard-view";

const BOARD = "most-cards-added";

function text(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");
}

/** An empty week with a full board last week. */
function mondaySnap() {
  return snap(
    {},
    {
      [BOARD]: [
        row("ace", 12, { title: "Ace Collector" }),
        row("bo", 9, { title: "Bo Pulls" }),
        row("cy", 7, { title: "Cy Slabs" }),
        row("dee", 3, { title: "Dee Binder" }),
      ],
    },
  );
}

function board(model: ReturnType<typeof pageModel>, id = BOARD) {
  const found = model.boards.find((b) => b.id === id);
  assert.ok(found, `board ${id}`);
  return found;
}

function previewHtml(section: string): string | null {
  const at = section.indexOf("data-last-week-preview");
  if (at < 0) return null;
  const open = section.lastIndexOf("<div", at);
  return section.slice(open, section.indexOf("data-board-rest", open));
}

describe("last week preview on a thin board", () => {
  it("shows last week's top 3 under the 3 ghosts of an empty week", () => {
    const model = pageModel(mondaySnap());
    const cards = board(model);
    assert.equal(cards.thin, true);
    assert.equal(cards.ghosts.length, LEADERBOARD_MIN_ENTRIES, "ghosts stay");
    assert.deepEqual(cards.lastWeekTop, [
      { rank: 1, username: "ace", displayName: "Ace Collector", avatarUrl: null, scoreText: "12 cards" },
      { rank: 2, username: "bo", displayName: "Bo Pulls", avatarUrl: null, scoreText: "9 cards" },
      { rank: 3, username: "cy", displayName: "Cy Slabs", avatarUrl: null, scoreText: "7 cards" },
    ]);

    const section = boardHtml(render(model), BOARD);
    assert.equal((section.match(/data-ghost-rank=/g) ?? []).length, 3, "still 3 ghosts drawn");
    const preview = previewHtml(section);
    assert.ok(preview, "preview drawn");
    assert.ok(section.indexOf("data-podium") < section.indexOf("data-last-week-preview"), "under the ghosts");
    assert.match(text(preview), /Last week/);
    for (const handle of ["ace", "bo", "cy"]) assert.match(preview, new RegExp(`href="/u/${handle}"`));
    assert.doesNotMatch(preview, /href="\/u\/dee"/, "only the top 3");
    assert.match(preview, /href="\/leaderboard\?week=last&amp;board=most-cards-added"[^>]*>See last week</);
    const first = previewHtml(boardHtml(render(pageModel(snap({}, { "top-card-post": rows(3) }))), "top-card-post"));
    assert.match(first ?? "", /href="\/leaderboard\?week=last"[^>]*>See last week</, "first board: plain ?week=last");
    assert.equal((preview.match(/min-h-11/g) ?? []).length >= 3, true, "44px rows");
    assert.match(preview, /tabular-nums/);
    assert.doesNotMatch(preview, /lb-(banner|ring|ghost)-/, "no gold, silver or bronze");
  });

  it("is empty when this week is full", () => {
    const model = pageModel(snap({ [BOARD]: rows(5) }, { [BOARD]: rows(5) }));
    const cards = board(model);
    assert.equal(cards.thin, false);
    assert.deepEqual(cards.lastWeekTop, []);
    assert.equal(previewHtml(boardHtml(render(model), BOARD)), null);
  });

  it("is empty on the last-week view", () => {
    const model = pageModel(mondaySnap(), null, "previous");
    for (const b of model.boards) assert.deepEqual(b.lastWeekTop, []);
    assert.doesNotMatch(render(model), /data-last-week-preview|See last week/);
  });

  it("leaves out hidden and blocked accounts", () => {
    const model = presentLeaderboard({
      snapshot: mondaySnap(),
      viewer: { userId: "me", hiddenIds: ["ace", "cy"] },
      week: "current",
      focusBoardId: null,
      now: VIEW_NOW,
    });
    const top = board(model).lastWeekTop;
    assert.deepEqual(
      top.map((r) => [r.rank, r.username]),
      [
        [1, "bo"],
        [2, "dee"],
      ],
    );
    const preview = previewHtml(boardHtml(render(model), BOARD)) ?? "";
    assert.doesNotMatch(preview, /\/u\/ace|\/u\/cy|Ace Collector|Cy Slabs/);
  });

  it("draws nothing new when last week is empty too", () => {
    const model = pageModel(snap({}, {}));
    for (const b of model.boards) assert.deepEqual(b.lastWeekTop, []);
    const html = render(model);
    assert.doesNotMatch(html, /data-last-week-preview|See last week/);
    assert.equal((boardHtml(html, BOARD).match(/data-ghost-rank=/g) ?? []).length, 3);
  });
});
