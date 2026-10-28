import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { OFFICIAL_UPDATES_USER_ID } from "@/lib/social/official-updates";
import type { BoardFollow, BoardPost, BoardProfile, BoardReply } from "@/lib/leaderboard/score";
import { BADGE_THRESHOLDS, TOTAL_BADGES } from "./config";
import {
  badgeCounts,
  badgeEligible,
  categoryStatus,
  earnedTiers,
  newAwards,
  progressLine,
  tierForValue,
  type BadgeCard,
  type BadgeInput,
} from "./progress";

const ORIGIN = "https://fixture.supabase.co";
const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
process.env.NEXT_PUBLIC_SUPABASE_URL = ORIGIN;
after(() => {
  if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
});

const NOW = new Date("2026-10-28T18:00:00.000Z");
const OLD = "2026-01-01T00:00:00.000Z";
const ME = "me";

function photo(userId: string, name: string) {
  return `${ORIGIN}/storage/v1/object/public/card-photos/${userId}/${name}.jpg`;
}

function profile(id: string, username = id, extra: Partial<BoardProfile> = {}): BoardProfile {
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

let serial = 0;
function card(extra: Partial<BadgeCard> = {}): BadgeCard {
  serial += 1;
  return {
    id: `c${serial}`,
    userId: ME,
    isPublic: true,
    player: `Player ${serial}`,
    year: 2024,
    setName: "Prizm",
    parallel: "",
    imageUrl: photo(ME, `p${serial}`),
    createdAt: `2026-10-${String(1 + (serial % 20)).padStart(2, "0")}T15:00:00.000Z`,
    hidden: false,
    deleted: false,
    graded: false,
    ...extra,
  };
}

function cards(count: number, extra: Partial<BadgeCard> = {}): BadgeCard[] {
  return Array.from({ length: count }, () => card(extra));
}

function post(id: string, extra: Partial<BoardPost> = {}): BoardPost {
  return {
    id,
    authorId: ME,
    body: "Pickup",
    hiddenAt: null,
    deleted: false,
    cardIds: [],
    postType: "post",
    createdAt: "2026-10-20T15:00:00.000Z",
    ...extra,
  };
}

function reply(actorId: string, postId: string, extra: Partial<BoardReply> = {}): BoardReply {
  return {
    id: `${actorId}:${postId}`,
    actorId,
    postId,
    createdAt: "2026-10-21T15:00:00.000Z",
    undone: false,
    hidden: false,
    deleted: false,
    ...extra,
  };
}

function follow(followerId: string, extra: Partial<BoardFollow> = {}): BoardFollow {
  return { followerId, followingId: ME, createdAt: "2026-10-21T15:00:00.000Z", removedAt: null, ...extra };
}

function input(extra: Partial<BadgeInput> = {}): BadgeInput {
  return {
    user: profile(ME, "collector_one"),
    cards: [],
    posts: [],
    replies: [],
    followers: [],
    actors: [],
    actorsWithCard: [],
    actorsWithPost: [],
    blockPairs: [],
    podiumWeeks: [],
    now: NOW,
    ...extra,
  };
}

describe("tiers from thresholds", () => {
  it("maps a value to the highest tier reached", () => {
    assert.equal(tierForValue("collector", 9), null);
    assert.equal(tierForValue("collector", 10), "bronze");
    assert.equal(tierForValue("collector", 24), "bronze");
    assert.equal(tierForValue("collector", 25), "silver");
    assert.equal(tierForValue("collector", 500), "legendary");
    assert.equal(tierForValue("following", 999), "diamond");
    assert.equal(tierForValue("following", 1000), "legendary");
    assert.equal(tierForValue("leaderboard", 1), "bronze");
  });

  it("lists every tier at or below the value, so a jump awards the skipped tiers", () => {
    assert.deepEqual(earnedTiers("slab-king", 31), ["bronze", "silver", "gold"]);
    assert.deepEqual(earnedTiers("slab-king", 4), []);
  });

  it("counts 42 badges with no Limited events", () => {
    assert.equal(TOTAL_BADGES, 42);
  });

  it("keeps thresholds strictly rising", () => {
    for (const list of Object.values(BADGE_THRESHOLDS)) {
      for (let index = 1; index < list.length; index += 1) assert.ok(list[index] > list[index - 1]);
    }
  });
});

describe("collector and slab king", () => {
  it("counts only cards with a real card-photos photo owned by the user", () => {
    const counts = badgeCounts(
      input({
        cards: [
          ...cards(10),
          card({ imageUrl: null }),
          card({ imageUrl: "https://cdn.example/stock.jpg" }),
          card({ imageUrl: photo("someone-else", "x") }),
        ],
      }),
    );
    assert.equal(counts.collector, 10);
  });

  it("counts private cards", () => {
    const counts = badgeCounts(input({ cards: cards(10, { isPublic: false }) }));
    assert.equal(counts.collector, 10);
    assert.equal(tierForValue("collector", counts.collector), "bronze");
  });

  it("counts a duplicate card once, by card identity and by photo", () => {
    const twin = { player: "Fixture Rookie", year: 2023, setName: "Prizm", parallel: "Silver" };
    const shared = photo(ME, "same");
    const counts = badgeCounts(
      input({
        cards: [
          card(twin),
          card({ ...twin, player: " fixture  ROOKIE " }),
          card({ imageUrl: shared }),
          card({ imageUrl: shared }),
        ],
      }),
    );
    assert.equal(counts.collector, 2);
  });

  it("applies the 25 per day cap", () => {
    const day = cards(40, { createdAt: "2026-10-27T15:00:00.000Z" });
    const nextDay = cards(5, { createdAt: "2026-10-28T15:00:00.000Z" });
    const counts = badgeCounts(input({ cards: [...day, ...nextDay] }));
    assert.equal(counts.collector, 30);
  });

  it("caps by Eastern day, not UTC day", () => {
    // 03:00 UTC on the 28th is still the 27th in New York.
    const late = cards(20, { createdAt: "2026-10-28T03:00:00.000Z" });
    const early = cards(20, { createdAt: "2026-10-27T15:00:00.000Z" });
    assert.equal(badgeCounts(input({ cards: [...late, ...early] })).collector, 25);
  });

  it("skips deleted, hidden, and future cards", () => {
    const counts = badgeCounts(
      input({
        cards: [
          ...cards(3),
          card({ deleted: true }),
          card({ hidden: true }),
          card({ createdAt: "2026-12-01T00:00:00.000Z" }),
        ],
      }),
    );
    assert.equal(counts.collector, 3);
  });

  it("counts graded cards for slab king with the same cap and duplicate rules", () => {
    const slab = { player: "Fixture Slab", year: 2020, setName: "Select", parallel: "", graded: true };
    const counts = badgeCounts(
      input({
        cards: [
          ...cards(30, { graded: true, createdAt: "2026-10-27T15:00:00.000Z" }),
          card(slab),
          card(slab),
          ...cards(4),
        ],
      }),
    );
    assert.equal(counts["slab-king"], 26);
  });
});

describe("rainbow chaser", () => {
  it("counts different parallels of the best player and skips base", () => {
    const rainbow = ["Silver", "Blue", "Gold /10", "Base", "", "Silver"].map((parallel, index) =>
      card({ player: "Fixture Star", parallel, year: 2023, setName: index === 5 ? "Select" : "Prizm" }),
    );
    const other = ["Silver", "Red Wave"].map((parallel) => card({ player: "Second Guy", parallel }));
    const counts = badgeCounts(input({ cards: [...rainbow, ...other] }));
    assert.equal(counts["rainbow-chaser"], 3);
  });

  it("counts private cards and skips cards without a real photo", () => {
    const counts = badgeCounts(
      input({
        cards: [
          card({ player: "Fixture Star", parallel: "Silver", isPublic: false }),
          card({ player: "Fixture Star", parallel: "Blue", imageUrl: null }),
        ],
      }),
    );
    assert.equal(counts["rainbow-chaser"], 1);
  });
});

describe("voice of the hobby", () => {
  const actors = [profile("fan"), profile("fan2"), profile("fresh", "fresh", { createdAt: "2026-10-21T10:00:00.000Z" }), profile("qa", "qa_bot")];

  it("counts posts with a reply from a different qualifying collector", () => {
    const counts = badgeCounts(
      input({
        posts: [post("p1"), post("p2"), post("p3"), post("p4"), post("p5")],
        replies: [
          reply("fan", "p1"),
          reply("fan2", "p1"),
          reply("fan", "p2"),
          reply(ME, "p3"),
          reply("fresh", "p4"),
          reply("qa", "p5"),
        ],
        actors,
        actorsWithCard: ["fan", "fan2", "fresh", "qa"],
      }),
    );
    assert.equal(counts["voice-of-the-hobby"], 2);
  });

  it("skips repliers with no cards and no posts, blocked pairs, and hidden or Mail Day posts", () => {
    const counts = badgeCounts(
      input({
        posts: [post("p1"), post("p2"), post("p3", { hiddenAt: OLD }), post("p4", { postType: "mail_day" })],
        replies: [reply("fan", "p1"), reply("fan2", "p2"), reply("fan2", "p3"), reply("fan2", "p4")],
        actors,
        actorsWithCard: ["fan2"],
        blockPairs: [{ blockerId: ME, blockedId: "fan2" }],
      }),
    );
    assert.equal(counts["voice-of-the-hobby"], 0);
  });

  it("counts a replier who only has a post", () => {
    const counts = badgeCounts(
      input({ posts: [post("p1")], replies: [reply("fan", "p1")], actors, actorsWithPost: ["fan"] }),
    );
    assert.equal(counts["voice-of-the-hobby"], 1);
  });
});

describe("following", () => {
  it("counts followers who are qualifying accounts only", () => {
    const actors = [
      profile("a"),
      profile("b"),
      profile("t", "test_alt"),
      profile("flag", "flagged", { isTest: true }),
      profile("empty"),
      profile("new", "new", { createdAt: "2026-10-21T12:00:00.000Z" }),
      profile("blocked"),
    ];
    const counts = badgeCounts(
      input({
        followers: [
          follow("a"),
          follow("b"),
          follow("b"),
          follow("t"),
          follow("flag"),
          follow("empty"),
          follow("new"),
          follow("blocked"),
          follow(ME),
        ],
        actors,
        actorsWithCard: ["a", "b", "t", "flag", "new", "blocked"],
        blockPairs: [{ blockerId: "blocked", blockedId: ME }],
      }),
    );
    assert.equal(counts.following, 2);
  });
});

describe("leaderboard", () => {
  it("counts distinct podium weeks", () => {
    const counts = badgeCounts(input({ podiumWeeks: ["2026-10-12", "2026-10-19", "2026-10-19"] }));
    assert.equal(counts.leaderboard, 2);
  });
});

describe("streak", () => {
  it("takes the longest run of Mon–Sun ET weeks with a qualifying card add or post", () => {
    const counts = badgeCounts(
      input({
        cards: [
          card({ createdAt: "2026-09-08T15:00:00.000Z" }),
          card({ createdAt: "2026-09-15T15:00:00.000Z" }),
          card({ createdAt: "2026-09-22T15:00:00.000Z" }),
          card({ createdAt: "2026-10-27T15:00:00.000Z" }),
          card({ createdAt: "2026-09-29T15:00:00.000Z", imageUrl: null }),
        ],
        posts: [post("p1", { createdAt: "2026-10-20T15:00:00.000Z" }), post("p2", { createdAt: "2026-10-13T15:00:00.000Z", hiddenAt: OLD })],
      }),
    );
    assert.equal(counts.streak, 3);
    assert.equal(counts.streakCurrent, 2);
  });

  it("treats Sunday 11 PM ET as the same week and Monday 12 AM ET as the next", () => {
    const counts = badgeCounts(
      input({
        posts: [
          // Sunday Oct 18, 11:30 PM EDT and Monday Oct 19, 12:30 AM EDT.
          post("sun", { createdAt: "2026-10-19T03:30:00.000Z" }),
          post("mon", { createdAt: "2026-10-19T04:30:00.000Z" }),
        ],
        now: new Date("2026-10-20T12:00:00.000Z"),
      }),
    );
    assert.equal(counts.streak, 2);
    assert.equal(counts.streakCurrent, 2);
  });

  it("keeps the current streak alive through this week until it ends", () => {
    const counts = badgeCounts(input({ posts: [post("p1", { createdAt: "2026-10-20T15:00:00.000Z" })] }));
    assert.equal(counts.streakCurrent, 1);
    const later = badgeCounts(
      input({ posts: [post("p1", { createdAt: "2026-10-13T15:00:00.000Z" })] }),
    );
    assert.equal(later.streakCurrent, 0);
  });
});

describe("who can earn", () => {
  it("never lets test or official accounts earn", () => {
    assert.equal(badgeEligible(profile(ME, "collector_one")), true);
    assert.equal(badgeEligible(profile(ME, "test_wax")), false);
    assert.equal(badgeEligible(profile(ME, "anything", { isTest: true })), false);
    assert.equal(badgeEligible(profile(OFFICIAL_UPDATES_USER_ID, "renamed")), false);
    assert.equal(badgeEligible(profile(ME, "slabholdupdates")), false);
  });

  it("awards nothing to a test account", () => {
    const test = input({ user: profile(ME, "qa_runner"), cards: cards(50) });
    assert.deepEqual(newAwards(test, badgeCounts(test), []), []);
  });

  it("awards each missing tier once and keeps earned badges", () => {
    const own = input({ cards: cards(26) });
    const counts = badgeCounts(own);
    const collector = (list: ReturnType<typeof newAwards>) =>
      list.filter((badge) => badge.category === "collector");
    assert.deepEqual(collector(newAwards(own, counts, [])), [
      { category: "collector", tier: "bronze" },
      { category: "collector", tier: "silver" },
    ]);
    assert.deepEqual(collector(newAwards(own, counts, [{ category: "collector", tier: "bronze" }])), [
      { category: "collector", tier: "silver" },
    ]);
  });
});

describe("progress lines", () => {
  it("names the next tier and the unit", () => {
    assert.equal(progressLine("collector", 12, "bronze"), "12 / 25 cards to Silver");
    assert.equal(progressLine("collector", 3, null), "3 / 10 cards to Bronze");
    assert.equal(progressLine("leaderboard", 0, null), "0 / 1 week to Bronze");
    assert.equal(progressLine("collector", 600, "legendary"), "All tiers unlocked");
  });

  it("keeps an earned tier even after the count drops", () => {
    const status = categoryStatus("collector", 4, [{ category: "collector", tier: "silver" }]);
    assert.equal(status.earned, "silver");
    assert.equal(status.next, "gold");
    assert.equal(status.target, 50);
    assert.equal(status.line, "4 / 50 cards to Gold");
    assert.equal(status.progress, 4 / 50);
  });
});
