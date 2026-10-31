import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getStartedHintScript, seededChecklist, type HomeSeed } from "./home-seed";
import { loadHomeSeed } from "./load-home-seed";
import { usableClientHomeSeed, wantsClientHomeSeed } from "./use-client-home-seed";
import { loadViewerShell } from "./viewer-shell";

const VIEWER = "11111111-1111-4111-8111-111111111111";
const FRIENDS = [
  "22222222-2222-4222-8222-222222222222",
  "33333333-3333-4333-8333-333333333333",
  "44444444-4444-4444-8444-444444444444",
];
const REPLIER = "55555555-5555-4555-8555-555555555555";
const BLOCKED = "66666666-6666-4666-8666-666666666666";
const MUTED = "77777777-7777-4777-8777-777777777777";
const POST = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OLD = "2025-01-01T00:00:00.000Z";

type Call = { table: string; ops: string[]; count?: unknown };

function profile(id: string, createdAt = OLD) {
  return {
    id,
    username: id.slice(0, 8),
    display_name: id.slice(0, 8),
    bio: "",
    avatar_url: null,
    cover_url: null,
    accent: "#7c5cff",
    created_at: createdAt,
  };
}

/**
 * A Supabase client whose queries record their filters and answer from
 * fixtures. Any builder method is accepted, so the feed loader's own
 * queries run unchanged.
 */
function fakeClient(options: { follows?: string[]; cards?: number; createdAt?: string; failCards?: boolean } = {}) {
  const calls: Call[] = [];
  const rpcs: { fn: string; args: unknown }[] = [];
  const follows = options.follows ?? FRIENDS;
  function rows(table: string, ops: string[]) {
    const joined = ops.join("|");
    if (table === "profiles") {
      const ids = [VIEWER, ...FRIENDS, REPLIER].filter((id) => joined.includes(id));
      return ids.map((id) => profile(id, id === VIEWER ? (options.createdAt ?? OLD) : OLD));
    }
    if (table === "follows") {
      return follows.map((id) => ({ follower_id: VIEWER, following_id: id, created_at: OLD }));
    }
    if (table === "blocks") return [{ blocked_id: BLOCKED }];
    if (table === "mutes") return [{ muted_id: MUTED }];
    if (table === "posts") {
      return [
        {
          id: POST,
          user_id: FRIENDS[0],
          content: "Pulled a 10",
          image_url: null,
          card: null,
          quoted_post_id: null,
          created_at: "2026-10-29T12:00:00.000Z",
          post_type: "post",
          show_paid: false,
          meta: null,
          like_count: 3,
        },
      ];
    }
    if (table === "comments" && joined.includes(POST)) {
      return [{ id: "c1", post_id: POST, user_id: REPLIER, body: "nice", created_at: "2026-10-29T12:05:00.000Z" }];
    }
    // The engagement read (reposts of posts on screen), not the feed's own repost rows.
    if (table === "reposts" && joined.includes("in:post_id") && !joined.includes("in:user_id")) {
      return [{ user_id: VIEWER, post_id: POST, created_at: "2026-10-29T12:06:00.000Z" }];
    }
    return [];
  }
  const supabase = {
    rpc(fn: string, args?: unknown) {
      rpcs.push({ fn, args });
      if (fn === "hidden_author_ids") return Promise.resolve({ data: [BLOCKED], error: null });
      if (fn === "suggest_collectors") {
        return Promise.resolve({
          data: [{ user_id: REPLIER, username: "replier", display_name: "Replier", reason: "Collects basketball", score: 1 }],
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: { message: "missing" } });
    },
    from(table: string) {
      const call: Call = { table, ops: [] };
      const builder: Record<string, unknown> = new Proxy(
        {},
        {
          get(_target, key) {
            if (key === "then") {
              return (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => {
                calls.push(call);
                if (table === "cards" && options.failCards) {
                  return Promise.resolve({ data: null, error: { message: "down" }, count: null }).then(resolve, reject);
                }
                const data = rows(table, call.ops);
                const count = table === "cards" ? (options.cards ?? 4) : null;
                return Promise.resolve({ data, error: null, count }).then(resolve, reject);
              };
            }
            return (...args: unknown[]) => {
              if (key === "select" && args[1]) call.count = args[1];
              call.ops.push(`${String(key)}:${args.map((arg) => (Array.isArray(arg) ? arg.join(",") : String(arg))).join(":")}`);
              return builder;
            };
          },
        },
      );
      return builder;
    },
  };
  return { supabase: supabase as unknown as SupabaseClient, calls, rpcs };
}

describe("Get started on the server's first screen", () => {
  const viewer = { id: VIEWER, email: "", username: "ada", displayName: "Ada", bio: "", avatarDataUrl: null, coverDataUrl: null, accent: "#7C3AED" };
  const now = Date.parse("2026-10-30T00:00:00.000Z");

  it("shows for a recent account with steps left, and not for an older or finished one", () => {
    const recent = { ...viewer, createdAt: "2026-10-28T00:00:00.000Z" };
    assert.equal(seededChecklist({ viewer: recent, followingCount: 0, cardCount: 0, now }).visible, true);
    assert.equal(seededChecklist({ viewer: { ...viewer, createdAt: OLD }, followingCount: 0, cardCount: 0, now }).visible, false);
    const done = { ...recent, bio: "PC: rookies" };
    assert.equal(seededChecklist({ viewer: done, followingCount: 3, cardCount: 1, now }).visible, false);
  });

  it("hides before paint when dismissed here, or when this device first saw the account as not new", () => {
    const run = (store: Record<string, string>, newNow: boolean) => {
      const dataset: Record<string, string> = {};
      const sandbox = {
        localStorage: { getItem: (key: string) => store[key] ?? null },
        document: { documentElement: { dataset } },
      };
      new Function("localStorage", "document", getStartedHintScript(VIEWER, newNow))(sandbox.localStorage, sandbox.document);
      return "getStartedHidden" in dataset;
    };
    const dismiss = `slabhold.get-started.dismissed.${VIEWER}`;
    const isNew = `slabhold.get-started.new.${VIEWER}`;
    assert.equal(run({}, true), false);
    assert.equal(run({}, false), true);
    assert.equal(run({ [isNew]: "1" }, false), false);
    assert.equal(run({ [isNew]: "0" }, true), true);
    assert.equal(run({ [dismiss]: "1", [isNew]: "1" }, true), true);
  });
});

describe("loadHomeSeed", () => {
  it("reads the first page of the tab Home opens on, with its replies, reposts, and people", async () => {
    const fake = fakeClient();
    const seed = await loadHomeSeed(fake.supabase, { id: VIEWER, email: "ada@example.com" });
    assert.ok(seed);
    // Three follows open on Following, like defaultHomeTab in the browser.
    assert.equal(seed.lane, "following");
    assert.equal(seed.viewer.id, VIEWER);
    assert.equal(seed.viewer.email, "ada@example.com");
    assert.deepEqual(seed.page.items.map((item) => item.post.id), [POST]);
    assert.equal(seed.page.posts[0]?.likeCount, 3);
    assert.match(seed.page.token, /^[0-9a-f-]{36}$/);
    assert.equal(seed.cardCount, 4);
    assert.equal(seed.newNow, false);
    assert.equal(seed.getStarted.visible, false);
    assert.deepEqual(seed.comments.map((comment) => comment.authorId), [REPLIER]);
    assert.ok(seed.profiles.some((person) => person.id === REPLIER), "repliers are named");
    assert.equal(seed.reposts.filter((repost) => repost.postId === POST).length, 1);
    assert.deepEqual(seed.blockedIds, [BLOCKED]);
    assert.deepEqual(seed.mutedIds, [MUTED]);
    assert.deepEqual(seed.follows.map((edge) => edge.followingId), FRIENDS);
    assert.equal(seed.suggestions?.[0]?.suggestionReason, "Collects basketball");

    // The viewer's own rows only: follows by follower, cards counted by owner, never read in full.
    const follows = fake.calls.find((call) => call.table === "follows");
    assert.ok(follows?.ops.includes(`eq:follower_id:${VIEWER}`));
    const cards = fake.calls.find((call) => call.table === "cards");
    assert.ok(cards?.ops.includes(`eq:user_id:${VIEWER}`));
    assert.deepEqual(cards?.count, { count: "exact", head: true });
    // The Following page asks for the followed authors plus the viewer.
    const posts = fake.calls.find((call) => call.table === "posts");
    assert.ok(posts?.ops.some((op) => op.startsWith("in:user_id:") && FRIENDS.every((id) => op.includes(id)) && op.includes(VIEWER)));
    // Replies and reposts go through the block and mute filter.
    const comments = fake.calls.find((call) => call.table === "comments");
    assert.ok(comments?.ops.some((op) => op.startsWith("not:user_id:in") && op.includes(BLOCKED)));
    const hidden = new Set(fake.rpcs.filter((call) => call.fn === "hidden_author_ids").map((call) => JSON.stringify(call.args)));
    assert.ok(hidden.has(JSON.stringify({ apply_mute: true })));
    assert.ok(hidden.has(JSON.stringify({ apply_mute: false })));
  });

  it("opens on For You below three follows", async () => {
    const seed = await loadHomeSeed(fakeClient({ follows: [FRIENDS[0]] }).supabase, { id: VIEWER, email: "" });
    assert.equal(seed?.lane, "foryou");
  });

  it("seeds a new account and an empty collection too, and only a failed read falls back", async () => {
    const fresh = await loadHomeSeed(
      fakeClient({ createdAt: new Date().toISOString(), cards: 0, follows: [] }).supabase,
      { id: VIEWER, email: "" },
    );
    assert.ok(fresh);
    assert.equal(fresh.cardCount, 0);
    assert.equal(fresh.newNow, true);
    assert.equal(fresh.getStarted.visible, true);
    assert.equal(fresh.lane, "foryou");
    assert.equal(await loadHomeSeed(fakeClient({ failCards: true }).supabase, { id: VIEWER, email: "" }), null);
  });
});

describe("viewer shell", () => {
  it("reads only the viewer's own rows, in one batch, and nothing site-wide", async () => {
    const fake = fakeClient();
    const shell = await loadViewerShell(fake.supabase, { id: VIEWER, email: "ada@example.com" });
    assert.ok(shell);
    assert.equal(shell.viewer.id, VIEWER);
    assert.deepEqual(shell.follows.map((edge) => edge.followingId), FRIENDS);
    assert.deepEqual(shell.blockedIds, [BLOCKED]);
    assert.deepEqual(shell.mutedIds, [MUTED]);
    assert.equal(shell.cardCount, 4);
    // profiles (the viewer), follows, blocks, mutes, a card head count, and both hidden-author lists.
    assert.deepEqual(fake.calls.map((call) => call.table).sort(), ["blocks", "cards", "follows", "mutes", "profiles"]);
    assert.equal(fake.rpcs.filter((call) => call.fn === "hidden_author_ids").length, 2);
    const profiles = fake.calls.find((call) => call.table === "profiles");
    assert.ok(profiles?.ops.some((op) => op.startsWith("in:id:") && op.includes(VIEWER)));
    for (const call of fake.calls) {
      assert.notEqual(call.table, "public_cards");
      assert.notEqual(call.table, "comments");
      assert.notEqual(call.table, "notifications");
      assert.notEqual(call.table, "messages");
    }
  });

  it("reuses a follows read the caller already started", async () => {
    const fake = fakeClient();
    const follows = Promise.resolve([{ followerId: VIEWER, followingId: FRIENDS[0], createdAt: OLD }]);
    const shell = await loadViewerShell(fake.supabase, { id: VIEWER, email: "" }, { follows });
    assert.deepEqual(shell?.follows.map((edge) => edge.followingId), [FRIENDS[0]]);
    assert.equal(fake.calls.some((call) => call.table === "follows"), false);
  });

  it("falls back (null) when the viewer's own reads fail", async () => {
    assert.equal(await loadViewerShell(fakeClient({ failCards: true }).supabase, { id: VIEWER, email: "" }), null);
  });
});

describe("Home seed read in the browser", () => {
  it("is the same first screen, marked as the browser's own", async () => {
    const fake = fakeClient();
    const client = await loadHomeSeed(fake.supabase, { id: VIEWER, email: "" }, "client");
    const server = await loadHomeSeed(fakeClient().supabase, { id: VIEWER, email: "" });
    assert.ok(client && server);
    assert.equal(client.source, "client");
    assert.equal("source" in server, false);
    assert.deepEqual(client.page.items, server.page.items);
    assert.deepEqual(client.comments, server.comments);
    assert.deepEqual(client.follows, server.follows);
    assert.equal(fake.calls.some((call) => call.table === "public_cards"), false);
  });

  it("is read only with a session hint, no server copy, and no snapshot yet", () => {
    const base = { serverSeed: null, ready: false, configured: true, hinted: true };
    assert.equal(wantsClientHomeSeed(base), true);
    assert.equal(wantsClientHomeSeed({ ...base, ready: true }), false);
    assert.equal(wantsClientHomeSeed({ ...base, hinted: false }), false);
    assert.equal(wantsClientHomeSeed({ ...base, configured: false }), false);
    assert.equal(wantsClientHomeSeed({ ...base, serverSeed: {} as HomeSeed }), false);
  });

  it("uses a browser-read seed only while it's wanted, and only for the viewer it was read for", () => {
    const seed = { viewer: { id: "viewer-a" } } as HomeSeed;
    assert.equal(usableClientHomeSeed({ clientSeed: seed, wanted: true, viewerId: null }), seed);
    assert.equal(usableClientHomeSeed({ clientSeed: seed, wanted: true, viewerId: "viewer-a" }), seed);
    // Someone else is signed in now: never draw the last viewer's Home.
    assert.equal(usableClientHomeSeed({ clientSeed: seed, wanted: true, viewerId: "viewer-b" }), null);
    // The snapshot is in (or a server seed came): nothing to stand in for.
    assert.equal(usableClientHomeSeed({ clientSeed: seed, wanted: false, viewerId: "viewer-a" }), null);
    assert.equal(usableClientHomeSeed({ clientSeed: null, wanted: true, viewerId: null }), null);
    // And the hook drops the stored seed once it isn't wanted, so it can't come back later.
    const hook = readFileSync(join(process.cwd(), "lib/social/use-client-home-seed.ts"), "utf8");
    assert.match(hook, /return \(\) => \{\n\s+cancelled = true;\n\s+setClientSeed\(null\);/);
  });

  it("loads its reads in their own chunk, so Home's first load stays the same size", () => {
    const hook = readFileSync(join(process.cwd(), "lib/social/use-client-home-seed.ts"), "utf8");
    assert.match(hook, /import\("\.\/load-home-seed"\)/);
    assert.doesNotMatch(hook, /from "\.\/load-home-seed"/);
    const gate = readFileSync(join(process.cwd(), "components/home-gate.tsx"), "utf8");
    assert.match(gate, /useClientHomeSeed\(\{ serverSeed, ready, viewerId: user\?\.id \?\? null \}\)/);
    const load = readFileSync(join(process.cwd(), "lib/social/load-home-seed.ts"), "utf8");
    assert.doesNotMatch(load, /node:crypto/);
  });

  it("takes Get started from this device for a browser-read seed", () => {
    const feed = readFileSync(join(process.cwd(), "components/feed-view.tsx"), "utf8");
    assert.match(feed, /const serverScreen = seededScreen && seed\?\.source !== "client";/);
    assert.match(feed, /const started = serverScreen && seed \? seed\.getStarted : checklist;/);
    assert.match(feed, /\{serverScreen && seed && started\.visible \? \(/);
    assert.doesNotMatch(feed, /seededScreen && seed \? seed\.getStarted/);
  });
});
