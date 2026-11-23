import "@/lib/test/server-only-stub";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { deflateSync, crc32 } from "node:zlib";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { canShareStory, ShareToStoryItem } from "@/components/post-story-item";
import { storyCount } from "@/components/og-share";
import { postStoryFilename, postStoryLink, postStoryPath } from "./links";
import { readPostStory, withInviteCode } from "./post-story";
import { postStoryResponse, type PostStoryViewer } from "./post-story-response";

const POST_ID = "6f1c2a9e-1b2c-4d3e-8f4a-5b6c7d8e9f01";
const CARD_ID = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
const AUTHOR = "1d2c3b4a-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
const OTHER = "9f8e7d6c-5b4a-4c3d-8e2f-1a0b9c8d7e6f";
const CODE = "0123456789abcdef0123456789abcdef";

/** A small PNG card photo built in memory: a light border and a purple-gray face. No real player. */
function fixturePng(width: number, height: number): string {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (width * 3 + 1);
    raw[rowStart] = 0;
    for (let x = 0; x < width; x++) {
      const edge = x < 14 || y < 14 || x >= width - 14 || y >= height - 14;
      const name = y > height * 0.8 && y < height * 0.9 && x > 40 && x < width - 40;
      const t = y / height;
      const [r, g, b] = edge
        ? [232, 232, 236]
        : name
          ? [24, 24, 27]
          : [Math.round(70 + 60 * t), Math.round(60 + 30 * t), Math.round(120 + 80 * (1 - t))];
      raw[rowStart + 1 + x * 3] = r;
      raw[rowStart + 2 + x * 3] = g;
      raw[rowStart + 3 + x * 3] = b;
    }
  }
  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  return `data:image/png;base64,${png.toString("base64")}`;
}

const PHOTO = fixturePng(250, 350);

type Result = { data?: unknown; count?: number | null; error: { message: string } | null };

/** Answers from(table) with the queued result for that table, recording each table and select. */
function fakeClient(results: Record<string, Result[]>) {
  const calls: string[] = [];
  const selects: string[] = [];
  const client = {
    from(table: string) {
      calls.push(table);
      const result = results[table]?.shift() ?? { data: null, error: null };
      const chain: Record<string, unknown> = {};
      chain.select = (columns: string) => {
        selects.push(`${table}:${columns}`);
        return chain;
      };
      for (const name of ["eq", "in", "not", "order", "limit"]) chain[name] = () => chain;
      chain.maybeSingle = async () => result;
      chain.then = (resolve: (value: Result) => unknown) => resolve(result);
      return chain;
    },
  } as unknown as SupabaseClient;
  return { client, calls, selects };
}

const ADA = { username: "ada_cards", display_name: "Ada Lane", avatar_url: null };

function postRow(overrides: Record<string, unknown> = {}) {
  return {
    id: POST_ID,
    user_id: AUTHOR,
    content: "Pulled this one at the card show today. Centering looks clean.",
    image_url: null,
    card: null,
    post_type: "post",
    meta: null,
    hidden_at: null,
    ...overrides,
  };
}

function cardRow() {
  return {
    id: CARD_ID,
    user_id: AUTHOR,
    player: "Sample Player",
    year: 2023,
    year_label: "2023",
    set: "Prizm",
    set_name: "Prizm",
    grade: "10",
    grader: "PSA",
    parallel: "Silver",
    is_rookie: true,
    condition_type: "graded",
    estimated_value: 4321,
    image_url: PHOTO,
    card_number: "1",
    sport: "Basketball",
    accent: null,
    created_at: "2026-11-01T00:00:00Z",
  };
}

/** A post with a public graded card attached, as Home shows it. */
function cardPostClient(post: Record<string, unknown> = {}) {
  return fakeClient({
    posts: [
      { data: postRow({ card: { id: CARD_ID, playerName: "Sample Player", photoDataUrl: PHOTO, paidPrice: 4321 }, ...post }), error: null },
      { data: { like_count: 1284 }, error: null },
    ],
    profiles: [{ data: ADA, error: null }],
    public_cards: [{ data: [cardRow()], error: null }],
    comments: [{ count: 37, error: null }],
  });
}

function textPostClient() {
  return fakeClient({
    posts: [
      { data: postRow({ content: "Who else is chasing the silver rookies this year? Drop your favorite pickup below." }), error: null },
      { data: { like_count: 9 }, error: null },
    ],
    profiles: [{ data: ADA, error: null }],
    comments: [{ count: 0, error: null }],
  });
}

function viewer(overrides: Partial<PostStoryViewer> & { asked?: string[] } = {}): PostStoryViewer & { asked: string[] } {
  const asked = overrides.asked ?? [];
  return {
    asked,
    canSee: overrides.canSee ?? (async () => true),
    id: overrides.id ?? (async () => null),
    inviteCode:
      overrides.inviteCode ??
      (async () => {
        asked.push("code");
        return CODE;
      }),
  };
}

function pngSize(bytes: Buffer) {
  assert.equal(bytes.subarray(1, 4).toString("ascii"), "PNG");
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

/** POST_STORY_OUT=dir writes the two fixture images, for the PR screenshots. */
function keep(name: string, bytes: Buffer) {
  const dir = process.env.POST_STORY_OUT;
  if (!dir) return;
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, name), bytes);
}

describe("post Story image route", () => {
  it("returns a saved 1080×1920 PNG for a public post with a card photo", { timeout: 60_000 }, async () => {
    const { client } = cardPostClient();
    const response = await postStoryResponse(POST_ID, client, viewer());
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Content-Type"), "image/png");
    assert.match(response.headers.get("Content-Disposition") ?? "", /attachment; filename="slabhold-ada_cards-post\.png"/);
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.deepEqual(pngSize(bytes), { width: 1080, height: 1920 });
    keep("post-story-card.png", bytes);
  });

  it("returns a 1080×1920 PNG for a text-only post, without pulling in the author's cards", { timeout: 60_000 }, async () => {
    const { client, calls } = textPostClient();
    const response = await postStoryResponse(POST_ID, client, viewer());
    assert.equal(response.status, 200);
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.deepEqual(pngSize(bytes), { width: 1080, height: 1920 });
    assert.ok(!calls.includes("public_cards"), "no card is read for a post without one");
    assert.ok(!calls.includes("cards"), "never the private cards table");
    keep("post-story-text.png", bytes);
  });

  it("is a 404 for hidden, deleted, unknown and blocked posts", async () => {
    const hidden = fakeClient({ posts: [{ data: postRow({ hidden_at: "2026-11-20T00:00:00Z" }), error: null }] });
    assert.equal((await postStoryResponse(POST_ID, hidden.client, viewer())).status, 404);

    const deleted = fakeClient({ posts: [{ data: null, error: null }] });
    assert.equal((await postStoryResponse(POST_ID, deleted.client, viewer())).status, 404);

    const failed = fakeClient({ posts: [{ data: null, error: { message: "denied" } }] });
    assert.equal((await postStoryResponse(POST_ID, failed.client, viewer())).status, 404);

    const bad = fakeClient({});
    assert.equal((await postStoryResponse("not-a-post", bad.client, viewer())).status, 404);
    assert.deepEqual(bad.calls, [], "a bad id is never looked up");

    // The viewer's own session can't read it (a block): 404 before anything is read.
    const blocked = cardPostClient();
    const response = await postStoryResponse(POST_ID, blocked.client, viewer({ canSee: async () => false }));
    assert.equal(response.status, 404);
    assert.equal(response.headers.get("content-type")?.includes("image"), false);
    assert.deepEqual(blocked.calls, []);

    // An author with no public profile has no invite link: nothing to share.
    const orphan = fakeClient({ posts: [{ data: postRow(), error: null }], profiles: [{ data: null, error: null }] });
    assert.equal((await postStoryResponse(POST_ID, orphan.client, viewer())).status, 404);
  });

  it("only reads posts, profiles, public cards and replies; never DMs", async () => {
    const { client, calls, selects } = cardPostClient();
    await readPostStory(client, POST_ID);
    assert.deepEqual([...new Set(calls)].sort(), ["comments", "posts", "profiles", "public_cards"]);
    for (const select of selects) assert.doesNotMatch(select, /paid|show_paid|notes|cert|email/);
  });
});

describe("post Story privacy", () => {
  it("never carries the paid price when show_paid is off", async () => {
    const { client } = cardPostClient({
      show_paid: false,
      post_type: "mail_day",
      meta: { paid: 4321, cards: [{ id: CARD_ID, paid: 4321, paidPrice: 4321 }] },
    });
    const read = await readPostStory(client, POST_ID);
    assert.ok(read);
    const drawn = JSON.stringify(read.model);
    assert.doesNotMatch(drawn, /4321|4,321/);
    assert.ok(read.model.cardLines.every((line) => line.value === ""), "no value line either");
  });

  it("puts the invite code in the link only for the author", async () => {
    const own = viewer({ id: async () => AUTHOR });
    const read = await readPostStory(cardPostClient().client, POST_ID);
    assert.ok(read);
    assert.equal(read.model.story?.link, "slabhold.app/i/ada_cards");
    assert.equal(withInviteCode(read, AUTHOR, CODE).story?.link, `slabhold.app/i/ada_cards?c=${CODE}`);
    assert.equal(withInviteCode(read, OTHER, CODE).story?.link, "slabhold.app/i/ada_cards");
    assert.equal(withInviteCode(read, null, CODE).story?.link, "slabhold.app/i/ada_cards");

    // The route only asks for a code when the viewer is the author.
    const other = viewer({ id: async () => OTHER });
    assert.equal((await postStoryResponse(POST_ID, cardPostClient().client, other)).status, 200);
    assert.deepEqual(other.asked, []);
    assert.equal((await postStoryResponse(POST_ID, cardPostClient().client, own)).status, 200);
    assert.deepEqual(own.asked, ["code"]);
  });

  it("draws the like and reply counts it read", async () => {
    const read = await readPostStory(cardPostClient().client, POST_ID);
    assert.equal(read?.model.story?.likes, 1284);
    assert.equal(read?.model.story?.replies, 37);
    assert.equal(read?.model.story?.hasText, true);
    assert.equal(storyCount(1284), "1,284");
    assert.equal(storyCount(12_345), "12.3K");
    assert.equal(storyCount(0), "");
    assert.equal(storyCount(null), "");
  });

  it("links and names the image from the post and author", () => {
    assert.equal(postStoryPath(POST_ID), `/api/share-image/post/${POST_ID}`);
    assert.equal(postStoryFilename("@Ada_Cards"), "slabhold-ada_cards-post.png");
    assert.equal(postStoryLink("ada_cards"), "slabhold.app/i/ada_cards");
    assert.equal(postStoryLink("ada_cards", "not-a-code"), "slabhold.app/i/ada_cards");
  });
});

describe("Share to Story menu item", () => {
  const render = (post: { id: string; hiddenAt: string | null }) =>
    renderToStaticMarkup(createElement(ShareToStoryItem, { post, username: "ada_cards", onDone: () => {} }));

  it("renders for a visible post", () => {
    assert.equal(canShareStory({ id: POST_ID, hiddenAt: null }), true);
    const html = render({ id: POST_ID, hiddenAt: null });
    assert.match(html, /role="menuitem"/);
    assert.match(html, />Share to Story</);
  });

  it("does not render for a hidden or unsaved post", () => {
    assert.equal(render({ id: POST_ID, hiddenAt: "2026-11-20T00:00:00Z" }), "");
    assert.equal(render({ id: "local-post-1", hiddenAt: null }), "");
  });

  it("sits in the post's ⋯ menu for the author and for everyone else", () => {
    const tweet = readFileSync(join(process.cwd(), "components/tweet.tsx"), "utf8");
    assert.match(tweet, /<ShareToStoryItem post=\{post\} username=\{user\.username\} onDone=\{close\} \/>/);
    assert.match(tweet, /extraItem=\{\(done\) => <ShareToStoryItem post=\{post\} username=\{author\.username\} onDone=\{done\} \/>\}/);
    const route = readFileSync(join(process.cwd(), "app/api/share-image/post/[id]/route.tsx"), "utf8");
    assert.match(route, /postStoryResponse\(id, createAnonReader\(\)/);
    assert.match(route, /fetchInviteCode\(session\)/);
  });
});
