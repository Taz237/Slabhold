import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { OFFICIAL_UPDATES_USER_ID } from "@/lib/social/official-updates";
import { buildWeekBoards, getPostLikeActors, type BoardCard, type BoardFollow, type BoardLike, type BoardPost, type BoardProfile, type BoardReply, type ScoreInput } from "./score";
import { ACTOR_MIN_AGE_DAYS, OFFICIAL_UPDATES_HANDLE } from "./rules";
import { rankBoard } from "./present";
import { snapshotFromInput } from "./snapshot";
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

function card(id: string, userId: string, isPublic = true, extra: Partial<BoardCard> = {}): BoardCard {
  return {
    id,
    userId,
    isPublic,
    player: `Player ${id}`,
    year: 2024,
    setName: "Prizm",
    parallel: "",
    imageUrl: "https://cdn.example/card.jpg",
    createdAt: IN_WEEK,
    hidden: false,
    deleted: false,
    ...extra,
  };
}

function post(id: string, authorId: string, cardIds: string[], extra: Partial<BoardPost> = {}): BoardPost {
  return {
    id,
    authorId,
    body: "Look at this",
    hiddenAt: null,
    deleted: false,
    cardIds,
    postType: "post",
    createdAt: IN_WEEK,
    ...extra,
  };
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
    blockPairs: [],
    now: new Date("2026-10-23T18:00:00.000Z"),
    ...extra,
  };
}

function like(actorId: string, postId = "post-1", createdAt = IN_WEEK, undone = false): BoardLike {
  return { actorId, postId, createdAt, undone };
}

function reply(id: string, actorId: string, postId = "post-1", extra: Partial<BoardReply> = {}): BoardReply {
  return { id, actorId, postId, createdAt: IN_WEEK, undone: false, hidden: false, deleted: false, ...extra };
}

function boards(input: ScoreInput) {
  return buildWeekBoards(input, WEEK);
}

describe("top card post scoring", () => {
  it("counts each collector once per post across replies and likes", () => {
    const many = boards(
      base({
        replies: Array.from({ length: 25 }, (_, index) => reply(`r${index}`, "fan")),
      }),
    );
    const once = many["top-card-post"]?.rows[0];
    assert.ok(once);
    assert.equal(once.contributions.reduce((sum, item) => sum + item.points, 0), 1);
    assert.deepEqual(once.contributions.map((item) => item.actorId), ["fan"]);

    const both = boards(
      base({
        likes: [like("fan")],
        replies: [reply("r1", "fan")],
      }),
    );
    const combined = both["top-card-post"]?.rows[0];
    assert.equal(combined?.contributions.reduce((sum, item) => sum + item.points, 0), 1);

    const scored = boards(
      base({
        likes: [like("fan"), like("fan2")],
        replies: [reply("r1", "fan3"), reply("r2", "fan3")],
      }),
    );
    const row = scored["top-card-post"]?.rows[0];
    assert.ok(row);
    assert.equal(row.contributions.reduce((sum, item) => sum + item.points, 0), 3);
    assert.equal(row.title, "Player card-1");
    assert.equal(row.href, "/posts/post-1");
    assert.deepEqual(getPostLikeActors(), []);
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
        post("mail", "author", ["card-1"], { postType: "mail_day" }),
        post("public", "author", ["card-1"]),
      ],
      cards: [card("card-1", "author", true), card("card-2", "author", false)],
      likes: [
        like("fan", "hidden"),
        like("fan", "gone"),
        like("fan", "text"),
        like("fan", "private"),
        like("fan", "mail"),
        like("fan2", "public"),
      ],
    });
    const rows = boards(input)["top-card-post"]?.rows ?? [];
    assert.deepEqual(rows.map((row) => row.id), ["public"]);
  });

  it("leaves out the official updates account, hidden or deleted replies, and posts from outside the week", () => {
    const official = boards(
      base({
        profiles: [
          profile("author", "author"),
          profile("updates", OFFICIAL_UPDATES_HANDLE),
          profile(OFFICIAL_UPDATES_USER_ID, "some_handle"),
          profile("fan", "fan"),
          profile("fan2", "fan_two"),
          profile("fan3", "fan_three"),
        ],
        posts: [
          post("old", "author", ["card-1"], { createdAt: BEFORE }),
          post("official-handle", "updates", ["card-1"]),
          post("official-id", OFFICIAL_UPDATES_USER_ID, ["card-1"]),
          post("live", "author", ["card-1"]),
        ],
        usersWithPost: ["author", "updates", OFFICIAL_UPDATES_USER_ID, "fan", "fan2", "fan3"],
        replies: [
          reply("old-reply", "fan", "old"),
          reply("hidden-reply", "fan", "live", { hidden: true }),
          reply("deleted-reply", "fan2", "live", { deleted: true }),
          reply("kept", "fan3", "live"),
          reply("on-handle", "fan", "official-handle"),
          reply("on-id", "fan", "official-id"),
        ],
      }),
    );
    const rows = official["top-card-post"]?.rows ?? [];
    assert.deepEqual(rows.map((row) => row.id), ["live"]);
    assert.deepEqual(rows[0]?.contributions.map((item) => item.actorId), ["fan3"]);
    assert.deepEqual(getPostLikeActors(), []);
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

  it("counts a duplicated follow pair once", () => {
    const follow: BoardFollow = {
      followerId: "fan",
      followingId: "author",
      createdAt: IN_WEEK,
      removedAt: null,
    };
    const rows = boards(base({ follows: [follow, { ...follow }, { ...follow }] }))["rising-collectors"]?.rows ?? [];
    const author = rows.find((row) => row.id === "author");
    assert.equal(author?.contributions.length, 1);
    assert.equal(author?.contributions[0]?.points, 1);
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

  it("drops replies and follows when either person blocked the other", () => {
    const replies = boards(
      base({
        replies: [reply("r1", "fan"), reply("r2", "fan2"), reply("r3", "fan3")],
        blockPairs: [
          { blockerId: "author", blockedId: "fan" },
          { blockerId: "fan2", blockedId: "author" },
        ],
      }),
    );
    const replyActors = (replies["top-card-post"]?.rows ?? []).flatMap((row) =>
      row.contributions.map((item) => item.actorId),
    );
    assert.deepEqual(replyActors, ["fan3"]);

    const follows = boards(
      base({
        follows: [
          { followerId: "fan", followingId: "author", createdAt: IN_WEEK, removedAt: null },
          { followerId: "fan2", followingId: "author", createdAt: IN_WEEK, removedAt: null },
          { followerId: "fan3", followingId: "author", createdAt: IN_WEEK, removedAt: null },
        ],
        blockPairs: [
          { blockerId: "author", blockedId: "fan" },
          { blockerId: "fan2", blockedId: "author" },
        ],
      }),
    );
    const followActors = (follows["rising-collectors"]?.rows ?? []).flatMap((row) =>
      row.contributions.map((item) => item.actorId),
    );
    assert.deepEqual(followActors, ["fan3"]);
  });
});

describe("viewer rows", () => {
  it("hides blocked actors and entrants, keeps a You row, and flags a short list as thin", () => {
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
    assert.deepEqual(
      open.entries.map((entry) => entry.id),
      ["post-1", "post-2"],
    );

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

describe("most cards added", () => {
  const ORIGIN = "https://proj.supabase.co";
  const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = ORIGIN;
  after(() => {
    if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
  });

  const NEXT_DAY = "2026-10-22T16:00:00.000Z";
  const SNAPSHOT_NOW = "2026-10-23T18:00:00.000Z";

  function photo(userId: string, name: string): string {
    return `${ORIGIN}/storage/v1/object/public/card-photos/${userId}/${name}.jpg`;
  }

  function added(id: string, userId: string, extra: Partial<BoardCard> = {}): BoardCard {
    return card(id, userId, true, { imageUrl: photo(userId, id), player: `Player ${id}`, ...extra });
  }

  it("requires a real photo and skips private, hidden, deleted, and duplicate cards", () => {
    const rows = boards(
      base({
        cards: [
          added("photo", "author"),
          added("blank", "author", { imageUrl: "" }),
          added("data", "author", { imageUrl: "data:image/jpeg;base64,abc", player: "Data" }),
          added("private", "author", { isPublic: false, player: "Private" }),
          added("hidden", "author", { hidden: true, player: "Hidden" }),
          added("gone", "author", { deleted: true, player: "Gone" }),
          added("dup-a", "author", { player: "LeBron James", year: 2020, setName: "Prizm", parallel: "Silver" }),
          added("dup-b", "author", {
            player: "  lebron   james ",
            year: 2020,
            setName: " prizm ",
            parallel: "silver",
            createdAt: "2026-10-21T18:00:00.000Z",
          }),
          added("other-parallel", "author", { player: "LeBron James", year: 2020, setName: "Prizm", parallel: "Gold" }),
          added("old", "author", { createdAt: BEFORE, player: "Old" }),
        ],
      }),
    )["most-cards-added"]?.rows ?? [];
    const author = rows.find((row) => row.userId === "author");
    assert.equal(author?.contributions[0]?.points, 3);
  });

  it("caps a user at 25 cards per day and leaves out test accounts and @slabholdupdates", () => {
    const sameDay = Array.from({ length: 26 }, (_, index) =>
      added(`day-${index}`, "author", { player: `Name ${index}`, year: 2024, setName: "Set", parallel: "" }),
    );
    const nextDay = added("next", "author", { player: "Next day", createdAt: NEXT_DAY });
    const capped = boards(
      base({
        cards: [...sameDay, nextDay],
      }),
    )["most-cards-added"]?.rows ?? [];
    assert.equal(capped.find((row) => row.userId === "author")?.contributions[0]?.points, 26);

    const youngAt = new Date(Date.parse(IN_WEEK) - (ACTOR_MIN_AGE_DAYS * 24 * 60 * 60 * 1000 - 60_000)).toISOString();
    const excluded = boards(
      base({
        profiles: [
          profile("author", "author"),
          profile("qa", "qa_alpha"),
          profile("updates", OFFICIAL_UPDATES_HANDLE),
          profile(OFFICIAL_UPDATES_USER_ID, "some_handle"),
          profile("young", "young", { createdAt: youngAt }),
          profile("fan", "fan"),
        ],
        cards: [
          added("qa-card", "qa"),
          added("updates-card", "updates"),
          added("id-card", OFFICIAL_UPDATES_USER_ID),
          added("young-card", "young"),
          added("kept", "author"),
        ],
        blockPairs: [{ blockerId: "author", blockedId: "fan" }],
      }),
    )["most-cards-added"]?.rows ?? [];
    assert.deepEqual(excluded.map((row) => row.userId), ["author"]);

    const crowd = boards(
      base({
        profiles: ["a", "b", "c", "d"].map((id) => profile(id, id)),
        cards: ["a", "b", "c", "d"].map((id) => added(`${id}-card`, id)),
      }),
    )["most-cards-added"]?.rows ?? [];
    const hidden = rankBoard(crowd, ["a"], "d", "cards");
    assert.equal(hidden.thin, false);
    assert.equal(hidden.entries.some((entry) => entry.userId === "a"), false);
    assert.equal(hidden.you?.label, "You: #3");
  });

  it("counts only that user's card-photos url, and each image once", () => {
    const rows = boards(
      base({
        cards: [
          added("owned", "author"),
          added("copy", "author", { player: "Copy", imageUrl: photo("author", "owned") }),
          added("external", "author", { player: "External", imageUrl: "https://cdn.example/real.jpg" }),
          added("other-folder", "author", { player: "Other", imageUrl: photo("someone-else", "owned") }),
          added("data", "author", { player: "Data", imageUrl: "data:image/jpeg;base64,abc" }),
        ],
      }),
    )["most-cards-added"]?.rows ?? [];
    assert.equal(rows.find((row) => row.userId === "author")?.contributions[0]?.points, 1);
  });

  it("skips a card created after the snapshot time", () => {
    const rows = boards(
      base({
        now: new Date(SNAPSHOT_NOW),
        cards: [
          added("kept", "author", { createdAt: IN_WEEK }),
          added("exact", "author", { player: "Exact", createdAt: SNAPSHOT_NOW }),
          added("later", "author", { player: "Later", createdAt: "2026-10-24T16:00:00.000Z" }),
        ],
      }),
    )["most-cards-added"]?.rows ?? [];
    assert.equal(rows.find((row) => row.userId === "author")?.contributions[0]?.points, 2);
  });

  it("treats a blank parallel and base as the same card", () => {
    const rows = boards(
      base({
        cards: [
          added("plain", "author", { player: "LeBron James", year: 2020, setName: "Prizm", parallel: "" }),
          added("base", "author", {
            player: "LeBron James",
            year: 2020,
            setName: "Prizm",
            parallel: "  Base ",
            createdAt: "2026-10-21T18:00:00.000Z",
          }),
          added("silver", "author", { player: "LeBron James", year: 2020, setName: "Prizm", parallel: "Silver" }),
        ],
      }),
    )["most-cards-added"]?.rows ?? [];
    assert.equal(rows.find((row) => row.userId === "author")?.contributions[0]?.points, 2);
  });

  it("accepts a trailing-slash project url and rejects traversal and query variants", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = `${ORIGIN}/`;
    const rows = boards(
      base({
        cards: [
          added("kept", "author"),
          added("dots", "author", {
            player: "Dots",
            imageUrl: `${ORIGIN}/storage/v1/object/public/card-photos/author/../../secrets/x.jpg`,
          }),
          added("encoded-dot", "author", {
            player: "Encoded dot",
            imageUrl: `${ORIGIN}/storage/v1/object/public/card-photos/author/%2e%2e/x.jpg`,
          }),
          added("encoded-slash", "author", {
            player: "Encoded slash",
            imageUrl: `${ORIGIN}/storage/v1/object/public/card-photos/author/%2fx.jpg`,
          }),
          added("encoded-percent", "author", {
            player: "Encoded percent",
            imageUrl: `${ORIGIN}/storage/v1/object/public/card-photos/author/%25.jpg`,
          }),
          added("query", "author", {
            player: "Query",
            imageUrl: `${photo("author", "query")}?download=1`,
          }),
          added("hash", "author", {
            player: "Hash",
            imageUrl: `${photo("author", "hash")}#top`,
          }),
          added("same-path", "author", {
            player: "Same path",
            imageUrl: photo("author", "kept").replace("https://proj.", "https://PROJ."),
          }),
        ],
      }),
    )["most-cards-added"]?.rows ?? [];
    process.env.NEXT_PUBLIC_SUPABASE_URL = ORIGIN;
    assert.equal(rows.find((row) => row.userId === "author")?.contributions[0]?.points, 1);
  });

  it("counts a card from the cache-fill time when the week argument is the week start", () => {
    const weekStart = WEEK.start;
    const scoredAt = new Date(weekStart.getTime() + 24 * 60 * 60 * 1000);
    const createdAt = new Date(scoredAt.getTime() - 60 * 60 * 1000).toISOString();
    const afterScore = new Date(scoredAt.getTime() + 2 * 60 * 60 * 1000).toISOString();
    const snapshot = snapshotFromInput(
      base({
        now: weekStart,
        posts: [post("post-1", "author", ["card-1"], { createdAt: afterScore })],
        cards: [
          added("card-1", "author", { createdAt, player: "Live" }),
          added("later", "author", { createdAt: afterScore, player: "Later" }),
        ],
        replies: [reply("r1", "fan", "post-1", { createdAt: afterScore })],
        follows: [{ followerId: "fan2", followingId: "author", createdAt: afterScore, removedAt: null }],
      }),
      weekStart,
      scoredAt,
    );
    const cards = snapshot.current.boards["most-cards-added"]?.rows ?? [];
    assert.equal(cards.find((row) => row.userId === "author")?.contributions[0]?.points, 1);
    assert.equal((snapshot.current.boards["top-card-post"]?.rows ?? []).some((row) => row.id === "post-1"), true);
    assert.equal(
      (snapshot.current.boards["rising-collectors"]?.rows ?? []).some((row) => row.userId === "author"),
      true,
    );
  });
});

describe("thin board viewer", () => {
  it("keeps a thin board's rows and ranks the viewer on it", () => {
    const row = (userId: string, points: number) => ({
      id: userId,
      userId,
      title: userId,
      subtitle: `@${userId}`,
      href: `/posts/${userId}`,
      avatarUrl: null,
      accent: "#7c5cff",
      contributions: [{ actorId: userId, points }],
    });
    const thin = rankBoard([row("mina", 4), row("other", 1)], [], "mina", "cards", {
      boardId: "most-cards-added",
    });
    assert.equal(thin.thin, true);
    assert.equal(thin.entries.length, 2);
    assert.equal(thin.you?.score, 4);
    assert.equal(thin.you?.scoreLabel, "cards");
    assert.equal(thin.you?.title, "mina");
    assert.notEqual(thin.you?.title, "Not ranked");
    assert.equal(thin.you?.label, "You: #1");

    const empty = rankBoard([row("mina", 4), row("other", 1)], [], "guest", "cards", {
      boardId: "most-cards-added",
    });
    assert.equal(empty.you?.title, "Not ranked");
    assert.equal(empty.you?.score, 0);
  });
});
