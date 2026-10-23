import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { join } from "node:path";
import { renderLeaderboardOg } from "@/components/og-frame";
import { leaderboardCacheControl } from "./cache";
import { emptySnapshot } from "./snapshot";
import { leaderboardShareModel, type LeaderboardShareModel } from "./share";
import { LEADERBOARD_CACHE_SECONDS, LEADERBOARD_TITLE } from "./rules";

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

const ARABIC = "مرحبا";
const PERSIAN = "سلام ک پ";

describe("leaderboard share image", () => {
  it("strips Arabic and Persian text and still renders a png", async () => {
    const model: LeaderboardShareModel = {
      title: `${LEADERBOARD_TITLE} ${ARABIC}`,
      kicker: PERSIAN,
      detail: `Top card post ${ARABIC}`,
      lines: [
        { place: "#1", name: `علی ${PERSIAN} Wemby`, detail: `4 likes and replies ${ARABIC}` },
        { place: "#2", name: ARABIC, detail: "" },
        { place: "#3", name: "A".repeat(400), detail: "2 likes and replies" },
      ],
    };
    const response = await renderLeaderboardOg(model);
    assert.equal(response.headers.get("content-type"), "image/png");
    assert.equal(response.headers.get("cache-control"), leaderboardCacheControl());
    assert.match(leaderboardCacheControl(), new RegExp(`s-maxage=${LEADERBOARD_CACHE_SECONDS}`));
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(bytes[0], 0x89);
    assert.equal(bytes[1], 0x50);
    assert.ok(bytes.length > 500);

    const empty = leaderboardShareModel(emptySnapshot(new Date("2026-10-23T18:00:00.000Z")));
    assert.equal(empty.lines.length, 0);
    assert.equal(empty.title, LEADERBOARD_TITLE);
    const blank = await renderLeaderboardOg(empty);
    const blankBytes = Buffer.from(await blank.arrayBuffer());
    assert.equal(blankBytes[0], 0x89);
  });

  it("draws text and the app mark, not a team or league logo", () => {
    const source = read("components/og-frame.tsx");
    const node = source.slice(source.indexOf("function leaderboardNode"), source.indexOf("export async function renderLeaderboardOg"));
    assert.ok(node.length > 40);
    assert.match(node, /stripUnsupportedOgText/);
    assert.doesNotMatch(node, /<img|nfl|logo\.svg|http/i);
    const route = read("app/leaderboard/opengraph-image.tsx");
    const twitter = read("app/leaderboard/twitter-image.tsx");
    assert.match(route, /renderLeaderboardOg/);
    assert.match(route, /leaderboardShareModel/);
    assert.match(twitter, /opengraph-image/);
    assert.equal(LEADERBOARD_TITLE, "Leaderboard");
  });
});
