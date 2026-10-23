import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "node:test";
import { join } from "node:path";
import { LeaderboardView } from "@/components/leaderboard-view";
import { presentLeaderboard, rankBoard, type LeaderboardSnapshot } from "./present";
import {
  ACTOR_MIN_AGE_DAYS,
  ACTOR_MIN_CONTENT,
  LEADERBOARD_CACHE_SECONDS,
  LEADERBOARD_DESCRIPTION,
  LEADERBOARD_MIN_ENTRIES,
  LEADERBOARD_TABS,
  LEADERBOARD_TOP_LIMIT,
  THIN_BOARD_TITLE,
  TOP_CARD_LEAD,
  VALUE_BOARD_ID,
  leaderboardTab,
  parseLeaderboardQuery,
} from "./rules";
import { emptySnapshot } from "./snapshot";
import { TEST_ACCOUNT_PREFIXES } from "@/lib/test-accounts";

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

const BANNED = /\b(investment|returns|prize|prizes)\b/i;

function snapshot(): LeaderboardSnapshot {
  const empty = emptySnapshot(new Date("2026-10-23T18:00:00.000Z"));
  const row = (id: string, userId: string, points: number) => ({
    id,
    userId,
    title: `Card ${id}`,
    subtitle: `@${userId}`,
    href: `/posts/${id}`,
    avatarUrl: null,
    accent: "#7c5cff",
    contributions: [{ actorId: "fan", points }],
  });
  empty.current.boards["top-card-post"] = {
    rows: [row("p1", "a", 5), row("p2", "b", 4), row("p3", "c", 3), row("p4", "me", 1)],
  };
  return empty;
}

describe("leaderboard page", () => {
  it("reads the how-to lines from the scoring constants and shows no value tab", () => {
    assert.equal(LEADERBOARD_TABS.some((tab) => tab.id === VALUE_BOARD_ID), false);
    assert.equal(leaderboardTab(VALUE_BOARD_ID), null);
    assert.equal(parseLeaderboardQuery("last", "value").boardId, LEADERBOARD_TABS[0].id);
    assert.equal(parseLeaderboardQuery("last", "rising-collectors").week, "previous");
    const lead = LEADERBOARD_TABS[0].howTo[0];
    assert.equal(lead, TOP_CARD_LEAD);
    assert.match(LEADERBOARD_TABS[0].howTo.join(" "), new RegExp(String(ACTOR_MIN_AGE_DAYS)));
    assert.match(LEADERBOARD_TABS[0].howTo.join(" "), new RegExp(String(ACTOR_MIN_CONTENT)));
    assert.match(LEADERBOARD_TABS[1].howTo.join(" "), new RegExp(TEST_ACCOUNT_PREFIXES.join(", ")));
    assert.equal(LEADERBOARD_MIN_ENTRIES, 3);
    assert.equal(LEADERBOARD_TOP_LIMIT, 10);
    assert.equal(LEADERBOARD_CACHE_SECONDS, 300);
    const model = presentLeaderboard({
      snapshot: snapshot(),
      viewer: { userId: "me", hiddenIds: ["b"] },
      week: "current",
      boardId: "top-card-post",
      now: new Date("2026-10-23T18:00:00.000Z"),
    });
    assert.equal(model.tabs.some((tab) => tab.id === "value"), false);
    assert.equal(model.entries.some((entry) => entry.userId === "b"), false);
    assert.equal(model.you?.label, "You: #3");
    assert.equal(model.standing, "Provisional");
    assert.match(model.countdownLabel, /^Resets in /);
    const html = renderToStaticMarkup(createElement(LeaderboardView, { model }));
    assert.match(html, /How to get on the leaderboard/);
    assert.match(html, /Post a card\. Likes and replies from real collectors count\./);
    assert.match(html, /You: #3/);
    assert.match(html, /data-board="top-card-post"/);
    assert.match(html, /data-board="rising-collectors"/);
    assert.doesNotMatch(html, /data-board="value"/);
    assert.doesNotMatch(html, BANNED);
    assert.doesNotMatch(LEADERBOARD_DESCRIPTION, BANNED);

    const thin = presentLeaderboard({
      snapshot: emptySnapshot(new Date("2026-10-23T18:00:00.000Z")),
      viewer: { userId: null, hiddenIds: [] },
      week: "previous",
      boardId: "rising-collectors",
      now: new Date("2026-10-27T04:00:00.000Z"),
    });
    assert.equal(thin.thin, true);
    assert.equal(thin.standing, "Final");
    assert.equal(thin.entries.length, 0);
    assert.equal(thin.you, null);
    const thinHtml = renderToStaticMarkup(createElement(LeaderboardView, { model: thin }));
    assert.match(thinHtml, new RegExp(THIN_BOARD_TITLE));
    assert.doesNotMatch(thinHtml, /#1/);
  });

  it("caps the list at 10 and still ranks the viewer past that", () => {
    const rows = Array.from({ length: 12 }, (_, index) => ({
      id: `p${index}`,
      userId: `u${index}`,
      title: `Card ${String(index).padStart(2, "0")}`,
      subtitle: `@u${index}`,
      href: `/posts/p${index}`,
      avatarUrl: null,
      accent: "#7c5cff",
      contributions: [{ actorId: "fan", points: 20 - index }],
    }));
    const ranked = rankBoard(rows, [], "u11", "likes and replies");
    assert.equal(ranked.entries.length, 10);
    assert.equal(ranked.you?.label, "You: #12");
    assert.equal(ranked.entries.some((entry) => entry.score <= 0), false);
  });

  it("keeps the shared cache free of the viewer and off the home and login bundles", () => {
    const load = read("lib/leaderboard/load.ts");
    const cachedStart = load.indexOf("export async function getLeaderboardSnapshot");
    const cachedEnd = load.indexOf("async function readViewer");
    const cached = load.slice(cachedStart, cachedEnd);
    assert.ok(cachedStart > 0 && cachedEnd > cachedStart);
    assert.doesNotMatch(cached, /getAuthUserId|hiddenIds|readViewer|cookies\(/);
    assert.match(load, /revalidate: LEADERBOARD_CACHE_SECONDS/);
    assert.match(load, /kind", "like"/);
    const home = read("app/page.tsx");
    const login = read("app/login/page.tsx");
    const feed = read("components/feed-view.tsx");
    const bundle = `${home}\n${login}\n${feed}`;
    assert.doesNotMatch(bundle, /leaderboard-countdown|leaderboard-view|getLeaderboardPage|getLeaderboardSnapshot/);
    assert.match(read("components/moving-today-slot.tsx"), /LeaderboardHomeLink/);
    assert.match(feed, /lane === "foryou" \? movingToday \?\? <MovingToday \/>/);
  });
});
