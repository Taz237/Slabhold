import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { before, describe, it, mock } from "node:test";
import { createServerClient } from "@supabase/ssr";
import { PRIVATE_OG_CACHE_CONTROL } from "../../components/og-frame";
import { postShareImage, type ShareImage } from "./share-image";

const nodeRequire = createRequire(import.meta.url);
const serverOnlyEmpty = pathToFileURL(
  nodeRequire.resolve("server-only").replace(/index\.js$/, "empty.js"),
).href;

const headersMock = join(tmpdir(), "slabhold-next-headers-mock.mjs");
writeFileSync(
  headersMock,
  `export async function cookies() {
  return {
    getAll() {
      return globalThis.__slabholdAuthorCookies ?? [];
    },
    set() {},
  };
}
export async function headers() {
  return new Headers();
}
`,
);

type ResolveHook = (
  specifier: string,
  context: object,
  nextResolve: (specifier: string, context: object) => { url: string },
) => { url: string; shortCircuit?: boolean };

const registerHooks = (
  nodeRequire("node:module") as { registerHooks?: (hooks: { resolve: ResolveHook }) => void }
).registerHooks;

if (!registerHooks) {
  throw new Error("node:module registerHooks is required to import server-only modules in tests");
}

const hookFlag = "__slabholdShareImageTestHook";
if (!(globalThis as Record<string, unknown>)[hookFlag]) {
  (globalThis as Record<string, unknown>)[hookFlag] = true;
  registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier === "server-only") {
        return { url: serverOnlyEmpty, shortCircuit: true };
      }
      if (specifier === "next/headers") {
        return { url: pathToFileURL(headersMock).href, shortCircuit: true };
      }
      return nextResolve(specifier, context);
    },
  });
}

const SUPABASE_URL = "https://example.supabase.co";
const ANON_KEY = "anon-key";
const POST = "ba95893e-89fe-4735-be3f-1509b6b6f3b9";
const AUTHOR = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const AUTHOR_TOKEN = "author-access-token";
const HIDDEN = "SECRET HIDDEN POST";

process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_URL;
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = ANON_KEY;

const authorSession = Buffer.from(
  JSON.stringify({
    access_token: AUTHOR_TOKEN,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: "refresh-token",
    user: { id: AUTHOR, aud: "authenticated", role: "authenticated" },
  }),
  "utf8",
).toString("base64url");

(globalThis as { __slabholdAuthorCookies?: { name: string; value: string }[] }).__slabholdAuthorCookies =
  [{ name: "sb-example-auth-token", value: `base64-${authorSession}` }];

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function requestAuth(input: RequestInfo | URL, init?: RequestInit): string {
  const headers = new Headers(init?.headers);
  if (!headers.has("authorization") && typeof Request !== "undefined" && input instanceof Request) {
    return input.headers.get("authorization") ?? "";
  }
  return headers.get("authorization") ?? "";
}

let loadPostShareImage: (id: string) => Promise<ShareImage>;
let sharePriceText: (
  value: {
    status: "ok";
    median: number | null;
    low: number | null;
    high: number | null;
    nSales: number;
    matchedAt: string | null;
    sales?: { price: number; soldAt?: string | null }[];
  } | null,
  createdAt?: string | null,
) => string;

before(async () => {
  const loaded = await import("./link-preview-load");
  loadPostShareImage = loaded.loadPostShareImage;
  sharePriceText = loaded.sharePriceText;
});

const STORED_BAND = {
  status: "ok" as const,
  median: 55.5,
  low: 43.25,
  high: 67.75,
  nSales: 2,
  matchedAt: null,
};

describe("public share price labels", () => {
  it("uses the two real sales instead of the stored p25-p75 band", () => {
    assert.equal(
      sharePriceText({
        ...STORED_BAND,
        sales: [
          { price: 31, soldAt: null },
          { price: 80, soldAt: null },
        ],
      }),
      "$31.00\u2013$80.00 from 2 sales",
    );
  });

  it("labels one loaded sale as last sold", () => {
    assert.equal(
      sharePriceText({
        status: "ok",
        median: 40,
        low: 43.25,
        high: 67.75,
        nSales: 1,
        matchedAt: null,
        sales: [{ price: 31, soldAt: "2026-10-02T00:00:00.000Z" }],
      }),
      "Last sold $31.00 on Oct 2",
    );
  });

  it("uses the median when the sale list did not load", () => {
    const text = sharePriceText(STORED_BAND);
    assert.equal(text, "~$55.50 from 2 sales");
    assert.equal(text.includes("43.25"), false);
    assert.equal(text.includes("67.75"), false);
  });
});

describe("share image loaders", () => {
  it("reads with the anon client except the own-profile image", () => {
    const source = read("lib/social/link-preview-load.ts");
    const ownStart = source.indexOf("export const loadOwnProfilePreview");
    const ownEnd = source.indexOf("function snapshotCardId");
    assert.ok(ownStart > 0 && ownEnd > ownStart);
    const own = source.slice(ownStart, ownEnd);
    const rest = source.slice(0, ownStart) + source.slice(ownEnd);
    assert.match(own, /createSupabaseServer/);
    assert.match(own, /getAuthUserId/);
    assert.doesNotMatch(rest, /createSupabaseServer\(/);
    assert.doesNotMatch(rest, /getAuthUserId\(/);
    assert.match(source, /persistSession:\s*false/);
    const attaches = [...source.matchAll(/attachPriceContext\(([^)]*)\)/g)];
    assert.equal(attaches.length, 2);
    for (const call of attaches) assert.match(call[1] ?? "", /\bnull\b/);
    assert.match(source, /valueAmount: isPublic \? price\.amount : null/);
    assert.match(source, /valueLabel: null/);

    const ownProfile = read("app/profile/opengraph-image.tsx");
    assert.match(ownProfile, /loadOwnProfilePreview/);
    assert.match(ownProfile, /PRIVATE_OG_CACHE_CONTROL/);
    assert.equal(PRIVATE_OG_CACHE_CONTROL, "private, no-store");
  });

  it("renders a hidden post share image as not-found even with the author's cookies", async () => {
    const hiddenRow = {
      content: HIDDEN,
      image_url: null,
      card: null,
      user_id: AUTHOR,
      post_type: "post",
      meta: null,
    };
    const authorizations: string[] = [];
    const fetchMock = mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);
      const authorization = requestAuth(input, init);
      if (url.includes("/rest/v1/posts")) authorizations.push(authorization);
      const body =
        url.includes("/rest/v1/posts") && authorization === `Bearer ${AUTHOR_TOKEN}`
          ? [hiddenRow]
          : [];
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    try {
      const author = createServerClient(SUPABASE_URL, ANON_KEY, {
        cookies: {
          getAll: () =>
            (globalThis as { __slabholdAuthorCookies?: { name: string; value: string }[] })
              .__slabholdAuthorCookies ?? [],
          setAll() {},
        },
      });
      const seen = await author
        .from("posts")
        .select("content, image_url, card, user_id, post_type, meta")
        .eq("id", POST)
        .maybeSingle();
      assert.equal(seen.data?.content, HIDDEN);

      authorizations.length = 0;
      const image = await loadPostShareImage(POST);
      assert.deepEqual(image, postShareImage({ found: false }));
      assert.equal(JSON.stringify(image).includes(HIDDEN), false);
      assert.equal(authorizations.length > 0, true);
      assert.equal(authorizations.every((header) => header === `Bearer ${ANON_KEY}`), true);
    } finally {
      fetchMock.mock.restore();
    }
  });
});
