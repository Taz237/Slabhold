import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { OFFICIAL_UPDATES_USER_ID } from "@/lib/social/official-updates";
import { buildWeekBoards, type BoardCard, type BoardFollow, type BoardLike, type BoardPost, type BoardProfile, type BoardReply, type ScoreInput } from "./score";
import { ACTOR_MIN_AGE_DAYS, OFFICIAL_UPDATES_HANDLE } from "./rules";
import { rankBoard } from "./present";
import { weekContaining } from "./week";

const WEEK = weekContaining(new Date("2026-10-23T18:00:00.000Z"));
const IN_WEEK = "2026-10-21T16:00:00.000Z";
const OLD = "2026-09-01T00:00:00.000Z";
const BEFORE = "2026-10-10T16:00:00.000Z";

function profile(id: string, username: string, extra: Partial<BoardProfile> = {}): BoardProfile {
  return {
    id,
    username,
    displayName: username,
    createdAt: OLD,
    isTest: false,
    avatarUrl: null,
    accent: "#7c5cff",
    ...extra,
  };
}

function card(id: string, userId: string, isPublic = true): BoardCard {
  return { id, userId, isPublic, player: `Player ${id}` };
}

function post(id: string, authorId: string, cardIds: string[], extra: Partial<BoardPost> = {}): BoardPost {
  return { id, authorId, body: "Look at this", hiddenAt: null, deleted: false, cardIds, ...extra };
}

function base(extra: Partial<ScoreInput> = {}): ScoreInput {
  return {
    profiles: [
      profile("author", "author"),
      profile("fan", "fan"),
      profile("fan2", "fan_two"),
      profile("fan3", "fan_three"),
    ],
    posts: [post("post-1", "author", ["card-1"])],
    cards: [card("card-1", "author")],
    usersWithPost: ["author", "fan", "fan2", "fan3"],
    likes: [],
    replies: [],
    follows: [],
    ...extra,
  };
}

function like(actorId: string, postId = "post-1", createdAt = IN_WEEK, undone = false): BoardLike {
  return { actorId, postId, createdAt, undone };
}

function reply(id: string, actorId: string, postId = "post-1"): BoardReply {
  return { id, actorId, postId, createdAt: IN_WEEK, undone: false };
}

function boards(input: ScoreInput) {
  return buildWeekBoards(input, WEEK);
}

describe("top card post scoring", () => {
  it("ranks a card post by likes plus replies from real collectors", () => {
    const scored = boards(
      base({
        likes: [like("fan"), like("fan2")],
        replies: [reply("r1", "fan3"), reply("r2", "fan3")],
      }),
    );
    const row = scored["top-card-post"]?.rows[0];
    assert.ok(row);
    assert.equal(row.contributions.reduce((sum, item) => sum + item.points, 0), 4);
    assert.equal(row.title, "Player card-1");
    assert.equal(row.href, "/posts/post-1");
  });

  it("drops self, duplicates, undone likes, young accounts, empty accounts, and test accounts", () => {
    const youngAt = new Date(Date.parse(IN_WEEK) - (ACTOR_MIN_AGE_DAYS * 24 * 60 * 60 * 1000 - 60_000)).toISOString();
    const oldEnough = new Date(Date.parse(IN_WEEK) - ACTOR_MIN_AGE_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const input = base({
      profiles: [
        profile("author", "author"),
        profile("fan", "fan"),
        profile("young", "young", { createdAt: youngAt }),
        profile("bare", "bare_collector"),
        profile("qa", "qa_alpha"),
        profile("dash", "qa-bot"),
        profile("reset", "vreset_1"),
        profile("tester", "test_one"),
        profile("flagged", "real_name", { isTest: true }),
        profile("edge", "edge_case", { createdAt: oldEnough }),
      ],
      usersWithPost: ["author", "fan", "young", "qa", "dash", "reset", "tester", "flagged", "edge"],
      likes: [
        like("author"),
        like("fan"),
        like("fan"),
        like("fan", "post-1", IN_WEEK, true),
        like("young"),
        like("bare"),
        like("qa"),
        like("dash"),
        like("reset"),
        like("tester"),
        like("flagged"),
        like("edge"),
      ],
      replies: [reply("self", "author")],
    });
    const rows = boards(input)["top-card-post"]?.rows ?? [];
    const actors = rows.flatMap((row) => row.contributions.map((item) => item.actorId));
    assert.deepEqual(actors.sort(), ["edge", "fan"]);
  });

  it("hides hidden, deleted, cardless, and private-card posts", () => {
    const input = base({
      posts: [
        post("hidden", "author", ["card-1"], { hiddenAt: IN_WEEK }),
        post("gone", "author", ["card-1"], { deleted: true }),
        post("text", "author", []),
        post("private", "author", ["card-2"]),
        post("public", "author", ["card-1"]),
      ],
      cards: [card("card-1", "author", true), card("card-2", "author", false)],
      likes: [like("fan", "hidden"), like("fan", "gone"), like("fan", "text"), like("fan", "private"), like("fan2", "public")],
    });
    const rows = boards(input)["top-card-post"]?.rows ?? [];
    assert.deepEqual(rows.map((row) => row.id), ["public"]);
  });
});

describe("rising collectors scoring", () => {
  it("counts follows made this week minus follows removed this week", () => {
    const follows: BoardFollow[] = [
      { followerId: "fan", followingId: "author", createdAt: IN_WEEK, removedAt: null },
      { followerId: "fan2", followingId: "author", createdAt: IN_WEEK, removedAt: IN_WEEK },
      { followerId: "fan3", followingId: "author", createdAt: BEFORE, removedAt: IN_WEEK },
      { followerId: "fan", followingId: "fan2", createdAt: IN_WEEK, removedAt: null },
    ];
    const rows = boards(base({ follows }))["rising-collectors"]?.rows ?? [];
    const author = rows.find((row) => row.id === "author");
    const fan2 = rows.find((row) => row.id === "fan2");
    assert.equal(author?.contributions.reduce((sum, item) => sum + item.points, 0), 0);
    assert.equal(fan2?.contributions.reduce((sum, item) => sum + item.points, 0), 1);
    const ranked = rankBoard(rows, [], null, "new followers");
    assert.equal(ranked.entries.some((entry) => entry.score <= 0), false);
    assert.equal(ranked.entries.some((entry) => entry.id === "author"), false);
  });

  it("leaves out test entrants and the official updates account", () => {
    const input = base({
      profiles: [
        profile("author", "author"),
        profile("fan", "fan"),
        profile("qa", "qa_alpha"),
        profile("updates", OFFICIAL_UPDATES_HANDLE),
        profile(OFFICIAL_UPDATES_USER_ID, "some_handle"),
      ],
      usersWithPost: ["author", "fan", "qa", "updates", OFFICIAL_UPDATES_USER_ID],
      follows: [
        { followerId: "fan", followingId: "qa", createdAt: IN_WEEK, removedAt: null },
        { followerId: "fan", followingId: "updates", createdAt: IN_WEEK, removedAt: null },
        { followerId: "fan", followingId: OFFICIAL_UPDATES_USER_ID, createdAt: IN_WEEK, removedAt: null },
        { followerId: "qa", followingId: "author", createdAt: IN_WEEK, removedAt: null },
        { followerId: "fan", followingId: "author", createdAt: IN_WEEK, removedAt: null },
      ],
    });
    const rows = boards(input)["rising-collectors"]?.rows ?? [];
    assert.deepEqual(rows.map((row) => row.id), ["author"]);
    assert.deepEqual(rows[0]?.contributions.map((item) => item.actorId), ["fan"]);
  });
});

describe("viewer rows", () => {
  it("hides blocked actors and entrants, keeps a You row, and refuses a short list", () => {
    const scored = boards(
      base({
        profiles: [
          profile("author", "author"),
          profile("fan", "fan"),
          profile("fan2", "fan_two"),
          profile("fan3", "fan_three"),
          profile("other", "other"),
          profile("third", "third"),
        ],
        posts: [post("post-1", "author", ["card-1"]), post("post-2", "other", ["card-1"])],
        usersWithPost: ["author", "fan", "fan2", "fan3", "other", "third"],
        likes: [like("fan"), like("fan2"), like("fan", "post-2")],
      }),
    );
    const rows = scored["top-card-post"]?.rows ?? [];
    const open = rankBoard(rows, [], null, "likes and replies");
    assert.equal(open.thin, true);
    assert.deepEqual(open.entries, []);

    const full = boards(
      base({
        profiles: ["a", "b", "c", "d", "e"].map((id) => profile(id, id)).concat([profile("fan", "fan")]),
        posts: ["a", "b", "c", "d", "e"].map((id) => post(`post-${id}`, id, ["card-1"])),
        cards: [card("card-1", "a")],
        usersWithPost: ["a", "b", "c", "d", "e", "fan"],
        likes: [
          like("fan", "post-a"),
          like("b", "post-a"),
          like("fan", "post-b"),
          like("fan", "post-c"),
          like("fan", "post-d"),
          like("fan", "post-e"),
        ],
      }),
    );
    const many = full["top-card-post"]?.rows ?? [];
    const shown = rankBoard(many, ["b"], "a", "likes and replies");
    assert.equal(shown.thin, false);
    assert.equal(shown.entries.some((entry) => entry.userId === "b"), false);
    assert.equal(shown.entries[0]?.userId, "a");
    assert.equal(shown.entries[0]?.score, 1);
    assert.equal(shown.you?.label, "You: #1");
    assert.equal(shown.entries.length <= 10, true);

    const withZero = rankBoard(
      [
        ...many,
        {
          id: "zero",
          userId: "fan",
          title: "Zero",
          subtitle: "@fan",
          href: "/u/fan",
          avatarUrl: null,
          accent: "#7c5cff",
          contributions: [{ actorId: "b", points: 1 }],
        },
      ],
      ["b"],
      null,
      "likes and replies",
    );
    assert.equal(withZero.entries.some((entry) => entry.score <= 0), false);
    assert.equal(withZero.entries.some((entry) => entry.id === "zero"), false);
  });
});
