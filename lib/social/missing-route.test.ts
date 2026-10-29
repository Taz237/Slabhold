import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { proxy } from "../../proxy";
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
    assert.deepEqual(missingCheckForPath(`/cards/${CARD}`), { kind: "owner-card", id: CARD });
    assert.deepEqual(missingCheckForPath(`/cards/${CARD}/edit`), { kind: "owner-card", id: CARD });
    assert.deepEqual(missingCheckForPath(`/cards/${CARD}/posts`), { kind: "card-posts", id: CARD });
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

  });

  it("lets a signed-in session through on owner card pages when the row is not visible yet", async () => {
    const token = Buffer.from(JSON.stringify({ access_token: "owner-token" }), "utf8").toString("base64url");
    const cookies = [{ name: "sb-example-auth-token", value: `base64-${token}` }];
    assert.deepEqual(readSupabaseAccessToken({ supabaseUrl: URL, cookies }), { token: "owner-token" });

    for (const pathname of [`/cards/${CARD}`, `/cards/${CARD}/edit`]) {
      const missing = await pathIsMissing({
        pathname,
        supabaseUrl: URL,
        anonKey: KEY,
        cookies,
        fetchImpl: async () => json([]),
      });
      assert.equal(missing, false, pathname);
    }
  });

  it("lets a signed-out visitor through on owner card pages", async () => {
    assert.equal(
      await pathIsMissing({
        pathname: `/cards/${CARD}`,
        supabaseUrl: URL,
        anonKey: KEY,
        cookies: [],
      }),
      false,
    );
    assert.equal(
      await pathIsMissing({
        pathname: `/cards/${CARD}/edit`,
        supabaseUrl: URL,
        anonKey: KEY,
        cookies: [],
      }),
      false,
    );
  });

  it("keeps public card posts and 404s a private or missing card", async () => {
    const token = Buffer.from(JSON.stringify({ access_token: "owner-token" }), "utf8").toString("base64url");
    const cookies = [{ name: "sb-example-auth-token", value: `base64-${token}` }];

    const publicPosts = await pathIsMissing({
      pathname: `/cards/${CARD}/posts`,
      supabaseUrl: URL,
      anonKey: KEY,
      cookies: [],
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.includes("public_cards")) return json([{ id: CARD }]);
        return json([]);
      },
    });
    assert.equal(publicPosts, false);

    const signedOutPrivate = await pathIsMissing({
      pathname: `/cards/${CARD}/posts`,
      supabaseUrl: URL,
      anonKey: KEY,
      cookies: [],
      fetchImpl: async () => json([]),
    });
    assert.equal(signedOutPrivate, true);

    let ownerAuth = "";
    const ownerPrivate = await pathIsMissing({
      pathname: `/cards/${CARD}/posts`,
      supabaseUrl: URL,
      anonKey: KEY,
      cookies,
      fetchImpl: async (input, init) => {
        const url = String(input);
        if (url.includes("public_cards")) return json([]);
        ownerAuth = new Headers(init?.headers).get("authorization") ?? "";
        return json([{ id: CARD }]);
      },
    });
    assert.equal(ownerPrivate, false);
    assert.equal(ownerAuth, "Bearer owner-token");

    const stranger = await pathIsMissing({
      pathname: `/cards/${CARD}/posts`,
      supabaseUrl: URL,
      anonKey: KEY,
      cookies,
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.includes("public_cards")) return json([]);
        return json([]);
      },
    });
    assert.equal(stranger, true);

    const outage = await pathIsMissing({
      pathname: `/cards/${CARD}/posts`,
      supabaseUrl: URL,
      anonKey: KEY,
      cookies: [],
      fetchImpl: async () => json([], 500),
    });
    assert.equal(outage, false);
  });
});

describe("public card proxy check", () => {
  const OWNER = "11111111-1111-4111-8111-111111111111";
  const run = (cardRows: unknown[] | null, profileRows: unknown[] | null = [{ id: OWNER }]) => {
    const started: string[] = [];
    let settled = 0;
    let startedBeforeSettle = 0;
    const missing = pathIsMissing({
      pathname: `/u/maya/cards/${CARD}`,
      supabaseUrl: URL,
      anonKey: KEY,
      cookies: [],
      fetchImpl: async (input) => {
        const url = String(input);
        started.push(url);
        if (settled === 0) startedBeforeSettle += 1;
        await new Promise((resolve) => setTimeout(resolve, 5));
        settled += 1;
        const rows = url.includes("/profiles?") ? profileRows : cardRows;
        return rows == null ? json([], 500) : json(rows);
      },
    });
    return { missing, started, parallel: () => startedBeforeSettle };
  };

  it("404s a private card and a wrong-owner URL, and keeps the owner's public card", async () => {
    assert.equal(await run([]).missing, true, "private: no public_cards row");
    assert.equal(await run([{ id: CARD, user_id: "someone-else" }]).missing, true, "wrong owner");
    assert.equal(await run([{ id: CARD, user_id: OWNER }]).missing, false, "public");
    assert.equal(await run([{ id: CARD, user_id: OWNER }], []).missing, true, "no profile");
  });

  it("leaves lookup errors on the page", async () => {
    assert.equal(await run(null).missing, false);
    assert.equal(await run([{ id: CARD, user_id: OWNER }], null).missing, false);
  });

  it("reads the profile and the card together", async () => {
    const check = run([{ id: CARD, user_id: OWNER }]);
    await check.missing;
    assert.equal(check.started.length, 2);
    assert.equal(check.parallel(), 2, "both requests start before either returns");
    assert.ok(check.started.some((url) => url.includes(`public_cards?id=eq.${CARD}&select=user_id`)));
  });
});

describe("styled missing pages", () => {
  const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const previousKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  it("404s a missing post, profile, or public card with the app page, not raw HTML", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = URL;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = KEY;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input) => {
      const url = String(input);
      if (url.includes("/profiles?") && url.includes("username=eq.maya")) {
        return json([{ id: "owner" }]);
      }
      return json([]);
    };

    try {
      const paths = [`/posts/${CARD}`, "/u/ghost", `/u/maya/cards/${CARD}`];
      for (const pathname of paths) {
        const response = await proxy(new NextRequest(`https://slabhold.test${pathname}`));
        assert.equal(response.status, 404, pathname);
        const rewrite = response.headers.get("x-middleware-rewrite") ?? "";
        assert.match(rewrite, /\/404$/, pathname);
        const body = await response.text();
        assert.equal(body.includes("That page isn't on Slabhold."), false, pathname);
        assert.equal(body.includes("<!DOCTYPE html>"), false, pathname);
        assert.equal(response.headers.get("content-type"), null, pathname);
      }

      const rsc = await proxy(
        new NextRequest(`https://slabhold.test/posts/${CARD}`, {
          headers: { RSC: "1", Accept: "text/x-component" },
        }),
      );
      assert.equal(rsc.status, 404);
      assert.match(rsc.headers.get("x-middleware-rewrite") ?? "", /\/404$/);
      assert.equal((await rsc.text()).includes("<html"), false);
      assert.notEqual(rsc.headers.get("content-type"), "text/html; charset=utf-8");

      const notFound = readFileSync(join(process.cwd(), "app/not-found.tsx"), "utf8");
      assert.match(notFound, /className=/);
      assert.match(notFound, /href="\/"/);
      assert.match(notFound, /Page not found/);
      const proxySource = readFileSync(join(process.cwd(), "proxy.ts"), "utf8");
      assert.equal(proxySource.includes("isn't on Slabhold"), false);
      assert.match(proxySource, /NextResponse\.rewrite\(new URL\("\/404"/);
    } finally {
      globalThis.fetch = originalFetch;
      if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
      if (previousKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = previousKey;
    }
  });
});
