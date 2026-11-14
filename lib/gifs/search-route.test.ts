import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { cleanGifOffset, cleanGifQuery, GIF_PAGE_SIZE, searchGiphy, type GifPage } from "./giphy";
import { getGifSearch, GIF_RATE_LIMIT_MESSAGE, GIF_SEARCH_FAILED, GIFS_NOT_SET_UP, type GifSearchDeps } from "./search-route";

const KEY = "test-key-not-real";
const GIF = {
  id: "abc123",
  mp4: "https://media2.giphy.com/media/abc123/200w.mp4",
  still: "https://media2.giphy.com/media/abc123/200w_s.gif",
  width: 200,
  height: 113,
};

function deps(over: Partial<GifSearchDeps> = {}) {
  const calls: { query: string; offset: number }[] = [];
  const logs: string[] = [];
  const base: GifSearchDeps = {
    getUserId: async () => "user-1",
    apiKey: KEY,
    consumeLimit: async () => true,
    consumeGlobal: () => true,
    async search(input) {
      calls.push({ query: input.query, offset: input.offset });
      return { gifs: [GIF], nextOffset: null } satisfies GifPage;
    },
    cache: new Map(),
    now: () => 1_000_000,
    log: (line) => logs.push(line),
    ...over,
  };
  return { deps: base, calls, logs };
}

const get = (query = "") => new Request(`http://localhost/api/gifs/search${query}`);

describe("GET /api/gifs/search", () => {
  it("needs a signed-in account", async () => {
    const { deps: d, calls } = deps({ getUserId: async () => null });
    const response = await getGifSearch(get("?q=rookie"), d);
    assert.equal(response.status, 401);
    assert.equal(calls.length, 0);
  });

  it("says GIFs are not set up when the key is missing, without calling GIPHY", async () => {
    const { deps: d, calls } = deps({ apiKey: "" });
    const response = await getGifSearch(get("?q=rookie"), d);
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error, GIFS_NOT_SET_UP);
    assert.equal(calls.length, 0);
  });

  it("returns GIFs for a search and never the key", async () => {
    const { deps: d, calls } = deps();
    const response = await getGifSearch(get("?q=%20big%20%20pull%20&offset=24"), d);
    assert.equal(response.status, 200);
    const text = await response.text();
    assert.deepEqual(JSON.parse(text), { gifs: [GIF], nextOffset: null });
    assert.deepEqual(calls, [{ query: "big pull", offset: 24 }]);
    assert.ok(!text.includes(KEY));
    assert.match(response.headers.get("Cache-Control") ?? "", /^private/);
  });

  it("stops an account that searches too fast, with Retry-After", async () => {
    const { deps: d, calls } = deps({ consumeLimit: async () => false });
    const response = await getGifSearch(get("?q=rookie"), d);
    assert.equal(response.status, 429);
    assert.equal((await response.json()).error, GIF_RATE_LIMIT_MESSAGE);
    assert.ok(Number(response.headers.get("Retry-After")) >= 1);
    assert.equal(calls.length, 0);
  });

  it("stops calling GIPHY when this server has made too many calls", async () => {
    const { deps: d, calls } = deps({ consumeGlobal: () => false });
    const response = await getGifSearch(get("?q=rookie"), d);
    assert.equal(response.status, 429);
    assert.equal(calls.length, 0);
  });

  it("answers a repeated search from the cache, and still counts it against the account", async () => {
    let used = 0;
    const { deps: d, calls } = deps({
      consumeLimit: async () => {
        used += 1;
        return true;
      },
    });
    await getGifSearch(get("?q=Rookie"), d);
    const again = await getGifSearch(get("?q=rookie"), d);
    assert.equal(again.status, 200);
    assert.equal(calls.length, 1, "GIPHY was called once");
    assert.equal(used, 2);
  });

  it("reports a GIPHY failure plainly and keeps the key out of the log", async () => {
    const { deps: d, logs } = deps({
      async search() {
        throw new Error("GIPHY answered 500");
      },
    });
    const response = await getGifSearch(get("?q=rookie"), d);
    assert.equal(response.status, 502);
    assert.equal((await response.json()).error, GIF_SEARCH_FAILED);
    assert.equal(logs.length, 1);
    assert.ok(!logs[0]!.includes(KEY));
  });

  it("cleans the search words and the offset", () => {
    assert.equal(cleanGifQuery("  big \n pull  "), "big pull");
    assert.equal(cleanGifQuery("x".repeat(80)).length, 50);
    assert.equal(cleanGifQuery(null), "");
    assert.equal(cleanGifOffset("24"), 24);
    assert.equal(cleanGifOffset("30"), 24);
    assert.equal(cleanGifOffset("-5"), 0);
    assert.equal(cleanGifOffset("999999"), 0);
    assert.equal(cleanGifOffset("9999"), 480);
  });
});

describe("searchGiphy", () => {
  function fakeFetch(body: unknown, status = 200) {
    const urls: string[] = [];
    const fetcher = (async (url: string | URL | Request) => {
      urls.push(String(url));
      return new Response(JSON.stringify(body), { status });
    }) as typeof fetch;
    return { fetcher, urls };
  }
  const item = (id: string) => ({
    id,
    title: id,
    images: {
      fixed_width: { mp4: `https://media2.giphy.com/media/${id}/200w.mp4`, width: "200", height: "113" },
      fixed_width_still: { url: `https://media2.giphy.com/media/${id}/200w_s.gif` },
    },
  });

  it("searches with a PG rating, and shows trending when there are no words", async () => {
    const { fetcher, urls } = fakeFetch({ data: [item("a1"), item("a1"), { id: "bad" }], pagination: { total_count: 2 } });
    const page = await searchGiphy({ apiKey: KEY, query: "big pull", offset: 0, fetch: fetcher });
    assert.deepEqual(page.gifs.map((gif) => gif.id), ["a1"], "duplicates and unusable results are dropped");
    assert.equal(page.nextOffset, null);
    const url = new URL(urls[0]!);
    assert.equal(url.origin + url.pathname, "https://api.giphy.com/v1/gifs/search");
    assert.equal(url.searchParams.get("q"), "big pull");
    assert.equal(url.searchParams.get("rating"), "pg");
    assert.equal(url.searchParams.get("limit"), String(GIF_PAGE_SIZE));

    await searchGiphy({ apiKey: KEY, query: "", offset: 0, fetch: fetcher });
    assert.equal(new URL(urls[1]!).pathname, "/v1/gifs/trending");
  });

  it("offers a next page only when GIPHY has more", async () => {
    const data = Array.from({ length: GIF_PAGE_SIZE }, (_, index) => item(`g${index}`));
    const { fetcher } = fakeFetch({ data, pagination: { total_count: 500 } });
    const page = await searchGiphy({ apiKey: KEY, query: "x", offset: 24, fetch: fetcher });
    assert.equal(page.nextOffset, 48);
  });

  it("fails without putting the key in the error", async () => {
    const { fetcher } = fakeFetch({ message: "nope" }, 403);
    await assert.rejects(
      () => searchGiphy({ apiKey: KEY, query: "x", offset: 0, fetch: fetcher }),
      (error: Error) => !error.message.includes(KEY) && /403/.test(error.message),
    );
  });
});

describe("the GIPHY key stays on the server", () => {
  const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

  it("is read only in the API route, and never from a NEXT_PUBLIC variable", () => {
    assert.match(read("app/api/gifs/search/route.ts"), /process\.env\.GIPHY_API_KEY/);
    for (const file of [
      "components/gif-picker.tsx",
      "components/gif-picker-view.tsx",
      "components/post-gif.tsx",
      "components/compose-view.tsx",
      "components/post-view.tsx",
      "lib/social/gifs.ts",
    ]) {
      const source = read(file);
      assert.ok(!/GIPHY_API_KEY|api_key|api\.giphy\.com/.test(source), `${file} must not touch the key or GIPHY's API`);
    }
  });

  it("is rate limited per account in the route", () => {
    const route = read("app/api/gifs/search/route.ts");
    assert.match(route, /consumeRateLimit\(userId, GIF_SEARCH_BUCKET, GIF_SEARCH_WINDOW_MS, GIF_SEARCH_LIMIT\)/);
    assert.match(route, /getAuthUserId/);
  });
});
