import "@/lib/test/server-only-stub";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { collectionStoryResponse, collectionImageModel, inviteImageModel } from "./images";
import { readPublicCollector, type PublicCollector } from "./public-collector";

type Result = { data?: unknown; count?: number | null; error: { message: string } | null };

/** Answers from(table) with the queued result for that table, recording each call. */
function fakeClient(results: Record<string, Result[]>) {
  const calls: string[] = [];
  const client = {
    from(table: string) {
      calls.push(table);
      const result = results[table]?.shift() ?? { data: null, error: null };
      const chain: Record<string, unknown> = {};
      for (const name of ["select", "eq", "not", "order", "limit"]) chain[name] = () => chain;
      chain.maybeSingle = async () => result;
      chain.then = (resolve: (value: Result) => unknown) => resolve(result);
      return chain;
    },
  } as unknown as SupabaseClient;
  return { client, calls };
}

const ADA = { id: "u-ada", username: "ada", display_name: "Ada Lane", avatar_url: null };

function cardRow(id: string, owner = "u-ada") {
  return {
    id,
    user_id: owner,
    player: "Sample Player",
    year: 2023,
    set: "Prizm",
    grade: "10",
    grader: "PSA",
    parallel: "Base",
    estimated_value: 100,
    image_url: `https://example.supabase.co/storage/v1/object/public/card-photos/u-ada/${id}.jpg`,
    card_number: "1",
    sport: "Basketball",
    accent: null,
    year_label: "2023",
    set_name: "Prizm",
    condition_type: "graded",
  };
}

const opts = { cardLimit: 3, withPhotos: true };

describe("public collector reads", () => {
  it("reads the profile, follower and public card counts, and cards from public_cards only", async () => {
    const { client, calls } = fakeClient({
      profiles: [{ data: ADA, error: null }],
      follows: [{ count: 12, error: null }],
      public_cards: [
        { count: 5, error: null },
        { data: [cardRow("c1"), cardRow("c2"), cardRow("x", "someone-else")], error: null },
      ],
    });
    const collector = await readPublicCollector(client, "Ada", opts);
    assert.ok(collector);
    assert.equal(collector.displayName, "Ada Lane");
    assert.equal(collector.followerCount, 12);
    assert.equal(collector.publicCardCount, 5);
    assert.deepEqual(collector.cards.map((card) => card.id), ["c1", "c2"]);
    assert.ok(!calls.includes("cards"), "never the private cards table");
  });

  it("is null for unknown, reserved and unreadable handles, and on read errors", async () => {
    assert.equal(await readPublicCollector(fakeClient({ profiles: [{ data: null, error: null }] }).client, "ghost", opts), null);
    const reserved = fakeClient({});
    assert.equal(await readPublicCollector(reserved.client, "admin", opts), null);
    assert.deepEqual(reserved.calls, [], "a reserved handle is never looked up");
    assert.equal(await readPublicCollector(fakeClient({}).client, "../etc", opts), null);
    assert.equal(
      await readPublicCollector(fakeClient({ profiles: [{ data: null, error: { message: "denied" } }] }).client, "ada", opts),
      null,
    );
    assert.equal(
      await readPublicCollector(
        fakeClient({ profiles: [{ data: ADA, error: null }], public_cards: [{ count: 1, error: null }, { data: null, error: { message: "x" } }] })
          .client,
        "ada",
        opts,
      ),
      null,
    );
    assert.equal(await readPublicCollector(null, "ada", opts), null);
  });

  it("keeps a 0-card collector, and leaves counts out when they can't be read", async () => {
    const collector = await readPublicCollector(
      fakeClient({
        profiles: [{ data: ADA, error: null }],
        follows: [{ count: null, error: { message: "x" } }],
        public_cards: [{ count: null, error: { message: "x" } }, { data: [], error: null }],
      }).client,
      "ada",
      opts,
    );
    assert.ok(collector);
    assert.equal(collector.cards.length, 0);
    assert.equal(collector.followerCount, null);
    assert.equal(collector.publicCardCount, null);
  });
});

const collector: PublicCollector = {
  id: "u-ada",
  username: "ada",
  displayName: "Ada Lane",
  avatarUrl: null,
  followerCount: 3,
  publicCardCount: 0,
  cards: [],
};

describe("invite and collection images", () => {
  it("draw nobody for a private, unknown or reserved collector", () => {
    for (const model of [inviteImageModel(null), collectionImageModel(null)]) {
      assert.equal(model.authorHandle, "");
      assert.equal(model.authorName, "");
      assert.equal(model.avatarUrl, null);
      assert.deepEqual(model.slabs, []);
    }
    assert.equal(inviteImageModel(null).body, "You're invited to Slabhold");
  });

  it("say who invited you, with their top cards", () => {
    const model = inviteImageModel({ ...collector, cards: [] });
    assert.equal(model.body, "Ada Lane invited you to Slabhold");
    assert.equal(model.authorHandle, "ada");
    assert.equal(collectionImageModel({ ...collector, publicCardCount: 128 }).detail, "128 cards");
    assert.equal(collectionImageModel({ ...collector, publicCardCount: 1 }).detail, "1 card");
  });

  it("serve the Story as a saved 1080×1920 PNG, and a 404 for private or unknown", { timeout: 60_000 }, async () => {
    const missing = await collectionStoryResponse(null);
    assert.equal(missing.status, 404);
    assert.equal(missing.headers.get("content-type")?.includes("image"), false);

    const story = await collectionStoryResponse(collector);
    assert.equal(story.status, 200);
    assert.equal(story.headers.get("Content-Type"), "image/png");
    assert.match(story.headers.get("Content-Disposition") ?? "", /attachment; filename="slabhold-ada-collection\.png"/);
    const bytes = Buffer.from(await story.arrayBuffer());
    assert.equal(bytes.readUInt32BE(16), 1080);
    assert.equal(bytes.readUInt32BE(20), 1920);
  });

  it("are wired to the public loaders and cached like profile images", () => {
    const read = (file: string) => readFileSync(join(process.cwd(), file), "utf8");
    assert.match(read("app/(app)/i/[username]/opengraph-image.tsx"), /inviteImageResponse\(await loadInviteCollector\(username\)\)/);
    assert.match(read("app/(app)/i/[username]/twitter-image.tsx"), /from "\.\/opengraph-image"/);
    assert.match(
      read("app/(app)/u/[username]/collection/opengraph-image.tsx"),
      /collectionImageResponse\(await loadCollectionImageCollector\(username\)\)/,
    );
    assert.match(
      read("app/api/share-image/collection/[username]/route.tsx"),
      /collectionStoryResponse\(await loadCollectionImageCollector\(username\)\)/,
    );
    const images = read("lib/invites/images.tsx");
    assert.match(images, /CARD_OG_CACHE_CONTROL/);
    const load = read("lib/invites/load.ts");
    assert.doesNotMatch(load, /createSupabaseAdmin|SERVICE_ROLE|createSupabaseServer|cookies\(\)/);
  });
});
