import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { LeaderboardWeekSlice } from "@/lib/leaderboard/present";
import type { CandidateRow } from "@/lib/leaderboard/score";
import { podiumFinishes } from "./podium";

function row(id: string, userId: string, points: number): CandidateRow {
  return {
    id,
    userId,
    title: userId,
    subtitle: `@${userId}`,
    href: `/u/${userId}`,
    avatarUrl: null,
    accent: "#7c5cff",
    contributions: [{ actorId: `fan-${id}`, points }],
  };
}

// Mon Oct 19 to Mon Oct 26 ET. Closed from Tue Oct 27, 00:00 ET.
const slice: LeaderboardWeekSlice = {
  start: "2026-10-19T04:00:00.000Z",
  end: "2026-10-26T04:00:00.000Z",
  finalAt: "2026-10-27T04:00:00.000Z",
  label: "Oct 19 – Oct 25",
  boards: {
    "most-cards-added": {
      rows: [row("a", "a", 9), row("b", "b", 7), row("c", "c", 5), row("d", "d", 3)],
    },
    "top-card-post": {
      rows: [row("p1", "a", 4), row("p2", "a", 3), row("p3", "e", 2)],
    },
  },
};

describe("podium finishes", () => {
  it("lists top 3 per board once the week is closed", () => {
    const rows = podiumFinishes(slice, new Date("2026-10-27T12:00:00.000Z"));
    assert.deepEqual(
      rows.map((item) => `${item.boardId}:${item.userId}:${item.rank}`).sort(),
      [
        "most-cards-added:a:1",
        "most-cards-added:b:2",
        "most-cards-added:c:3",
        "top-card-post:a:1",
        "top-card-post:e:3",
      ],
    );
    assert.ok(rows.every((item) => item.weekStart === "2026-10-19"));
  });

  it("records nothing while the week is still provisional", () => {
    assert.deepEqual(podiumFinishes(slice, new Date("2026-10-26T12:00:00.000Z")), []);
  });
});
