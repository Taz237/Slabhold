import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "node:test";
import { TrendingNowSkeleton, TrendingNowStrip } from "@/components/trending-now-strip";
import {
  TRENDING_CACHE_SECONDS,
  TRENDING_ENGAGEMENT_LIMIT,
  TRENDING_HALF_LIFE_MS,
  TRENDING_HEADING,
  TRENDING_LIMIT,
  TRENDING_MIN_ENGAGEMENTS,
  TRENDING_MIN_POSTS,
  TRENDING_SESSION_MS,
  TRENDING_WEIGHT,
  TRENDING_WINDOW_MS,
  attachedCardIds,
  clearTrendingSession,
  engagementScore,
  filterTrendingForViewer,
  inTrendingWindow,
  loadViewerPostIds,
  rankTrending,
  rememberTrendingPublic,
  rememberTrendingVisible,
  trendingAuthorHidden,
  trendingCacheControl,
  trendingCandidateIds,
  trendingItemsFromPayload,
  trendingPostPrivacy,
  trendingPublicSession,
  trendingVisibleSession,
  type EngagementKind,
  type TrendingAuthor,
  type TrendingEngagement,
  type TrendingItem,
  type TrendingPostSource,
} from "./trending";

const NOW = Date.parse("2026-10-22T18:00:00.000Z");
const HOUR = 60 * 60 * 1000;

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function at(hoursAgo: number) {
  return new Date(NOW - hoursAgo * HOUR).toISOString();
}

function author(id: string, username: string, extra: Partial<TrendingAuthor> = {}): TrendingAuthor {
  return {
    id,
    username,
    displayName: extra.displayName ?? username,
    avatarUrl: extra.avatarUrl ?? null,
    accent: extra.accent ?? "#7c5cff",
    isTest: extra.isTest,
  };
}

function post(id: string, authorId: string, extra: Partial<TrendingPostSource> = {}): TrendingPostSource {
  return {
    id,
    authorId,
    body: extra.body ?? `Post ${id}`,
    createdAt: extra.createdAt ?? at(2),
    deleted: extra.deleted,
    hiddenAt: extra.hiddenAt,
    privateContent: extra.privateContent,
    player: extra.player,
    postType: extra.postType,
  };
}

let fanSerial = 0;

function like(
  postId: string,
  hoursAgo = 0,
  kind: EngagementKind = "like",
  extra: Partial<TrendingEngagement> = {},
): TrendingEngagement {
  fanSerial += 1;
  const event: TrendingEngagement = {
    postId,
    kind,
    at: extra.at ?? at(hoursAgo),
    actorId: extra.actorId ?? `fan-${fanSerial}`,
  };
  if (kind === "like") event.recipientId = extra.recipientId === undefined ? postId : extra.recipientId;
  return event;
}

function withActors(
  people: readonly TrendingAuthor[],
  engagements: readonly TrendingEngagement[],
): TrendingAuthor[] {
  const known = new Map(people.map((person) => [person.id, person]));
  for (const event of engagements) {
    if (!event.actorId || known.has(event.actorId)) continue;
    known.set(event.actorId, author(event.actorId, `fan${known.size}`));
  }
  return [...known.values()];
}

/** Two fresh likes on each id so every post clears the engagement bar. */
function fresh(ids: readonly string[], kind: EngagementKind = "like"): TrendingEngagement[] {
  return ids.flatMap((id) => [like(id, 0, kind), like(id, 0, kind)]);
}

function rank(
  ids: readonly string[],
  people: readonly TrendingAuthor[],
  extra: {
    engagements?: readonly TrendingEngagement[];
    posts?: readonly TrendingPostSource[];
    blockedIds?: Iterable<string>;
    mutedIds?: Iterable<string>;
  } = {},
) {
  const engagements = extra.engagements ?? fresh(ids);
  return rankTrending({
    now: NOW,
    engagements,
    posts: extra.posts ?? ids.map((id) => post(id, id)),
    authors: withActors(people, engagements),
    blockedIds: extra.blockedIds,
    mutedIds: extra.mutedIds,
  });
}

function item(id: string, authorId: string, extra: Partial<TrendingItem> = {}): TrendingItem {
  return {
    id,
    href: `/posts/${id}`,
    authorId,
    username: extra.username ?? authorId,
    displayName: extra.displayName ?? authorId,
    avatarUrl: null,
    accent: "#7c5cff",
    excerpt: extra.excerpt ?? "Hello",
    player: extra.player ?? null,
    score: extra.score ?? 2,
    engagements: extra.engagements ?? 2,
  };
}

describe("trending score", () => {
  it("counts likes, replies, quotes, and reposts, and halves them every six hours", () => {
    assert.equal(TRENDING_WINDOW_MS, 24 * HOUR);
    assert.equal(TRENDING_HALF_LIFE_MS, 6 * HOUR);
    assert.deepEqual(TRENDING_WEIGHT, { like: 1, reply: 1, quote: 1, repost: 1 });

    for (const kind of ["like", "reply", "quote", "repost"] as const) {
      assert.equal(engagementScore(kind, at(0), NOW), 1);
      assert.equal(engagementScore(kind, at(6), NOW), 0.5);
      assert.equal(engagementScore(kind, at(12), NOW), 0.25);
    }
    assert.equal(engagementScore("like", at(24), NOW), 2 ** -4);
    assert.equal(engagementScore("like", new Date(NOW - TRENDING_WINDOW_MS - 1).toISOString(), NOW), 0);
    assert.equal(inTrendingWindow("not-a-date", NOW), false);
    assert.equal(engagementScore("like", "not-a-date", NOW), 0);
    assert.equal(engagementScore("like", new Date(NOW + HOUR).toISOString(), NOW), 1);
  });

  it("ranks a fresh pair above the same pair from six hours ago", () => {
    const ids = ["fresh", "older", "mixed"];
    const ranked = rank(ids, ids.map((id) => author(id, id)), {
      engagements: [
        like("fresh", 0),
        like("fresh", 0),
        like("older", 6),
        like("older", 6),
        like("mixed", 0, "reply"),
        like("mixed", 0, "quote"),
        like("mixed", 6, "repost"),
      ],
    });
    assert.deepEqual(
      ranked.map((row) => row.id),
      ["mixed", "fresh", "older"],
    );
    assert.equal(ranked[0]?.score, 2.5);
    assert.equal(ranked[0]?.engagements, 3);
    assert.equal(ranked[1]?.score, 2);
    assert.equal(ranked[2]?.score, 1);
    assert.equal(ranked[2]?.engagements, 2);
  });

  it("breaks score ties by engagement count, then newer posts", () => {
    const ranked = rank(["a", "b", "c"], ["a", "b", "c"].map((id) => author(id, id)), {
      posts: [
        post("a", "a", { createdAt: at(5) }),
        post("b", "b", { createdAt: at(1) }),
        post("c", "c", { createdAt: at(1) }),
      ],
      engagements: [
        like("a", 6),
        like("a", 6),
        like("a", 6),
        like("a", 6),
        like("b", 0),
        like("b", 0),
        like("c", 0),
        like("c", 0),
      ],
    });
    assert.equal(ranked[0]?.id, "a");
    assert.equal(ranked[0]?.score, 2);
    assert.equal(ranked[0]?.engagements, 4);
    assert.deepEqual(ranked.slice(1).map((row) => row.id), ["b", "c"]);
  });
});

describe("trending exclusions", () => {
  const ids = ["one", "two", "three", "four"];

  function shown(people: TrendingAuthor[], posts?: TrendingPostSource[], blocked?: string[], muted?: string[]) {
    return rank(ids, people, {
      posts,
      blockedIds: blocked,
      mutedIds: muted,
    }).map((row) => row.id);
  }

  it("drops test profiles and qa_, test_, and vreset_ handles", () => {
    assert.equal(trendingAuthorHidden({ username: "ada", isTest: true }), true);
    assert.equal(trendingAuthorHidden({ username: "qa_alpha" }), true);
    assert.equal(trendingAuthorHidden({ username: "QA_Alpha" }), true);
    assert.equal(trendingAuthorHidden({ username: "@test_user" }), true);
    assert.equal(trendingAuthorHidden({ username: "vreset_1021" }), true);
    assert.equal(trendingAuthorHidden({ username: "qa-bot" }), true);
    assert.equal(trendingAuthorHidden({ username: "slabhold", isTest: true }), true);
    assert.equal(trendingAuthorHidden({ username: "slabhold" }), false);
    assert.equal(trendingAuthorHidden({ username: "testing" }), false);
    assert.equal(trendingAuthorHidden({ username: "latest" }), false);

    const people = [
      author("one", "qa_alpha"),
      author("two", "ada"),
      author("three", "test_user"),
      author("four", "vreset_1021"),
    ];
    assert.deepEqual(shown(people), []);

    const flagged = [
      author("one", "ada", { isTest: true }),
      author("two", "bea"),
      author("three", "cy"),
      author("four", "dee"),
    ];
    assert.deepEqual(shown(flagged), ["four", "three", "two"]);
  });

  it("drops private, hidden, deleted, and missing posts", () => {
    const people = ids.map((id) => author(id, id));
    const posts = [
      post("one", "one", { hiddenAt: "2026-10-22T00:00:00.000Z" }),
      post("two", "two", { deleted: true }),
      post("three", "three", { privateContent: true, player: "Secret Player" }),
      post("four", "four"),
    ];
    assert.deepEqual(shown(people, posts), []);

    const kept = rank(["two", "three", "four"], people, {
      posts: [post("two", "two"), post("three", "three"), post("four", "gone")],
    });
    assert.deepEqual(kept.map((row) => row.id), []);
  });

  it("self-spam on 3 posts shows no rail", () => {
    const ids = ["one", "two", "three"];
    const people = ids.map((id) => author(id, id));
    const engagements = ids.flatMap((id) => [
      like(id, 0, "like", { actorId: id, recipientId: id }),
      like(id, 0, "reply", { actorId: id }),
      like(id, 0, "reply", { actorId: id }),
      like(id, 0, "repost", { actorId: id }),
      like(id, 0, "quote", { actorId: id }),
    ]);
    assert.deepEqual(trendingCandidateIds(engagements, NOW), []);
    assert.deepEqual(rank(ids, people, { engagements }), []);
  });

  it("does not count a forged like", () => {
    const ids = ["one", "two", "three", "four"];
    const people = ids.map((id) => author(id, id));
    const engagements = [
      like("one", 0, "like", { actorId: "real-one", recipientId: "one" }),
      like("one", 0, "like", { actorId: "forged-one", recipientId: "someone-else" }),
      ...fresh(["two", "three", "four"]),
    ];
    const ranked = rank(ids, people, { engagements });
    assert.equal(
      ranked.some((row) => row.id === "one"),
      false,
    );
    assert.equal(ranked.length, 3);
  });

  it("counts a person once when they engage more than once", () => {
    const ids = ["one", "two", "three"];
    const people = ids.map((id) => author(id, id));
    const engagements = [
      like("one", 0, "reply", { actorId: "fan-repeat" }),
      like("one", 1, "reply", { actorId: "fan-repeat" }),
      like("one", 0, "like", { actorId: "fan-other", recipientId: "one" }),
      ...fresh(["two", "three"]),
    ];
    const ranked = rank(ids, people, { engagements });
    const postOne = ranked.find((row) => row.id === "one");
    assert.equal(postOne?.engagements, 2);
    assert.equal(postOne?.score, 2);
  });

  it("drops engagement from a test account", () => {
    const ids = ["one", "two", "three", "four"];
    const people = [
      ...ids.map((id) => author(id, id)),
      author("qa-fan", "qa_fan"),
      author("flagged", "bea", { isTest: true }),
    ];
    const engagements = [
      like("one", 0, "like", { actorId: "qa-fan", recipientId: "one" }),
      like("one", 0, "like", { actorId: "flagged", recipientId: "one" }),
      ...fresh(["two", "three", "four"]),
    ];
    const ranked = rank(ids, people, { engagements });
    assert.equal(
      ranked.some((row) => row.id === "one"),
      false,
    );
    assert.equal(ranked.length, 3);
  });

  it("excludes old Mail Day posts", () => {
    const ids = ["one", "two", "three", "four"];
    const people = ids.map((id) => author(id, id));
    const ranked = rank(ids, people, {
      posts: ids.map((id) => post(id, id, id === "one" ? { postType: "mail_day" } : {})),
    });
    assert.equal(
      ranked.some((row) => row.id === "one"),
      false,
    );
    assert.equal(ranked.length, 3);
    assert.deepEqual(
      rank(["one", "two", "three"], people, {
        posts: [
          post("one", "one", { postType: "mail_day" }),
          post("two", "two"),
          post("three", "three"),
        ],
      }),
      [],
    );
  });

  it("drops authors the viewer blocked or muted", () => {
    const people = ids.map((id) => author(id, id));
    assert.deepEqual(shown(people, undefined, ["one"]), ["four", "three", "two"]);
    assert.deepEqual(shown(people, undefined, [], ["two"]), ["four", "one", "three"]);
    assert.deepEqual(shown(people, undefined, ["one"], ["two", "three"]), []);
  });

  it("keeps a public player and refuses a private card", () => {
    const card = "11111111-1111-4111-8111-111111111111";
    const other = "22222222-2222-4222-8222-222222222222";
    const secret = "33333333-3333-4333-8333-333333333333";
    const cards = new Map([
      [card, { id: card, isPublic: true, player: "Victor Wembanyama" }],
      [other, { id: other, isPublic: true, player: "Caitlin Clark" }],
      [secret, { id: secret, isPublic: false, player: "Hidden Name" }],
    ]);
    assert.deepEqual(attachedCardIds({ card: { id: card }, meta: { cards: [{ id: other }] }, linked: [card] }), [
      card,
      other,
    ]);
    assert.deepEqual(trendingPostPrivacy([card, other], cards), {
      privateContent: false,
      player: "Victor Wembanyama, Caitlin Clark",
    });
    assert.deepEqual(trendingPostPrivacy([card, secret], cards), {
      privateContent: true,
      player: null,
    });
    assert.deepEqual(trendingPostPrivacy(["missing", card], cards), {
      privateContent: false,
      player: "Victor Wembanyama",
    });
    assert.deepEqual(trendingPostPrivacy([], cards), { privateContent: false, player: null });

    const ranked = rank(["one", "two", "three"], ["one", "two", "three"].map((id) => author(id, id)), {
      posts: [
        post("one", "one", { player: "Victor Wembanyama", body: "  Pulled   this today  " }),
        post("two", "two"),
        post("three", "three"),
      ],
    });
    assert.equal(ranked[0]?.player, "Victor Wembanyama");
    assert.equal(ranked[0]?.excerpt, "Pulled this today");
  });
});

describe("trending threshold", () => {
  it("hides the strip below 3 posts or when a post has fewer than 2 engagements", () => {
    assert.equal(TRENDING_MIN_POSTS, 3);
    assert.equal(TRENDING_MIN_ENGAGEMENTS, 2);

    const people = ["one", "two", "three"].map((id) => author(id, id));
    const twoPosts = rank(["one", "two"], people);
    assert.deepEqual(twoPosts, []);

    const quietThird = rank(["one", "two", "three"], people, {
      engagements: [...fresh(["one", "two"]), like("three", 0)],
    });
    assert.deepEqual(quietThird, []);

    const shown = rank(["one", "two", "three"], people);
    assert.equal(shown.length, 3);

    const oldOnly = trendingCandidateIds(
      [like("one", 30), like("one", 30), ...fresh(["two"])],
      NOW,
    );
    assert.deepEqual(oldOnly, ["two"]);
    assert.equal(oldOnly.length < TRENDING_MIN_POSTS, true);
  });

  it("hides again when the viewer filter falls under the minimum", () => {
    const items = ["one", "two", "three", "four"].map((id) => item(id, id));
    assert.equal(filterTrendingForViewer(items).length, 4);
    assert.deepEqual(
      filterTrendingForViewer(items, { blockedIds: ["one"] }).map((row) => row.id),
      ["two", "three", "four"],
    );
    assert.deepEqual(filterTrendingForViewer(items, { mutedIds: ["one", "two"] }), []);
    assert.deepEqual(filterTrendingForViewer(items.slice(0, 2)), []);
    assert.equal(filterTrendingForViewer(items, { visibleIds: null }).length, 4);

    const many = Array.from({ length: 10 }, (_, index) => item(`p${index}`, `p${index}`));
    assert.equal(filterTrendingForViewer(many).length, TRENDING_LIMIT);
  });

  it("the author blocked the viewer", async () => {
    const items = ["one", "two", "three"].map((id) => item(id, id));
    const hiddenFromViewer = new Set(["two", "three"]);
    assert.deepEqual(filterTrendingForViewer(items, { visibleIds: hiddenFromViewer }), []);
    assert.equal(filterTrendingForViewer(items, { visibleIds: new Set(["one", "two", "three"]) }).length, 3);
    assert.equal(filterTrendingForViewer(items).length, 3);

    const seen = await loadViewerPostIds(
      {
        from(table: string) {
          assert.equal(table, "posts");
          return {
            select(columns: string) {
              assert.equal(columns, "id");
              return {
                in(column: string, values: readonly string[]) {
                  assert.equal(column, "id");
                  assert.deepEqual([...values], ["one", "two", "three"]);
                  return Promise.resolve({ data: [{ id: "two" }, { id: "three" }], error: null });
                },
              };
            },
          };
        },
      },
      ["one", "two", "three"],
    );
    assert.deepEqual(seen, ["two", "three"]);
    assert.deepEqual(filterTrendingForViewer(items, { visibleIds: new Set(seen) }), []);
  });
});

describe("trending strip", () => {
  it("renders a horizontal rail and nothing when the list is too short", () => {
    assert.equal(renderToStaticMarkup(createElement(TrendingNowStrip, { items: [] })), "");
    assert.equal(
      renderToStaticMarkup(
        createElement(TrendingNowStrip, { items: [item("one", "one"), item("two", "two")] }),
      ),
      "",
    );

    const html = renderToStaticMarkup(
      createElement(TrendingNowStrip, {
        items: [
          item("one", "ada", { displayName: "Ada", username: "ada", player: "Victor Wembanyama", excerpt: "Mail day" }),
          item("two", "bea", { displayName: "Bea", username: "bea" }),
          item("three", "cy", { displayName: "Cy", username: "cy" }),
        ],
      }),
    );
    assert.match(html, new RegExp(TRENDING_HEADING));
    assert.match(html, /Victor Wembanyama/);
    assert.match(html, /Mail day/);
    assert.match(html, /href="\/posts\/one"/);
    assert.match(html, /overflow-x-auto/);
    assert.match(html, /shrink-0/);
    assert.match(html, /max-md:pr-20/);
    assert.match(html, /data-no-pull/);
    assert.match(html, /min-h-44/);
    assert.match(html, /line-clamp-2/);
    assert.doesNotMatch(html, /line-clamp-2 block/);
    assert.doesNotMatch(html, /nfl|logo\.svg|team-logo|CardThumb/i);
    assert.doesNotMatch(html, /<img /);

    const reserved = renderToStaticMarkup(createElement(TrendingNowSkeleton));
    assert.match(reserved, /data-trending-skeleton/);
    assert.match(reserved, /min-h-44/);
    assert.match(reserved, /aria-hidden="true"/);
  });

  it("sits on For You only and stays out of login", () => {
    const feed = read("components/feed-view.tsx");
    const trending = feed.indexOf('lane === "foryou" ? <TrendingNow />');
    const moving = feed.indexOf('lane === "foryou" ? movingToday ?? <MovingToday />');
    assert.ok(trending > 0 && moving > trending);

    const client = read("components/trending-now.tsx");
    const strip = read("components/trending-now-strip.tsx");
    assert.match(client, /filterTrendingForViewer/);
    assert.match(client, /\/api\/trending-now/);
    assert.match(client, /from\("posts"\)\.select\("id"\)\.in\("id"/);
    assert.match(client, /trendingPublicSession\(\) !== null/);
    assert.match(client, /if \(!viewerId/);
    assert.match(client, /TrendingNowSkeleton/);
    assert.match(read("lib/social/trending.ts"), /from\("posts"\)\.select\("id"\)\.in\("id"/);
    assert.doesNotMatch(client, /trending-load|createSupabaseAdmin|server-only|unstable_cache/);
    assert.doesNotMatch(strip, /nfl|logo\.svg|card-thumb|CardThumb/i);
    assert.doesNotMatch(strip, /line-clamp-2 block/);
    assert.match(strip, /min-h-44/);
    assert.match(strip, /data-trending-skeleton/);

    for (const path of [
      "app/(app)/login/page.tsx",
      "app/(app)/page.tsx",
      "app/welcome/page.tsx",
      "app/layout.tsx",
      "components/auth-form.tsx",
    ]) {
      assert.doesNotMatch(read(path), /trending-now|TrendingNow/);
    }
    // Signed-out Home is app/welcome; it stays the cached static page.
    assert.match(read("app/welcome/page.tsx"), /export const revalidate = 1800/);
  });
});

describe("trending cache", () => {
  it("ranks on the server and reuses that read for five minutes", () => {
    assert.equal(TRENDING_CACHE_SECONDS, 300);
    assert.match(trendingCacheControl(), /s-maxage=300/);
    assert.match(trendingCacheControl(), /max-age=0/);
    assert.ok(TRENDING_ENGAGEMENT_LIMIT <= 1000);

    const load = read("lib/social/trending-load.ts");
    const queries = read("lib/social/trending-read.ts");
    const route = read("app/api/trending-now/route.ts");
    assert.match(load, /unstable_cache/);
    assert.match(load, /revalidate: TRENDING_CACHE_SECONDS/);
    assert.match(load, /\["trending-now-v2"\]/);
    assert.doesNotMatch(load, /catch/);
    assert.match(queries, /"like"/);
    assert.match(queries, /"reply"/);
    assert.match(queries, /"quote"/);
    assert.match(queries, /"repost"/);
    assert.match(queries, /notifications/);
    assert.match(queries, /actor_id/);
    assert.match(queries, /recipient_id/);
    assert.match(queries, /comments/);
    assert.match(queries, /user_id/);
    assert.match(queries, /quoted_post_id/);
    assert.match(queries, /reposts/);
    assert.match(queries, /post_type/);
    assert.match(queries, /is_test/);
    assert.match(queries, /hidden_at/);
    assert.match(queries, /is_public/);
    assert.match(queries, /\.limit\(TRENDING_ENGAGEMENT_LIMIT\)/);
    assert.match(queries, /engagement read hit the/);
    assert.doesNotMatch(queries, /drop table|delete from|truncate/i);
    assert.match(route, /getTrendingNow/);
    assert.match(route, /trendingCacheControl/);
    assert.match(route, /private, no-store/);
    assert.match(route, /Failures are not stored/);
    assert.doesNotMatch(route, /cookies\(/);
    assert.doesNotMatch(read("app/(app)/page.tsx"), /cookies\(|getTrendingNow/);
  });

  it("reuses a loaded rail for the session and forgets it after the ttl", () => {
    clearTrendingSession();
    const items = ["one", "two", "three"].map((id) => item(id, id));
    const start = 1_700_000_000_000;
    rememberTrendingPublic(items, start);
    rememberTrendingVisible("viewer", ["one", "two", "three"], start);
    assert.equal(trendingPublicSession(start + TRENDING_SESSION_MS)?.length, 3);
    assert.deepEqual(trendingVisibleSession("viewer", start + TRENDING_SESSION_MS), ["one", "two", "three"]);
    assert.equal(trendingVisibleSession("other", start), null);
    assert.equal(trendingPublicSession(start + TRENDING_SESSION_MS + 1), null);
    assert.equal(trendingVisibleSession("viewer", start + TRENDING_SESSION_MS + 1), null);
    clearTrendingSession();
  });

  it("ignores a payload that is not the ranking", () => {
    assert.deepEqual(trendingItemsFromPayload(null), []);
    assert.deepEqual(trendingItemsFromPayload({ items: [{ id: "x", href: "https://evil.test", authorId: "a", username: "a" }] }), []);
    const parsed = trendingItemsFromPayload({
      items: [
        {
          id: "one",
          href: "/posts/one",
          authorId: "ada",
          username: "ada",
          displayName: "Ada",
          player: "Victor Wembanyama",
          excerpt: "Hello",
          score: 2,
          engagements: 2,
        },
      ],
    });
    assert.equal(parsed[0]?.player, "Victor Wembanyama");
    assert.equal(parsed[0]?.href, "/posts/one");
  });
});
