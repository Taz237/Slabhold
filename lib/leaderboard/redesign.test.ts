import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { renderLeaderboardRankOg } from "@/components/og-frame";
import { boardHtml, items, listHtml, pageModel, render, row, rows, snap } from "@/lib/test/leaderboard-view";
import { moveLabel, ordinal, rankShareLink, rankSharePath, rankShareText, spotHook } from "./hooks";
import { rankMove, type RankedEntry, type YouRow } from "./present";
import { leaderboardRankShareModel } from "./share";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const BRAND_ID = "744fedf0-f012-4c9d-841f-18531fdde340";

function you(rank: number, score: number, extra: Partial<YouRow> = {}): YouRow {
  return {
    rank,
    score,
    title: "Me",
    subtitle: "@me",
    href: "/u/me",
    scoreLabel: "cards",
    label: `You: #${rank}`,
    gap: "",
    ctaLabel: null,
    ctaHref: null,
    rival: null,
    avatarUrl: null,
    accent: "#7c5cff",
    ...extra,
  };
}

function entry(userId: string, rank: number): RankedEntry {
  return {
    id: userId,
    userId,
    rank,
    score: 20 - rank,
    title: userId,
    subtitle: `@${userId}`,
    href: `/u/${userId}`,
    avatarUrl: null,
    accent: "#7c5cff",
    scoreLabel: "cards",
    isNew: false,
  };
}

describe("the viewer's hook", () => {
  it("says what it takes to pass the place ahead, with the real gap, unit and handle", () => {
    const rival = { name: "Flaherty", handle: "@flaherty", need: 2, tied: false };
    assert.deepEqual(spotHook(you(3, 5, { rival }), "cards", "current"), { rank: "#3", line: "3 cards to pass @flaherty" });
    // Level on points: one more passes.
    assert.equal(spotHook(you(2, 9, { rival: { ...rival, need: 0, tied: true } }), "cards", "current").line, "1 card to pass @flaherty");
    assert.equal(spotHook(you(4, 1, { rival: { ...rival, need: 1 } }), "replies", "current").line, "2 replies to pass @flaherty");
    assert.equal(spotHook(you(2, 1, { rival: { ...rival, need: 0, tied: true } }), "new followers", "current").line, "1 new follower to pass @flaherty");
  });

  it("says the lead at #1, the top-10 gap below it, and never a number it does not have", () => {
    const rival = { name: "Flaherty", handle: "@flaherty", need: 3, tied: false };
    assert.equal(spotHook(you(1, 8, { rival }), "cards", "current").line, "3 cards ahead of @flaherty");
    assert.equal(spotHook(you(1, 8, { rival: { ...rival, need: 0, tied: true } }), "cards", "current").line, "Tied with @flaherty");
    assert.deepEqual(spotHook(you(1, 4), "cards", "current"), { rank: "#1", line: "Top spot" });
    const outside = you(13, 1, { gap: "9 more cards to reach the top 10" });
    assert.deepEqual(spotHook(outside, "cards", "current"), { rank: "#13", line: "9 more cards to reach the top 10" });
    assert.deepEqual(spotHook(you(0, 0), "cards", "current"), { rank: "", line: "Not ranked yet" });
  });

  it("keeps You finished #N on Last week, with nothing to chase", () => {
    const rival = { name: "Flaherty", handle: "@flaherty", need: 2, tied: false };
    assert.deepEqual(spotHook(you(3, 5, { rival }), "cards", "previous"), { rank: "#3", line: "You finished #3" });
  });
});

describe("rank movement against last week", () => {
  it("is up, down or the same only from a real place in last week's top 10", () => {
    const lastWeek = [entry("a", 1), entry("b", 2), entry("c", 5)];
    assert.deepEqual(rankMove("most-cards-added", 2, "c", lastWeek), { direction: "up", places: 3 });
    assert.deepEqual(rankMove("most-cards-added", 4, "a", lastWeek), { direction: "down", places: 3 });
    assert.deepEqual(rankMove("rising-collectors", 2, "b", lastWeek), { direction: "same", places: 0 });
    assert.equal(rankMove("most-cards-added", 1, "new", lastWeek), null, "no place last week, no arrow");
    assert.equal(rankMove("top-card-post", 1, "a", lastWeek), null, "posts are new every week");
    assert.equal(moveLabel({ direction: "up", places: 3 }), "Up 3 from last week");
    assert.equal(moveLabel({ direction: "down", places: 1 }), "Down 1 from last week");
    assert.equal(moveLabel({ direction: "same", places: 0 }), "Same place as last week");
  });

  it("never invents a prior place below last week's top 10, and shows none on Last week", () => {
    // u11 was 12th last week: on the board (so not New), but with no top-10 place to compare.
    const model = pageModel(snap({ "most-cards-added": [row("u11", 40), row("u0", 30), row("fresh", 20)] }, { "most-cards-added": rows(12) }));
    const cards = model.boards.find((board) => board.id === "most-cards-added");
    assert.deepEqual(
      cards?.entries.map((item) => [item.userId, item.isNew, item.move]),
      [
        ["u11", false, null],
        ["u0", false, { direction: "down", places: 1 }],
        ["fresh", true, null],
      ],
    );
    const podium = items(listHtml(boardHtml(render(model), "most-cards-added"), "data-podium") ?? "");
    assert.doesNotMatch(podium[0]!.body, /data-move|>New</);
    assert.match(podium[1]!.body, /data-move="down"[\s\S]*>1<[\s\S]*class="sr-only">Down 1 from last week</);
    assert.match(podium[2]!.body, />New</);
    assert.doesNotMatch(podium[2]!.body, /data-move/);

    const last = pageModel(snap({ "most-cards-added": rows(3) }, { "most-cards-added": rows(3) }), null, "previous");
    for (const board of last.boards) for (const item of board.entries) assert.equal(item.move, null);
    assert.doesNotMatch(render(last), /data-move/);
  });

  it("draws up in light purple and down in grey, never green or red", () => {
    const model = pageModel(
      snap({ "most-cards-added": [row("u2", 9), row("u0", 8), row("u1", 7)] }, { "most-cards-added": rows(3) }),
    );
    const html = boardHtml(render(model), "most-cards-added");
    assert.match(html, /data-move="up" class="[^"]*text-\[#C4B5FD\]/);
    assert.match(html, /data-move="down" class="[^"]*text-zinc-400/);
    assert.doesNotMatch(html, /emerald|green-|rose-|red-/);
  });
});

describe("share my rank", () => {
  const board = () =>
    snap({
      "most-cards-added": [row("lead", 10, { title: "Lead Collector" }), row("flaherty", 7), row("me", 5, { title: "Me Collector" }), row("d", 1)],
    });

  it("uses only the viewer's real rank, name, handle, board, week and score", () => {
    const snapshot = board();
    assert.deepEqual(leaderboardRankShareModel(snapshot, "me", "most-cards-added", "current"), {
      rank: 3,
      metal: "bronze",
      name: "Me Collector",
      handle: "@me",
      board: "Most cards added",
      weekTag: "This week",
      weekLabel: snapshot.current.label,
      score: "5 cards",
    });
    assert.equal(leaderboardRankShareModel(snapshot, "lead", "most-cards-added", "current")?.metal, "gold");
    assert.equal(leaderboardRankShareModel(snapshot, "d", "most-cards-added", "current")?.metal, null);
    assert.equal(leaderboardRankShareModel(snapshot, "d", "most-cards-added", "current")?.score, "1 card");
  });

  it("has no image when signed out, unranked, on an unknown board, or for an account that is never ranked", () => {
    const snapshot = board();
    assert.equal(leaderboardRankShareModel(snapshot, null, "most-cards-added", "current"), null);
    assert.equal(leaderboardRankShareModel(snapshot, "nobody", "most-cards-added", "current"), null);
    assert.equal(leaderboardRankShareModel(snapshot, "me", "rising-collectors", "current"), null);
    assert.equal(leaderboardRankShareModel(snapshot, "me", "most-cards-added", "previous"), null);
    assert.equal(leaderboardRankShareModel(snapshot, "me", "value", "current"), null);
    const brand = snap({ "most-cards-added": [row(BRAND_ID, 3), row("b", 1)] });
    assert.equal(leaderboardRankShareModel(brand, BRAND_ID, "most-cards-added", "current"), null);
  });

  it("shares last week's finish from last week's board, and leads with the handle on the post board", () => {
    const snapshot = snap({}, { "top-card-post": [row("p1", 6, { userId: "ann", title: "Wemby Prizm", subtitle: "@ann" })] });
    const model = leaderboardRankShareModel(snapshot, "ann", "top-card-post", "previous");
    assert.equal(model?.rank, 1);
    assert.equal(model?.name, "@ann");
    assert.equal(model?.handle, "", "the handle is not written twice");
    assert.equal(model?.weekTag, "Last week");
    assert.equal(model?.weekLabel, snapshot.previous.label);
    assert.equal(model?.score, "6 replies");
  });

  it("builds the image path, the link and the text from the board and week", () => {
    assert.equal(rankSharePath("most-cards-added", "current"), "/api/share-image/leaderboard-rank?board=most-cards-added");
    assert.equal(rankSharePath("rising-collectors", "previous"), "/api/share-image/leaderboard-rank?board=rising-collectors&week=last");
    assert.equal(rankShareLink("top-card-post", "current"), "/leaderboard?board=top-card-post");
    assert.equal(rankShareLink("most-cards-added", "previous"), "/leaderboard?week=last&board=most-cards-added");
    assert.equal(rankShareText(3, "most-cards-added", "current"), "#3 on Most cards added this week on Slabhold");
    assert.equal(rankShareText(1, "rising-collectors", "previous"), "#1 on Rising collectors last week on Slabhold");
    assert.equal(ordinal(1), "1st");
    assert.equal(ordinal(2), "2nd");
    assert.equal(ordinal(3), "3rd");
  });

  it("draws a 1080 by 1350 PNG that is never cached on a shared CDN", async () => {
    const model = leaderboardRankShareModel(board(), "me", "most-cards-added", "current");
    assert.ok(model);
    const response = renderLeaderboardRankOg(model);
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(bytes.subarray(1, 4).toString("ascii"), "PNG");
    assert.equal(bytes.readUInt32BE(16), 1080);
    assert.equal(bytes.readUInt32BE(20), 1350);
  });

  it("serves the image to its signed-in owner only, from the boards the page already caches", () => {
    const route = read("app/api/share-image/leaderboard-rank/route.tsx");
    assert.match(route, /const userId = await getAuthUserId\(\);\s*if \(!userId\) return notFound\(\);/);
    assert.match(route, /getLeaderboardSnapshot\(\)/);
    assert.doesNotMatch(route, /createSupabaseAdmin|createSupabaseServer|\.from\(/, "no new database read");
    assert.match(route, /if \(!model\) return notFound\(\);/);
  });

  it("is one tap from the viewer's spot: the image with the link, through the existing share paths", () => {
    const button = read("components/leaderboard-share-rank.tsx");
    assert.match(button, /nativeShareOrSheet\(/);
    assert.match(button, /shareFunction\(\)/);
    assert.match(button, /shareFilesNative\(/);
    assert.match(button, /copyText\(url\)/);
    const html = boardHtml(render(pageModel(board(), "me")), "most-cards-added");
    assert.equal((html.match(/data-share-rank=""/g) ?? []).length, 1);
    assert.doesNotMatch(boardHtml(render(pageModel(board())), "most-cards-added"), /data-share-rank/, "guests have no rank to share");
  });
});

describe("collector sheet", () => {
  it("opens from every podium place and rank row that has a clean profile, and keeps the profile link under it", () => {
    const section = boardHtml(render(pageModel(snap({ "most-cards-added": rows(5) }))), "most-cards-added");
    const all = [...items(listHtml(section, "data-podium") ?? ""), ...items(listHtml(section, "data-rank-rows") ?? "")];
    assert.equal(all.length, 5);
    for (const [index, item] of all.entries()) {
      assert.match(
        item.body,
        new RegExp(`<a data-collector="most-cards-added:u${index}" aria-haspopup="dialog"[^>]*href="/u/u${index}/cards"`),
      );
      assert.match(item.body, /class="tap /, "press feedback");
    }
    const odd = boardHtml(
      render(pageModel(snap({ "top-card-post": [row("odd", 5, { subtitle: "@a/b", href: "/posts/odd" })] }))),
      "top-card-post",
    );
    assert.doesNotMatch(odd, /data-collector/);
  });

  it("is a labelled modal dialog that traps focus, closes three ways and gives focus back", () => {
    const sheet = read("components/leaderboard-sheet.tsx");
    assert.match(sheet, /role="dialog"/);
    assert.match(sheet, /aria-modal="true"/);
    assert.match(sheet, /aria-labelledby="lb-sheet-name"/);
    assert.match(sheet, /useFocusTrap\(panel\)/);
    assert.match(sheet, /event\.key === "Escape"/);
    assert.match(sheet, /lb-scrim[^"]*"/);
    assert.equal((sheet.match(/aria-label="Close"/g) ?? []).length, 2, "the scrim and the close button");
    assert.match(sheet, />\s*View profile\s*</);
    assert.match(sheet, /createPortal\(/);
    const stage = read("components/leaderboard-stage.tsx");
    assert.match(stage, /window\.setTimeout\(\(\) => from\?\.focus\(\), 0\)/, "focus returns to the row");
    assert.match(stage, /event\.metaKey \|\| event\.ctrlKey \|\| event\.shiftKey \|\| event\.altKey/, "modified clicks keep the link");
    assert.match(stage, /clearPendingNav\(document\)/);
  });

  it("shows photos only when the row has them, each one a link to the collector's cards", () => {
    const sheet = read("components/leaderboard-sheet.tsx");
    assert.match(sheet, /person\.photos\.length > 0 \?/);
    assert.match(sheet, /<Link\s+href=\{person\.cardsHref\}/);
    const view = read("components/leaderboard-view.tsx");
    assert.match(view, /board\.id === "most-cards-added"\s*\? \(entry\.photos \?\? \[\]\)/, "only Most cards added has photos");
  });

  it("vibrates only where the device can, briefly, and never with Reduce Motion", () => {
    const stage = read("components/leaderboard-stage.tsx");
    const tick = stage.slice(stage.indexOf("function tick()"), stage.indexOf("export function LeaderboardStage"));
    assert.ok(tick.indexOf("prefers-reduced-motion: reduce") < tick.indexOf("navigator.vibrate(8)"));
    assert.match(tick, /typeof navigator\.vibrate === "function"/);
  });
});

describe("header: the layout explains", () => {
  it("keeps the week toggle, the real bounds, the standing pill and the info and share buttons", () => {
    const model = pageModel(snap({ "most-cards-added": rows(4) }));
    const markup = render(model);
    const toggle = markup.slice(markup.indexOf("data-week-toggle"), markup.indexOf("data-week-meta"));
    assert.match(toggle, /<a aria-current="page"[^>]*href="\/leaderboard"[^>]*>This week</);
    assert.match(toggle, /href="\/leaderboard\?week=last"[^>]*>Last week</);
    assert.match(toggle, /lb-week-thumb[^>]*style="transform:translateX\(0%\)"/);
    const meta = markup.slice(markup.indexOf("data-week-meta"), markup.indexOf("data-leaderboard-stage"));
    assert.ok(meta.includes(model.weekLabel));
    assert.match(meta, /data-standing=""[^>]*>Provisional</);
    assert.match(markup, /<summary aria-label="How the boards work"/);
    assert.match(markup, /<button[^>]*aria-label="Share"/);
    const last = render(pageModel(snap({}, { "most-cards-added": rows(4) }), null, "previous"));
    assert.match(last, /lb-week-thumb[^>]*style="transform:translateX\(100%\)"/);
    assert.match(last, /<a aria-current="page"[^>]*href="\/leaderboard\?week=last"[^>]*>Last week</);
  });

  it("puts reset timing in a clock, this week only", () => {
    const model = pageModel(snap({}));
    const markup = render(model);
    const { days, hours, minutes, seconds } = model.countdown;
    assert.equal(model.countdownLabel, `Resets in ${days}d ${String(hours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`);
    const clock = markup.slice(markup.indexOf("data-reset-clock") - 40, markup.indexOf("data-leaderboard-stage"));
    assert.match(clock, /role="timer"/);
    assert.match(clock, new RegExp(`aria-label="Resets in ${days}d `));
    for (const unit of ["days", "hours", "minutes", "seconds"]) assert.match(clock, new RegExp(`data-clock="${unit}"`));
    assert.match(clock, new RegExp(`data-clock="days">${days}<`));
    const source = read("components/leaderboard-countdown.tsx");
    assert.match(source, /shouldReloadForReset\(/);
    assert.match(source, /window\.location\.reload\(\)/);
    assert.doesNotMatch(render(pageModel(snap({}), null, "previous")), /data-reset-clock|Resets in/);
  });

  it("uses Geist and Geist Mono at 400 to 600 only, and brand purple only", () => {
    for (const file of [
      "components/leaderboard-view.tsx",
      "components/leaderboard-stage.tsx",
      "components/leaderboard-sheet.tsx",
      "components/leaderboard-share-rank.tsx",
      "components/leaderboard-countdown.tsx",
      "app/(app)/leaderboard/loading.tsx",
    ]) {
      const source = read(file);
      assert.doesNotMatch(source, /font-(?:bold|extrabold|black)\b|font-weight:\s*(?:[7-9]00|bold)/, file);
      assert.doesNotMatch(source, /#(?:34C1AE|2dd4bf|14b8a6|0d9488|5eead4|1f9e8c)\b|\bteal-|\bcyan-|emerald/i, file);
      assert.doesNotMatch(source, /uppercase/, file);
    }
  });

  it("refreshes on a pull and switches boards on a swipe without holding back a scroll", () => {
    const view = read("components/leaderboard-view.tsx");
    assert.match(view, /<PullToRefresh /);
    assert.match(view, /<LeaderboardRetry \/>/);
    const stage = read("components/leaderboard-stage.tsx");
    assert.match(stage, /addEventListener\("touchstart", onStart, \{ passive: true \}\)/);
    assert.match(stage, /addEventListener\("touchend", onEnd, \{ passive: true \}\)/);
    assert.doesNotMatch(stage, /preventDefault\(\);\s*\/\/ swipe/);
    assert.match(stage, /Math\.abs\(dx\) < Math\.abs\(dy\) \* 2/, "mostly sideways only");
    assert.match(stage, /window\.history\.replaceState\(window\.history\.state, "", rankShareLink\(id, week\)\)/);
  });
});
