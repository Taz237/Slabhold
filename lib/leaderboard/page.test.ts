import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "node:test";
import { join } from "node:path";
import { LeaderboardView } from "@/components/leaderboard-view";
import { presentLeaderboard, rankBoard, unavailableLeaderboard, type LeaderboardSnapshot } from "./present";
import {
  ACTOR_MIN_AGE_DAYS,
  ACTOR_MIN_CONTENT,
  LEADERBOARD_CACHE_SECONDS,
  LEADERBOARD_DESCRIPTION,
  LEADERBOARD_MIN_ENTRIES,
  LEADERBOARD_TABS,
  LEADERBOARD_TOP_LIMIT,
  BOARD_ERROR_TITLE,
  CLOSED_NOTE,
  FINAL_LABEL,
  ON_BOARD_THIN_DETAIL,
  ON_BOARD_THIN_TITLE,
  REMOVED_FOLLOW_RULE,
  TOP_CARD_LEAD,
  VALUE_BOARD_ID,
  leaderboardTab,
  parseLeaderboardQuery,
  scoreUnit,
} from "./rules";
import { pageExceededCap, pageRows } from "./pages";
import { emptySnapshot } from "./snapshot";
import { hiddenIdsForViewer } from "./viewer";
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
    assert.equal(ACTOR_MIN_AGE_DAYS, 1);
    assert.match(LEADERBOARD_TABS[0].howTo.join(" "), /at least a day/);
    assert.doesNotMatch(LEADERBOARD_TABS.map((tab) => tab.howTo.join(" ")).join(" "), /7 days/);
    assert.match(LEADERBOARD_TABS[0].howTo.join(" "), new RegExp(String(ACTOR_MIN_CONTENT)));
    const rules = LEADERBOARD_TABS.map((tab) => tab.howTo.join(" ")).join(" ");
    assert.match(rules, /Test accounts are left out\./);
    assert.doesNotMatch(rules, new RegExp(TEST_ACCOUNT_PREFIXES.join("|")));
    assert.doesNotMatch(rules, /Mail Day posts do not count/);
    assert.equal(LEADERBOARD_MIN_ENTRIES, 3);
    assert.equal(LEADERBOARD_TOP_LIMIT, 10);
    assert.equal(LEADERBOARD_CACHE_SECONDS, 300);
    const model = presentLeaderboard({
      snapshot: snapshot(),
      viewer: { userId: "me", hiddenIds: ["b"] },
      week: "current",
      focusBoardId: null,
      now: new Date("2026-10-23T18:00:00.000Z"),
    });
    const posts = model.boards.find((board) => board.id === "top-card-post");
    assert.equal(model.boards.some((board) => board.id === "value"), false);
    assert.equal(posts?.entries.some((entry) => entry.userId === "b"), false);
    assert.equal(posts?.you?.label, "You: #3");
    assert.equal(posts?.you?.gap, "2 more replies to pass @c");
    assert.equal(posts?.entries[0]?.isNew, true);
    assert.equal(model.boards.some((board) => board.id === "most-cards-added"), true);
    assert.equal(model.standing, "Provisional");
    assert.match(model.countdownLabel, /^Resets in /);
    assert.equal(model.showCountdown, true);
    assert.equal(model.rules[0]?.lines[0], LEADERBOARD_TABS.find((tab) => tab.id === model.rules[0]?.id)?.howTo[0]);
    const html = renderToStaticMarkup(createElement(LeaderboardView, { model }));
    assert.match(html, /Test accounts are left out\./);
    assert.doesNotMatch(html, /Mail Day posts do not count/);
    assert.doesNotMatch(html, /qa_/);
    assert.match(html, /Post a card\. Replies from real collectors count\./);
    assert.match(html, new RegExp(REMOVED_FOLLOW_RULE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.doesNotMatch(html, /removal is still on record|likes and replies|Undone likes/i);
    assert.match(html, /data-board="top-card-post"/);
    assert.match(html, /data-board="rising-collectors"/);
    assert.match(html, /data-board="most-cards-added"/);
    assert.match(html, /data-viewer-row=""/);
    assert.doesNotMatch(html, /data-you-row|data-you-spacer|sticky bottom-/);
    assert.match(html, /data-standing=""[^>]*>Provisional</);
    assert.match(html, /whitespace-nowrap tabular-nums/);
    assert.doesNotMatch(html, /data-board="value"/);
    assert.doesNotMatch(html, BANNED);
    assert.doesNotMatch(LEADERBOARD_DESCRIPTION, BANNED);

    const thin = presentLeaderboard({
      snapshot: emptySnapshot(new Date("2026-10-23T18:00:00.000Z")),
      viewer: { userId: null, hiddenIds: [] },
      week: "previous",
      focusBoardId: "rising-collectors",
      now: new Date("2026-10-27T04:00:00.000Z"),
    });
    const rising = thin.boards.find((board) => board.id === "rising-collectors");
    assert.equal(rising?.thin, true);
    assert.equal(thin.standing, FINAL_LABEL);
    assert.equal(FINAL_LABEL, "Closed");
    assert.equal(thin.standingNote, CLOSED_NOTE);
    assert.equal(rising?.entries.length, 0);
    assert.equal(rising?.you, null);
    assert.equal(thin.description.startsWith("Last week's"), true);
    assert.equal(thin.description.includes("This week's"), false);
    assert.equal(thin.showCountdown, false);
    assert.equal(rising?.lead, "Get follows from real collectors last week.");
    assert.doesNotMatch(rising?.lead ?? "", /this week/);
    const thinHtml = renderToStaticMarkup(createElement(LeaderboardView, { model: thin }));
    assert.doesNotMatch(thinHtml, /Resets in/);
    assert.match(thinHtml, /Get follows from real collectors last week/);
    assert.match(thinHtml, /Last week(?:'|&#x27;)s cards added/);
    assert.doesNotMatch(thinHtml, /This week(?:'|&#x27;)s/);
    assert.match(thinHtml, /data-standing=""[^>]*>Closed</);
    assert.match(thinHtml, /No one took this spot/);
    assert.doesNotMatch(thinHtml, /href="\/search"|href="\/compose"|href="\/cards\/new"/);
    assert.doesNotMatch(thinHtml, />#\d|You: #/);
  });

  it("tells a scored viewer this week that they are on a thin board", () => {
    const snap = emptySnapshot(new Date("2026-10-23T18:00:00.000Z"));
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
    snap.current.boards["top-card-post"] = { rows: [row("p1", "me", 2), row("p2", "other", 1)] };
    const now = new Date("2026-10-23T18:00:00.000Z");
    const scored = presentLeaderboard({
      snapshot: snap,
      viewer: { userId: "me", hiddenIds: [] },
      week: "current",
      focusBoardId: null,
      now,
    });
    const posts = scored.boards.find((board) => board.id === "top-card-post");
    assert.equal(posts?.thin, true);
    assert.equal(posts?.entries.length, 2);
    assert.equal(posts?.you?.label, "You: #1");
    assert.equal(posts?.yourSpot, null);
    assert.equal(posts?.leadTitle, ON_BOARD_THIN_TITLE);
    assert.equal(posts?.lead, ON_BOARD_THIN_DETAIL);
    assert.equal(posts?.ghosts.length, 1);
    const html = renderToStaticMarkup(createElement(LeaderboardView, { model: scored }));
    assert.match(html, /You&#x27;re on the board/);
    assert.match(html, /data-ghost-rank="3"/);

    const guest = presentLeaderboard({
      snapshot: snap,
      viewer: { userId: null, hiddenIds: [] },
      week: "current",
      focusBoardId: null,
      now,
    });
    const guestPosts = guest.boards.find((board) => board.id === "top-card-post");
    assert.equal(guestPosts?.you, null);
    assert.equal(guestPosts?.leadTitle, null);
    assert.equal(guestPosts?.lead, TOP_CARD_LEAD);

    const none = presentLeaderboard({
      snapshot: emptySnapshot(now),
      viewer: { userId: "me", hiddenIds: [] },
      week: "current",
      focusBoardId: null,
      now,
    });
    const nonePosts = none.boards.find((board) => board.id === "top-card-post");
    assert.equal(nonePosts?.thin, true);
    assert.equal(nonePosts?.you?.score, 0);
    assert.equal(nonePosts?.yourSpot?.ctaHref, "/compose");
    assert.equal(nonePosts?.leadTitle, null);
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

  it("renders places 4 through 10 with profile links and drops hidden or unqualified entrants", () => {
    const now = new Date("2026-10-23T16:00:00.000Z");
    const snap = emptySnapshot(now);
    const rows = Array.from({ length: 12 }, (_, index) => ({
      id: `p${index}`,
      userId: `u${index}`,
      title: index === 4 ? "Very Long Display Name That Must Truncate On A Narrow Phone" : `Card ${String(index).padStart(2, "0")}`,
      subtitle: `@u${index}`,
      href: `/posts/p${index}`,
      avatarUrl: null,
      accent: "#7c5cff",
      contributions: [{ actorId: "fan", points: 20 - index }],
    }));
    rows.push({
      id: "zero",
      userId: "zero",
      title: "Zero",
      subtitle: "@zero",
      href: "/posts/zero",
      avatarUrl: null,
      accent: "#7c5cff",
      contributions: [{ actorId: "fan", points: 0 }],
    });
    snap.current.boards["top-card-post"] = { rows };
    const model = presentLeaderboard({
      snapshot: snap,
      viewer: { userId: "u5", hiddenIds: ["u1"] },
      week: "current",
      focusBoardId: null,
      now,
    });
    const posts = model.boards.find((board) => board.id === "top-card-post");
    assert.equal(posts?.thin, false);
    assert.equal(posts?.entries.length, 10);
    assert.equal(posts?.entries.some((entry) => entry.userId === "u1" || entry.userId === "zero" || entry.userId === "u11"), false);
    assert.equal(posts?.entries[3]?.rank, 4);
    assert.equal(posts?.entries.at(-1)?.rank, 10);
    assert.equal(posts?.you?.rank, 5);
    assert.equal(posts?.ghosts.length, 0);
    const html = renderToStaticMarkup(createElement(LeaderboardView, { model }));
    assert.match(html, /lb-banner lb-banner-1/);
    assert.match(html, /data-rank-rows=""/);
    assert.match(html, /data-rank="4"/);
    assert.match(html, /data-rank="10"/);
    assert.doesNotMatch(html, /data-rank="11"/);
    assert.match(html, /href="\/u\/u0"/);
    assert.match(html, /href="\/u\/u10"/);
    assert.doesNotMatch(html, /href="\/posts\//);
    assert.doesNotMatch(html, /href="\/u\/u1"/);
    assert.doesNotMatch(html, /href="\/u\/zero"/);
    assert.match(html, /data-viewer-row=""/);
    assert.match(html, />NEW</);
    assert.match(html, /min-h-14/);
    snap.previous.boards["top-card-post"] = { rows };
    const last = presentLeaderboard({
      snapshot: snap,
      viewer: { userId: "u5", hiddenIds: ["u1"] },
      week: "previous",
      focusBoardId: null,
      now,
    });
    const lastHtml = renderToStaticMarkup(createElement(LeaderboardView, { model: last }));
    assert.match(lastHtml, /data-rank="4"/);
    assert.match(lastHtml, /href="\/u\/u4"/);
    assert.doesNotMatch(lastHtml, /href="\/posts\//);

    snap.current.boards["rising-collectors"] = {
      rows: [
        { id: "a", userId: "ada", title: "Ada Lovelace", subtitle: "@ada", href: "/u/ada", avatarUrl: null, accent: "#10b981", contributions: [{ actorId: "fan", points: 4 }] },
        { id: "b", userId: "bea", title: "Bea", subtitle: "@bea", href: "/u/bea", avatarUrl: null, accent: "#10b981", contributions: [{ actorId: "fan", points: 3 }] },
        { id: "c", userId: "cy", title: "Cy", subtitle: "@cy", href: "/u/cy", avatarUrl: null, accent: "#10b981", contributions: [{ actorId: "fan", points: 2 }] },
        { id: "d", userId: "dee", title: "Dee Collector", subtitle: "@dee", href: "/u/dee", avatarUrl: null, accent: "#10b981", contributions: [{ actorId: "fan", points: 1 }] },
      ],
    };
    const rising = presentLeaderboard({
      snapshot: snap,
      viewer: { userId: null, hiddenIds: [] },
      week: "current",
      focusBoardId: "rising-collectors",
      now,
    });
    const risingHtml = renderToStaticMarkup(createElement(LeaderboardView, { model: rising }));
    assert.match(risingHtml, /data-rank="4"/);
    assert.match(risingHtml, /Dee Collector/);
    assert.match(risingHtml, /@dee/);
    assert.match(risingHtml, /href="\/u\/dee"/);
    assert.match(risingHtml, /new follower/);
  });

  it("hides an entrant who blocked the viewer and shows an error instead of an empty board", () => {
    const hidden = hiddenIdsForViewer(
      "viewer",
      [{ blockerId: "entrant", blockedId: "viewer" }],
      [],
    );
    assert.deepEqual(hidden, ["entrant"]);
    const ranked = rankBoard(
      [
        {
          id: "p1",
          userId: "entrant",
          title: "Card",
          subtitle: "@entrant",
          href: "/posts/p1",
          avatarUrl: null,
          accent: "#7c5cff",
          contributions: [
            { actorId: "fan", points: 3 },
            { actorId: "fan2", points: 2 },
            { actorId: "fan3", points: 1 },
          ],
        },
        {
          id: "p2",
          userId: "other",
          title: "Other",
          subtitle: "@other",
          href: "/posts/p2",
          avatarUrl: null,
          accent: "#7c5cff",
          contributions: [{ actorId: "fan", points: 2 }],
        },
        {
          id: "p3",
          userId: "third",
          title: "Third",
          subtitle: "@third",
          href: "/posts/p3",
          avatarUrl: null,
          accent: "#7c5cff",
          contributions: [{ actorId: "fan", points: 1 }],
        },
        {
          id: "p4",
          userId: "fourth",
          title: "Fourth",
          subtitle: "@fourth",
          href: "/posts/p4",
          avatarUrl: null,
          accent: "#7c5cff",
          contributions: [{ actorId: "fan", points: 1 }],
        },
      ],
      hidden,
      "viewer",
      "replies",
    );
    assert.equal(ranked.entries.some((entry) => entry.userId === "entrant"), false);

    const error = unavailableLeaderboard({
      week: "current",
      focusBoardId: "top-card-post",
      now: new Date("2026-10-23T18:00:00.000Z"),
    });
    assert.equal(error.status, "error");
    assert.deepEqual(error.boards, []);
    assert.equal(error.errorTitle, BOARD_ERROR_TITLE);
    const html = renderToStaticMarkup(createElement(LeaderboardView, { model: error }));
    assert.match(html, /data-board-error/);
    assert.doesNotMatch(html, /Open spot/);
    assert.match(html, /data-rules=""/);
  });

  it("keeps the shared cache free of the viewer and off the home and login bundles", async () => {
    const load = read("lib/leaderboard/load.ts");
    const cachedStart = load.indexOf("export async function getLeaderboardSnapshot");
    const cachedEnd = load.indexOf("async function readViewer");
    const cached = load.slice(cachedStart, cachedEnd);
    assert.ok(cachedStart > 0 && cachedEnd > cachedStart);
    assert.doesNotMatch(cached, /getAuthUserId|hiddenIds|readViewer|cookies\(/);
    assert.match(load, /revalidate: LEADERBOARD_CACHE_SECONDS/);
    assert.match(load, /getPostLikeActors\(\)/);
    assert.doesNotMatch(load, /notifications|kind", "like"|createTtlCache/);
    assert.match(load, /rowsIn\(\s*admin,\s*"profiles"/);
    assert.match(load, /rowsIn\(\s*admin,\s*"cards"/);
    assert.doesNotMatch(load, /pageRows\(\s*admin,\s*"profiles"/);
    assert.match(read("lib/leaderboard/pages.ts"), /pageExceededCap/);
    assert.match(load, /\["created_at", "follower_id", "following_id"\]/);
    assert.match(load, /usersWithACard/);
    assert.match(load, /\.limit\(1\)/);
    assert.doesNotMatch(load, /cards", "id, user_id, is_public, player", "user_id"/);
    assert.match(load, /post_type/);
    assert.match(load, /mail_day/);
    assert.match(read("lib/leaderboard/score.ts"), /postType === "mail_day"/);
    assert.match(read("lib/leaderboard/score.ts"), /isTestAccount/);
    const viewer = load.slice(load.indexOf("async function readViewer"), load.indexOf("export async function getLeaderboardPage"));
    assert.match(viewer, /eq\("blocker_id", userId\)/);
    assert.match(viewer, /eq\("blocked_id", userId\)/);
    assert.match(viewer, /eq\("muter_id", userId\)/);
    assert.match(viewer, /createSupabaseAdmin/);
    assert.match(viewer, /return \{ ok: false \}/);
    assert.doesNotMatch(viewer.slice(viewer.indexOf("catch")), /hiddenIds/);
    assert.match(read("components/leaderboard-view.tsx"), /min-h-11/);
    assert.equal(existsSync(join(process.cwd(), "components/leaderboard-chips.tsx")), false);
    assert.match(read("components/leaderboard-focus.tsx"), /prefers-reduced-motion: reduce/);
    assert.match(read("components/leaderboard-countdown.tsx"), /left\.done/);
    assert.match(read("components/leaderboard-countdown.tsx"), /pastAtMount/);
    assert.match(read("components/leaderboard-countdown.tsx"), /sessionStorage/);
    assert.match(read("components/leaderboard-countdown.tsx"), /location\.reload\(\)/);
    assert.match(read("components/leaderboard-countdown.tsx"), /whitespace-nowrap tabular-nums/);
    assert.match(read("lib/leaderboard/rules.ts"), /Find collectors to follow/);
    assert.match(read("lib/leaderboard/rules.ts"), /href: "\/search"/);
    assert.equal(scoreUnit("replies", 1), "reply");
    assert.equal(scoreUnit("replies", 2), "replies");
    assert.equal(scoreUnit("new followers", 1), "new follower");
    assert.equal(scoreUnit("new followers", 4), "new followers");
    assert.equal(scoreUnit("cards", 1), "card");
    assert.equal(scoreUnit("cards", 25), "cards");
    assert.match(read("app/(app)/leaderboard/loading.tsx"), /data-leaderboard-loading/);
    assert.throws(() => pageExceededCap("blocks", 20_000, 1000), /row cap/);
    pageExceededCap("blocks", 1000, 1000);
    pageExceededCap("blocks", 20_000, 10);
    const ordered: string[] = [];
    const query = {
      eq: () => query,
      gte: () => query,
      lt: () => query,
      is: () => query,
      in: () => query,
      order(column: string) {
        ordered.push(column);
        return query;
      },
      range: async () => ({ data: [], error: null }),
    };
    await pageRows(
      { from: () => ({ select: () => query }) },
      "follows",
      "follower_id, following_id, created_at",
      ["created_at", "follower_id", "following_id"],
      (next) => next,
    );
    assert.deepEqual(ordered, ["created_at", "follower_id", "following_id"]);
    const home = read("app/(app)/page.tsx");
    const login = read("app/(app)/login/page.tsx");
    const feed = read("components/feed-view.tsx");
    const bundle = `${home}\n${login}\n${feed}`;
    assert.doesNotMatch(bundle, /leaderboard-countdown|leaderboard-view|getLeaderboardPage|getLeaderboardSnapshot/);
    assert.match(read("components/home-feed.tsx"), /<LeaderboardHomeLink \/>/);
    assert.match(feed, /lane === "foryou" \? movingToday \?\? <MovingToday \/>/);
  });
});
