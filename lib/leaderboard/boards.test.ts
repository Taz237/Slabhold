import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "node:test";
import { LeaderboardView } from "@/components/leaderboard-view";
import { presentLeaderboard, rankBoard, unavailableLeaderboard, type LeaderboardSnapshot } from "./present";
import { profileLinkFor } from "./profile-link";
import {
  LEADERBOARD_TABS,
  LEADERBOARD_TOP_LIMIT,
  ON_BOARD_THIN_DETAIL,
  ON_BOARD_THIN_TITLE,
  OPEN_SPOT_CLOSED_LABEL,
  OPEN_SPOT_LABEL,
  RULES_LINE,
  leaderboardFocus,
  leaderboardHref,
  parseLeaderboardQuery,
  type LeaderboardBoardId,
} from "./rules";
import type { CandidateRow } from "./score";
import { emptySnapshot } from "./snapshot";

const NOW = new Date("2026-10-23T18:00:00.000Z");
const PAGE_ORDER = ["most-cards-added", "rising-collectors", "top-card-post"];

function person(userId: string, points: number, extra: Partial<CandidateRow> = {}): CandidateRow {
  return {
    id: userId,
    userId,
    title: `Name ${userId}`,
    subtitle: `@${userId}`,
    href: `/u/${userId}`,
    avatarUrl: null,
    accent: "#7c5cff",
    contributions: [{ actorId: "fan", points }],
    ...extra,
  };
}

type Rows = Partial<Record<LeaderboardBoardId, CandidateRow[]>>;

function snap(boards: Rows, previous: Rows = {}): LeaderboardSnapshot {
  const empty = emptySnapshot(NOW);
  for (const [id, rows] of Object.entries(boards)) empty.current.boards[id as LeaderboardBoardId] = { rows };
  for (const [id, rows] of Object.entries(previous)) empty.previous.boards[id as LeaderboardBoardId] = { rows };
  return empty;
}

function model(
  snapshot: LeaderboardSnapshot,
  viewer: string | null = null,
  week: "current" | "previous" = "current",
  focusBoardId: string | null = null,
) {
  return presentLeaderboard({ snapshot, viewer: { userId: viewer, hiddenIds: [] }, week, focusBoardId, now: NOW });
}

function html(input: ReturnType<typeof model>) {
  return renderToStaticMarkup(createElement(LeaderboardView, { model: input }));
}

/** The markup of one board's section. */
function section(markup: string, boardId: string): string {
  const start = markup.indexOf(`data-board="${boardId}"`);
  assert.ok(start > 0, `board ${boardId} is on the page`);
  const end = markup.indexOf("</section>", start);
  return markup.slice(start, end);
}

function many(count: number): CandidateRow[] {
  return Array.from({ length: count }, (_, index) => person(`u${index}`, 30 - index));
}

describe("three boards on one page", () => {
  it("stacks the 3 boards in page order with at most 10 rows each and no chips", () => {
    const page = model(snap({ "most-cards-added": many(12), "rising-collectors": many(4), "top-card-post": many(2) }));
    assert.deepEqual(
      page.boards.map((board) => board.id),
      PAGE_ORDER,
    );
    assert.deepEqual(
      page.boards.map((board) => board.label),
      ["Most cards added", "Rising collectors", "Top card post"],
    );
    for (const board of page.boards) assert.ok(board.entries.length <= LEADERBOARD_TOP_LIMIT);
    assert.equal(page.boards[0]?.entries.length, 10);
    assert.equal("tabs" in page, false);
    const markup = html(page);
    assert.doesNotMatch(markup, /data-board-tabs/);
    const order = PAGE_ORDER.map((id) => markup.indexOf(`data-board="${id}"`));
    assert.deepEqual([...order].sort((a, b) => a - b), order);
    assert.match(markup, /Add cards with a real photo this week\./);
    assert.equal(
      readFileSync(join(process.cwd(), "components/leaderboard-view.tsx"), "utf8").includes("leaderboard-chips"),
      false,
    );
  });

  it("keeps ?board= and ?week=last links working and focuses the linked board", () => {
    assert.deepEqual(parseLeaderboardQuery("last", "rising-collectors"), { week: "previous", boardId: "rising-collectors" });
    assert.equal(parseLeaderboardQuery(undefined, "nope").boardId, LEADERBOARD_TABS[0].id);
    assert.equal(leaderboardHref("previous", "rising-collectors"), "/leaderboard?week=last&board=rising-collectors");
    assert.equal(leaderboardFocus("rising-collectors"), "rising-collectors");
    assert.equal(leaderboardFocus(undefined), null);
    assert.equal(leaderboardFocus("value"), null);
    const page = model(snap({}), null, "current", "rising-collectors");
    assert.equal(page.focusBoardId, "rising-collectors");
    assert.deepEqual(
      page.boards.map((board) => board.focused),
      [false, true, false],
    );
    const markup = html(page);
    assert.match(markup, /id="board-rising-collectors"/);
    assert.match(markup, /data-board="rising-collectors"[^>]*data-board-focus=""|data-board-focus=""[^>]*data-board="rising-collectors"/);
    assert.equal((markup.match(/data-board-focus=""/g) ?? []).length, 1);
    assert.doesNotMatch(html(model(snap({}))), /data-board-focus=""/);
    assert.equal(model(snap({}), null, "previous").weekLinks[0]?.href, "/leaderboard");
    assert.equal(model(snap({})).weekLinks[1]?.href, "/leaderboard?week=last");
  });

  it("shows Provisional or Closed as a small pill", () => {
    const markup = html(model(snap({})));
    assert.match(markup, /data-standing=""[^>]*>Provisional</);
    assert.match(markup, /rounded-full[^"]*"[^>]*data-standing=""|data-standing=""[^>]*class="[^"]*rounded-full/);
  });

  it("draws 3 skeleton board cards while loading", () => {
    const loading = readFileSync(join(process.cwd(), "app/(app)/leaderboard/loading.tsx"), "utf8");
    assert.match(loading, /data-leaderboard-loading/);
    assert.match(loading, /data-board-skeleton/);
    assert.match(loading, /\[0, 1, 2\]\.map/);
  });
});

describe("rows", () => {
  it("gives ranks 1, 2 and 3 gold, silver and bronze banners and leaves 4 to 10 plain", () => {
    const markup = section(html(model(snap({ "most-cards-added": many(10) }))), "most-cards-added");
    const rowHtml = (rank: number) => {
      const start = markup.indexOf(`data-rank="${rank}"`);
      return markup.slice(start, markup.indexOf("</li>", start));
    };
    assert.match(rowHtml(1), /lb-banner lb-banner-1/);
    assert.match(rowHtml(1), />1ST</);
    assert.match(rowHtml(1), /data-crown=""/);
    assert.match(rowHtml(2), /lb-banner lb-banner-2/);
    assert.match(rowHtml(2), />2ND</);
    assert.match(rowHtml(3), /lb-banner lb-banner-3/);
    assert.match(rowHtml(3), />3RD</);
    for (let rank = 4; rank <= 10; rank += 1) {
      assert.doesNotMatch(rowHtml(rank), /lb-banner|>1ST<|>2ND<|>3RD<|data-crown/);
    }
    assert.match(rowHtml(1), /href="\/u\/u0\?tab=cards"/);
    assert.match(rowHtml(1), /Name u0/);
    assert.match(rowHtml(1), /@u0/);
    assert.match(rowHtml(1), /30<\/span>/);
    assert.match(rowHtml(4), /min-h-12/);
    assert.doesNotMatch(markup, /data-rank="11"/);
  });

  it("links rows to /u/<handle> and leaves odd handles unlinked", () => {
    const base = person("ok", 1);
    assert.equal(profileLinkFor(base), "/u/ok");
    assert.equal(profileLinkFor({ ...base, subtitle: "@Card_Guy", href: "/posts/p1" }), "/u/Card_Guy");
    assert.equal(profileLinkFor({ ...base, subtitle: "plain", href: "/posts/p1" }), "/u/plain");
    assert.equal(profileLinkFor({ ...base, subtitle: "", href: "/posts/p1" }), null);
    assert.equal(profileLinkFor({ ...base, subtitle: "@two words", href: "/posts/p1" }), null);
    assert.equal(profileLinkFor({ ...base, subtitle: "@a/b", href: "/posts/p1" }), null);
    assert.equal(profileLinkFor({ ...base, subtitle: "@..", href: "/posts/p1" }), null);
    assert.equal(profileLinkFor({ ...base, subtitle: "", href: "/u/ok" }), "/u/ok");
    assert.equal(profileLinkFor({ ...base, subtitle: "@a/b", href: "/u/ok" }), "/u/ok");

    const odd = person("odd", 5, { subtitle: "@a/b", href: "/posts/odd" });
    const markup = section(html(model(snap({ "top-card-post": [odd, person("fine", 2)] }))), "top-card-post");
    const oddRow = markup.slice(markup.indexOf('data-rank="1"'), markup.indexOf('data-rank="2"'));
    assert.doesNotMatch(oddRow, /<a /);
    assert.match(oddRow, /<div/);
    assert.doesNotMatch(markup, /href="\/posts\//);
    assert.match(markup, /href="\/u\/fine\?tab=cards"/);
  });

  it("matches the viewer row by user id, not by rank", () => {
    const page = model(snap({ "most-cards-added": [person("a", 3), person("me", 3), person("c", 1)] }), "me");
    const board = page.boards[0];
    assert.equal(page.viewerUserId, "me");
    assert.deepEqual(
      board?.entries.map((entry) => [entry.userId, entry.mine]),
      [
        ["a", false],
        ["me", true],
        ["c", false],
      ],
    );
    const markup = section(html(page), "most-cards-added");
    assert.equal((markup.match(/data-viewer-row=""/g) ?? []).length, 1);
    const mine = markup.slice(markup.indexOf('data-viewer-row=""'));
    assert.match(mine.slice(0, mine.indexOf("</li>")), /Name me[\s\S]*>You</);
  });

  it("staggers rows in and turns motion off for reduced motion", () => {
    const markup = html(model(snap({ "most-cards-added": many(4) })));
    assert.match(markup, /animation-delay:/);
    assert.match(markup, /@keyframes lb-rise/);
    assert.match(markup, /prefers-reduced-motion: reduce\)[\s\S]*\.lb-row[\s\S]*animation: none/);
    assert.match(markup, /\.lb-banner-1::after/);
  });
});

describe("thin boards", () => {
  it("keeps real rows when only 1 or 2 people are ranked", () => {
    const one = rankBoard([person("solo", 2)], [], null, "cards", { boardId: "most-cards-added" });
    assert.equal(one.thin, true);
    assert.deepEqual(
      one.entries.map((entry) => entry.userId),
      ["solo"],
    );
    const two = rankBoard([person("a", 2), person("b", 1)], [], null, "cards");
    assert.equal(two.entries.length, 2);
  });

  it("fills the podium with open spots that carry the board's call to action", () => {
    const page = model(snap({ "most-cards-added": [person("solo", 2)] }));
    const board = page.boards[0];
    assert.equal(board?.entries.length, 1);
    assert.deepEqual(
      board?.ghosts.map((ghost) => [ghost.rank, ghost.title, ghost.ctaLabel, ghost.ctaHref]),
      [
        [2, OPEN_SPOT_LABEL, "Add a card", "/cards/new"],
        [3, OPEN_SPOT_LABEL, "Add a card", "/cards/new"],
      ],
    );
    const markup = html(page);
    const cards = section(markup, "most-cards-added");
    assert.match(cards, /data-rank="1"/);
    assert.match(cards, /data-ghost-rank="2"/);
    assert.match(cards, /data-ghost-rank="3"/);
    assert.match(cards, /href="\/cards\/new"/);
    assert.match(cards, /lb-ghost lb-ghost-2/);
    assert.match(section(markup, "rising-collectors"), /href="\/search"[\s\S]*Find collectors to follow/);
    assert.match(section(markup, "top-card-post"), /href="\/compose"[\s\S]*Post a card/);
    assert.doesNotMatch(markup, /data-empty-cta|data-thin-board|Be the first name here/);
  });

  it("shows 3 open spots and the lead line on an empty board", () => {
    const page = model(snap({}));
    for (const board of page.boards) {
      assert.equal(board.entries.length, 0);
      assert.deepEqual(
        board.ghosts.map((ghost) => ghost.rank),
        [1, 2, 3],
      );
    }
    const cards = section(html(page), "most-cards-added");
    assert.match(cards, /Add cards with a real photo this week\./);
    assert.match(cards, /lb-ghost lb-ghost-1[\s\S]*lb-ghost lb-ghost-2[\s\S]*lb-ghost lb-ghost-3/);
  });

  it("gives last week's open spots no call to action", () => {
    const page = model(snap({}, { "rising-collectors": [person("a", 1)] }), "me", "previous");
    const rising = page.boards[1];
    assert.equal(rising?.entries.length, 1);
    for (const board of page.boards) {
      for (const ghost of board.ghosts) {
        assert.equal(ghost.title, OPEN_SPOT_CLOSED_LABEL);
        assert.equal(ghost.ctaLabel, null);
        assert.equal(ghost.ctaHref, null);
      }
    }
    const markup = html(page);
    assert.match(markup, /No one took this spot/);
    assert.doesNotMatch(markup, /href="\/cards\/new"|href="\/search"|href="\/compose"/);
    assert.match(section(markup, "rising-collectors"), /Get follows from real collectors last week\./);
  });

  it("never draws open spots past rank 3", () => {
    for (const count of [0, 1, 2, 3, 4, 10]) {
      const board = model(snap({ "most-cards-added": many(count) })).boards[0];
      assert.equal(board?.ghosts.some((ghost) => ghost.rank > 3), false);
      assert.equal((board?.entries.length ?? 0) + (board?.ghosts.length ?? 0) >= 3, true);
      if (count >= 3) assert.equal(board?.ghosts.length, 0);
    }
  });

  it("says You're on the board only this week", () => {
    const rows = { "most-cards-added": [person("me", 2)] };
    const current = model(snap(rows), "me").boards[0];
    assert.equal(current?.leadTitle, ON_BOARD_THIN_TITLE);
    assert.equal(current?.lead, ON_BOARD_THIN_DETAIL);
    const last = model(snap({}, rows), "me", "previous");
    assert.equal(last.boards[0]?.entries.length, 1);
    assert.equal(last.boards[0]?.leadTitle, null);
    assert.equal(last.boards[0]?.lead, "Add cards with a real photo last week.");
    const markup = html(last);
    assert.doesNotMatch(markup, /You(?:'|&#x27;)re on the board/);
    assert.doesNotMatch(markup, new RegExp(ON_BOARD_THIN_DETAIL));
  });
});

describe("your spot and rules", () => {
  it("shows the Your spot bar in each board whenever the viewer is signed in, inside or outside the top 10", () => {
    const rows = [...many(12), person("me", 1)];
    const outside = model(snap({ "most-cards-added": rows }), "me");
    const cards = outside.boards[0];
    assert.equal(cards?.yourSpot?.rank, 13);
    assert.match(cards?.yourSpot?.gap ?? "", /more cards? to reach the top 10/);
    assert.equal(outside.boards[1]?.yourSpot?.rank, 0);
    assert.equal(outside.boards[1]?.yourSpot?.ctaHref, "/search");
    const markup = html(outside);
    assert.match(section(markup, "most-cards-added"), /data-your-spot=""[\s\S]*#13/);
    assert.match(section(markup, "rising-collectors"), /data-your-spot=""[\s\S]*>Find collectors</);
    assert.match(section(markup, "top-card-post"), /data-your-spot=""[\s\S]*Post a card/);

    const inside = model(snap({ "most-cards-added": [person("me", 9), ...many(5)] }), "me");
    assert.equal(inside.boards[0]?.yourSpot, null);
    assert.equal(inside.boards[0]?.you?.rank, 6);
    assert.match(section(html(inside), "most-cards-added"), /data-your-spot=""[\s\S]*#6/);

    const guest = model(snap({ "most-cards-added": rows }));
    for (const board of guest.boards) assert.equal(board.yourSpot, null);
    assert.doesNotMatch(html(guest), /data-your-spot/);
  });

  it("has no fixed You card, spacer or bottom padding hacks", () => {
    const markup = html(model(snap({ "most-cards-added": many(12) }), "u11"));
    assert.doesNotMatch(markup, /data-you-row|data-you-spacer|fixed inset-x-0|-mb-\[calc/);
  });

  it("keeps the rules to one line plus an info control", () => {
    const page = model(snap({}));
    assert.equal("howTo" in page, false);
    assert.equal("checklist" in page, false);
    const markup = html(page);
    assert.doesNotMatch(markup, /How to get on the leaderboard|Your checklist/);
    assert.match(markup, new RegExp(RULES_LINE.replace("·", "·")));
    const sheet = markup.slice(markup.indexOf("<details"), markup.indexOf("</details>"));
    assert.match(sheet, /data-rules=""/);
    assert.match(sheet, /aria-label="How the boards work"/);
    for (const tab of LEADERBOARD_TABS) {
      assert.match(sheet, new RegExp(tab.label));
      for (const line of tab.howTo) {
        const escaped = line.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/'/g, "(?:'|&#x27;)");
        assert.match(sheet, new RegExp(escaped));
      }
    }
  });

  it("shows one error card and no boards when the read fails", () => {
    const error = unavailableLeaderboard({ week: "current", focusBoardId: null, now: NOW });
    assert.equal(error.status, "error");
    assert.deepEqual(error.boards, []);
    const markup = renderToStaticMarkup(createElement(LeaderboardView, { model: error }));
    assert.match(markup, /data-board-error/);
    assert.doesNotMatch(markup, /data-ghost-rank/);
  });
});
