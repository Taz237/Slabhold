import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { before, describe, it, mock } from "node:test";
import { createServerClient } from "@supabase/ssr";
import { PRIVATE_OG_CACHE_CONTROL } from "../../components/og-frame";
import { cardOgImagePath, previewMetadata, withCardOgImage } from "./link-preview";
import { cardShareImage, postShareImage, type ShareImage } from "./share-image";

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
let loadBadgeShare: (username: string, category: string, tier: string) => Promise<{ name: string; username: string } | null>;
let loadCardShareImage: (id: string) => Promise<ShareImage>;
let loadPublicCardPreview: (id: string) => Promise<{
  title: string;
  description: string;
  imageUrl: string | null;
  detail: string;
  updatedAt: string | null;
}>;
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
  loadBadgeShare = loaded.loadBadgeShare;
  loadCardShareImage = loaded.loadCardShareImage;
  loadPublicCardPreview = loaded.loadPublicCardPreview;
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
    const priced = source.slice(
      source.indexOf("async function publicCardValue"),
      source.indexOf("export function sharePriceText"),
    );
    assert.match(priced, /knownPriceCard\(/);
    assert.doesNotMatch(priced, /from\("cards"\)/);
    assert.match(source, /if \(!row\.is_public\) return cardShareImage\(\{ found: false \}\)/);
    assert.doesNotMatch(source, /private card keeps its photo and name/i);
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

  it("keeps a private or deleted card name and photo out of the share image and metadata", async () => {
    const serviceKey = "service-role-key";
    const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    process.env.SUPABASE_SERVICE_ROLE_KEY = serviceKey;
    const privateId = "11111111-1111-4111-8111-111111111111";
    const deletedId = "22222222-2222-4222-8222-222222222222";
    const publicId = "33333333-3333-4333-8333-333333333333";
    const secretName = "Zeke Secretname";
    const secretPhoto = `${SUPABASE_URL}/storage/v1/object/public/card-photos/user/secret-private.jpg`;
    const publicName = "Public Wemby";
    const publicPhoto = `${SUPABASE_URL}/storage/v1/object/public/card-photos/user/public-photo.jpg`;
    const privateRow = {
      player: secretName,
      year: 2024,
      year_label: "2024",
      set: "Prizm",
      set_name: "Prizm",
      grade: "PSA 10",
      grader: "PSA",
      parallel: "Silver",
      condition_type: "graded",
      image_url: secretPhoto,
      card_number: "136",
      sport: "Basketball",
      is_public: false,
    };
    const publicRow = {
      id: publicId,
      user_id: AUTHOR,
      player: publicName,
      year: 2023,
      year_label: "2023-24",
      set: "Prizm",
      set_name: "Prizm",
      grade: "10",
      grader: "PSA",
      parallel: "Base",
      estimated_value: 185,
      image_url: publicPhoto,
      card_number: "136",
      sport: "Basketball",
      accent: "#7c5cff",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-04-01T12:00:00.000Z",
      condition_type: "graded",
    };

    const fetchMock = mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);
      const authorization = requestAuth(input, init);
      let body: unknown = [];
      if (url.includes("/rest/v1/public_cards") && url.includes(publicId)) body = [publicRow];
      else if (
        url.includes("/rest/v1/cards") &&
        url.includes(privateId) &&
        authorization === `Bearer ${serviceKey}` &&
        url.includes("is_public")
      ) {
        body = [privateRow];
      }
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    try {
      for (const page of ["app/cards/[id]/page.tsx", "app/u/[username]/cards/[id]/page.tsx"]) {
        const source = read(page);
        assert.match(source, /withCardOgImage\(\s*previewMetadata\(preview\),\s*cardOgImagePath\(/);
        assert.doesNotMatch(source, /loadCardShareImage/);
      }
      assert.match(read("app/u/[username]/cards/[id]/page.tsx"), /cardOgImagePath\(id, preview\.updatedAt, username\)/);

      const generic = cardShareImage({ found: false });
      const privateImage = await loadCardShareImage(privateId);
      const privatePacked = JSON.stringify(privateImage);
      assert.deepEqual(privateImage, generic);
      assert.equal(privatePacked.includes(secretName), false);
      assert.equal(privatePacked.includes("secret-private"), false);
      assert.equal(privatePacked.includes("9,999"), false);

      const privatePreview = await loadPublicCardPreview(privateId);
      assert.equal(privatePreview.updatedAt, null);
      const privateMeta = withCardOgImage(
        previewMetadata(privatePreview),
        cardOgImagePath(privateId, privatePreview.updatedAt),
      );
      const privateMetaPacked = JSON.stringify({ privatePreview, privateMeta });
      assert.equal(privatePreview.title, "Private card");
      assert.equal(privatePreview.imageUrl, null);
      assert.equal(privateMeta.title, "Private card · Slabhold");
      assert.equal(privateMeta.openGraph.title, "Private card");
      assert.equal(privateMeta.twitter.title, "Private card");
      assert.match(JSON.stringify(privateMeta.openGraph.images), /\/cards\/[^"?]+\/opengraph-image\?v=0/);
      assert.match(JSON.stringify(privateMeta.twitter.images), /opengraph-image\?v=0/);
      assert.equal(privateMeta.openGraph.images?.[0]?.type, "image/png");
      assert.equal(privateMeta.twitter.images?.[0]?.alt, "Card on Slabhold");
      assert.equal(privateMetaPacked.includes(secretName), false);
      assert.equal(privateMetaPacked.includes("secret-private"), false);

      const deletedImage = await loadCardShareImage(deletedId);
      const deletedPacked = JSON.stringify(deletedImage);
      assert.deepEqual(deletedImage, generic);
      assert.equal(deletedPacked.includes(secretName), false);
      assert.equal(deletedPacked.includes("secret-private"), false);
      const deletedMeta = previewMetadata(await loadPublicCardPreview(deletedId));
      assert.equal(deletedMeta.title, "Private card · Slabhold");
      assert.equal(JSON.stringify(deletedMeta).includes(secretName), false);

      const publicImage = await loadCardShareImage(publicId);
      assert.equal(publicImage.player, publicName);
      assert.equal(publicImage.imageUrl, publicPhoto);
      const publicPreview = await loadPublicCardPreview(publicId);
      assert.equal(publicPreview.updatedAt, "2026-04-01T12:00:00.000Z");
      const publicMeta = withCardOgImage(
        previewMetadata(publicPreview),
        cardOgImagePath(publicId, publicPreview.updatedAt),
      );
      const publicPacked = JSON.stringify({ publicImage, publicPreview, publicMeta });
      assert.match(publicMeta.title, /Public Wemby/);
      assert.match(publicMeta.title, /Slabhold/);
      assert.match(String(publicMeta.openGraph.title), /Public Wemby/);
      assert.match(String(publicMeta.twitter.title), /Public Wemby/);
      assert.match(JSON.stringify(publicMeta.openGraph.images), /v=2026-04-01T12%3A00%3A00.000Z/);
      assert.match(JSON.stringify(publicMeta.twitter.images), /v=2026-04-01T12%3A00%3A00.000Z/);
      assert.equal(publicMeta.openGraph.images?.[0]?.type, "image/png");
      assert.equal(publicMeta.twitter.images?.[0]?.alt, "Card on Slabhold");
      assert.equal(publicPreview.imageUrl, publicPhoto);
      assert.equal(publicPacked.includes(secretName), false);
      assert.equal(publicPacked.includes("secret-private"), false);
    } finally {
      fetchMock.mock.restore();
      if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
    }
  });
});

describe("badge share page loader", () => {
  const OWNER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

  async function withRows<T>(
    rows: { profile: Record<string, unknown> | null; badges: Record<string, unknown>[] },
    run: () => Promise<T>,
  ): Promise<{ result: T; badgeReads: number }> {
    let badgeReads = 0;
    const fetchMock = mock.method(globalThis, "fetch", async (input: RequestInfo | URL) => {
      const url = requestUrl(input);
      let body: unknown = [];
      if (url.includes("/rest/v1/profiles")) body = rows.profile ? [rows.profile] : [];
      if (url.includes("/rest/v1/user_badges")) {
        badgeReads += 1;
        body = rows.badges;
      }
      return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    });
    try {
      return { result: await run(), badgeReads };
    } finally {
      fetchMock.mock.restore();
    }
  }

  const profile = {
    id: OWNER,
    username: "democollector",
    display_name: "Demo Collector",
    avatar_url: null,
    show_badges: true,
  };
  const gold = { category: "collector", tier: "gold", earned_at: "2026-10-20T15:00:00Z" };

  it("loads an earned badge", async () => {
    const { result } = await withRows({ profile, badges: [gold] }, () =>
      loadBadgeShare("democollector", "collector", "gold"),
    );
    assert.equal(result?.name, "Gold Collector");
    assert.equal(result?.username, "democollector");
  });

  it("404s when the badge isn't earned", async () => {
    const { result } = await withRows({ profile: { ...profile, username: "notearned" }, badges: [] }, () =>
      loadBadgeShare("notearned", "collector", "gold"),
    );
    assert.equal(result, null);
  });

  it("404s when badges are off, without reading badges", async () => {
    const { result, badgeReads } = await withRows(
      { profile: { ...profile, username: "hidden", show_badges: false }, badges: [gold] },
      () => loadBadgeShare("hidden", "collector", "gold"),
    );
    assert.equal(result, null);
    assert.equal(badgeReads, 0);
  });

  it("404s for an unknown category or tier without any reads", async () => {
    const { result, badgeReads } = await withRows({ profile, badges: [gold] }, () =>
      loadBadgeShare("democollector", "pokemon", "gold"),
    );
    assert.equal(result, null);
    assert.equal(badgeReads, 0);
  });

  it("the page and its images 404 when the loader finds nothing", () => {
    for (const path of [
      "app/u/[username]/badges/[category]/[tier]/page.tsx",
      "app/u/[username]/badges/[category]/[tier]/opengraph-image.tsx",
    ]) {
      assert.match(read(path), /if \(!view\) notFound\(\)/, path);
    }
    assert.match(read("app/api/share-image/badge/[username]/[category]/[tier]/route.tsx"), /status: 404/);
  });
});
