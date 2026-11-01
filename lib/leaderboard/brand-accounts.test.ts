import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { isOfficialUpdatesAccount } from "@/lib/social/official-updates";
import { BRAND_ACCOUNT_IDS, isBrandAccount } from "./brand-accounts";
import { rankBoard } from "./present";
import { officialUpdatesRule, type LeaderboardBoardId } from "./rules";
import { buildWeekBoards, type BoardCard, type BoardFollow, type BoardLike, type BoardPost, type BoardProfile, type ScoreInput } from "./score";
import { weekContaining } from "./week";

const BRAND_ID = "744fedf0-f012-4c9d-841f-18531fdde340";
const ORIGIN = "https://proj.supabase.co";
const WEEK = weekContaining(new Date("2026-10-23T18:00:00.000Z"));
const IN_WEEK = "2026-10-21T16:00:00.000Z";
const OLD = "2026-09-01T00:00:00.000Z";
const FANS = ["fan1", "fan2", "fan3", "fan4", "fan5"];

const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
process.env.NEXT_PUBLIC_SUPABASE_URL = ORIGIN;
after(() => {
  if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
});

function profile(id: string, username: string): BoardProfile {
  return { id, username, displayName: username, createdAt: OLD, isTest: false, avatarUrl: null, accent: "#7c5cff" };
}

function card(id: string, userId: string, minute: number): BoardCard {
  return {
    id,
    userId,
    isPublic: true,
    player: `Player ${id}`,
    year: 2024,
    setName: "Prizm",
    parallel: "",
    imageUrl: `${ORIGIN}/storage/v1/object/public/card-photos/${userId}/${id}.jpg`,
    createdAt: new Date(Date.parse(IN_WEEK) + minute * 60_000).toISOString(),
    hidden: false,
    deleted: false,
  };
}

function post(id: string, authorId: string, cardId: string): BoardPost {
  return { id, authorId, body: "Look", hiddenAt: null, deleted: false, cardIds: [cardId], postType: "post", createdAt: IN_WEEK };
}

function follow(followerId: string, followingId: string): BoardFollow {
  return { followerId, followingId, createdAt: IN_WEEK, removedAt: null };
}

function like(actorId: string, postId: string): BoardLike {
  return { actorId, postId, createdAt: IN_WEEK, undone: false };
}

/** The brand account (or an impostor) leads every board by raw points; "normal" has fewer. */
function input(brandId: string, brandHandle: string): ScoreInput {
  return {
    profiles: [profile(brandId, brandHandle), profile("normal", "normal"), ...FANS.map((id) => profile(id, id))],
    posts: [post("brand-post", brandId, "b1"), post("normal-post", "normal", "n1")],
    cards: [
      ...[1, 2, 3, 4, 5].map((n) => card(`b${n}`, brandId, n)),
      card("n1", "normal", 0),
    ],
    usersWithPost: [brandId, "normal", ...FANS],
    likes: [...FANS.map((id) => like(id, "brand-post")), like("fan1", "normal-post")],
    replies: [],
    follows: [...FANS.map((id) => follow(id, brandId)), follow("fan1", "normal")],
    blockPairs: [],
    now: new Date("2026-10-23T18:00:00.000Z"),
  };
}

const BOARDS: LeaderboardBoardId[] = ["top-card-post", "rising-collectors", "most-cards-added"];

function ranked(scoreInput: ScoreInput, boardId: LeaderboardBoardId) {
  const rows = buildWeekBoards(scoreInput, WEEK)[boardId]?.rows ?? [];
  return rankBoard(rows, [], null, "points", { boardId }).entries;
}

describe("brand accounts", () => {
  it("lists @slabhold by profile id and matches it with any case or spacing", () => {
    assert.deepEqual([...BRAND_ACCOUNT_IDS], [BRAND_ID]);
    assert.equal(isBrandAccount(BRAND_ID), true);
    assert.equal(isBrandAccount(`  ${BRAND_ID.toUpperCase()} `), true);
    assert.equal(isBrandAccount("slabhold"), false);
    assert.equal(isBrandAccount(""), false);
    assert.equal(isBrandAccount(null), false);
    assert.equal(isBrandAccount(undefined), false);
  });

  it("leaves @slabhold off all three weekly boards even when it leads, and a real collector ranks #1", () => {
    const scoreInput = input(BRAND_ID, "slabhold");
    for (const boardId of BOARDS) {
      const entries = ranked(scoreInput, boardId);
      assert.equal(entries.some((entry) => entry.userId === BRAND_ID), false, `${boardId} leaves out @slabhold`);
      assert.equal(entries[0]?.userId, "normal", `${boardId} has the real collector at #1`);
    }
  });

  it("still leaves the brand account out after a handle change (matched by id)", () => {
    const scoreInput = input(BRAND_ID, "renamed_brand");
    for (const boardId of BOARDS) {
      assert.equal(ranked(scoreInput, boardId).some((entry) => entry.userId === BRAND_ID), false, boardId);
    }
  });

  it("does not leave out a different account that uses the slabhold handle", () => {
    const scoreInput = input("impostor", "slabhold");
    for (const boardId of BOARDS) {
      assert.equal(ranked(scoreInput, boardId)[0]?.userId, "impostor", boardId);
    }
  });

  it("keeps the brand account's own follows counting toward others", () => {
    const scoreInput = input(BRAND_ID, "slabhold");
    scoreInput.follows = [...scoreInput.follows, follow(BRAND_ID, "normal")];
    const rising = ranked(scoreInput, "rising-collectors");
    assert.equal(rising[0]?.userId, "normal");
    assert.equal(rising[0]?.score, 2);
  });

  it("does not make @slabhold the official updates account", () => {
    assert.equal(isOfficialUpdatesAccount(BRAND_ID), false);
  });

  it("says official Slabhold accounts are left off", () => {
    assert.equal(officialUpdatesRule(), "Official Slabhold accounts are left off this board.");
  });
});
