import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { missingCheckForPath, pathIsMissing, readSupabaseAccessToken } from "./missing-route";

const URL = "https://example.supabase.co";
const KEY = "anon-key";
const CARD = "ba95893e-89fe-4735-be3f-1509b6b6f3b9";

function json(rows: unknown[], status = 200): Response {
  return new Response(JSON.stringify(rows), { status });
}

describe("missingCheckForPath", () => {
  it("matches card, post, and profile pages and skips everything else", () => {
    assert.deepEqual(missingCheckForPath(`/posts/${CARD}`), { kind: "post", id: CARD });
    assert.deepEqual(missingCheckForPath("/u/Maya"), { kind: "profile", username: "Maya" });
    assert.deepEqual(missingCheckForPath("/u/maya/followers"), { kind: "profile", username: "maya" });
    assert.deepEqual(missingCheckForPath(`/u/maya/cards/${CARD}`), {
      kind: "public-card",
      username: "maya",
      id: CARD,
    });
    assert.deepEqual(missingCheckForPath(`/cards/${CARD}/edit`), { kind: "owner-card", id: CARD });
    assert.equal(missingCheckForPath("/cards/new"), null);
    assert.equal(missingCheckForPath(`/posts/${CARD}/opengraph-image`), null);
    assert.equal(missingCheckForPath("/"), null);
  });
});

describe("pathIsMissing", () => {
  it("404s a confirmed miss and leaves local mode and lookup errors alone", async () => {
    assert.equal(
      await pathIsMissing({ pathname: `/posts/${CARD}`, supabaseUrl: "", anonKey: KEY, cookies: [] }),
      false,
    );

    const missingPost = await pathIsMissing({
      pathname: `/posts/${CARD}`,
      supabaseUrl: URL,
      anonKey: KEY,
      cookies: [],
      fetchImpl: async () => json([]),
    });
    assert.equal(missingPost, true);

    const foundPost = await pathIsMissing({
      pathname: `/posts/${CARD}`,
      supabaseUrl: URL,
      anonKey: KEY,
      cookies: [],
      fetchImpl: async () => json([{ id: CARD }]),
    });
    assert.equal(foundPost, false);

    const outage = await pathIsMissing({
      pathname: `/posts/${CARD}`,
      supabaseUrl: URL,
      anonKey: KEY,
      cookies: [],
      fetchImpl: async () => json([], 500),
    });
    assert.equal(outage, false);

    assert.equal(
      await pathIsMissing({
        pathname: "/posts/post-maya-1",
        supabaseUrl: URL,
        anonKey: KEY,
        cookies: [],
      }),
      true,
    );

    assert.equal(
      await pathIsMissing({
        pathname: "/u/nope!",
        supabaseUrl: URL,
        anonKey: KEY,
        cookies: [],
      }),
      true,
    );

    assert.equal(
      await pathIsMissing({
        pathname: `/cards/${CARD}`,
        supabaseUrl: URL,
        anonKey: KEY,
        cookies: [],
      }),
      true,
    );
  });

  it("keeps an owner card when the session token can see it", async () => {
    const token = Buffer.from(JSON.stringify({ access_token: "owner-token" }), "utf8").toString("base64url");
    const cookies = [{ name: "sb-example-auth-token", value: `base64-${token}` }];
    assert.deepEqual(readSupabaseAccessToken({ supabaseUrl: URL, cookies }), { token: "owner-token" });

    let auth = "";
    const found = await pathIsMissing({
      pathname: `/cards/${CARD}`,
      supabaseUrl: URL,
      anonKey: KEY,
      cookies,
      fetchImpl: async (_input, init) => {
        auth = new Headers(init?.headers).get("authorization") ?? "";
        return json([{ id: CARD }]);
      },
    });
    assert.equal(found, false);
    assert.equal(auth, "Bearer owner-token");
  });
});
