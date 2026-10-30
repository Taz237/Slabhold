import "@/lib/test/server-only-stub";
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, createElement, useContext, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { installDom } from "@/lib/test/dom";
import { CollectionContext } from "@/components/collection-provider";
import { SocialContext, type SocialContextValue } from "@/components/social-provider";
import { SeededSocial, seededSocialValue } from "@/components/social-seed";
import { SeededViewer } from "@/components/viewer-seed";
import type { HomeSeed } from "@/lib/social/home-seed";
import type { Post, Profile } from "@/lib/social/types";
import type { SportsCard } from "@/lib/types";
import { useProgressiveRows } from "@/lib/ui/use-progressive-rows";

installDom();

let root: Root | null = null;
let host: HTMLElement;

beforeEach(() => {
  if (root) act(() => root!.unmount());
  document.body.innerHTML = "";
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

const viewer: Profile = {
  id: "v1",
  email: "ada@example.com",
  username: "ada",
  displayName: "Ada",
  bio: "",
  avatarDataUrl: null,
  coverDataUrl: null,
  accent: "#7C3AED",
  createdAt: "2025-01-01T00:00:00.000Z",
};
const author: Profile = { ...viewer, id: "a1", email: "", username: "maya", displayName: "Maya" };

function post(id: string, partial: Partial<Post> = {}): Post {
  return {
    id,
    authorId: author.id,
    body: "Pulled a 10",
    imageDataUrl: null,
    card: null,
    quotedPostId: null,
    createdAt: "2026-10-29T12:00:00.000Z",
    ...partial,
  };
}

function seed(): HomeSeed {
  const liked = post("p1", { likeCount: 7, viewerLiked: true });
  const plain = post("p2", { likeCount: 2 });
  return {
    viewer,
    lane: "foryou",
    follows: [{ followerId: viewer.id, followingId: author.id, createdAt: "2026-01-01T00:00:00.000Z" }],
    blockedIds: [],
    mutedIds: [],
    page: {
      items: [liked, plain].map((item) => ({ key: `post:${item.id}`, post: item, at: item.createdAt, repostedBy: null })),
      posts: [liked, plain],
      relatedPosts: [],
      profiles: [author],
      hasMore: true,
      nextCursor: null,
      likes: [{ postId: "p2", userId: "someone", createdAt: "2026-10-29T12:00:00.000Z" }],
      readAt: Date.now(),
    },
    profiles: [viewer, author],
    comments: [
      { id: "c2", postId: "p1", authorId: author.id, body: "second", createdAt: "2026-10-29T12:02:00.000Z" },
      { id: "c1", postId: "p1", authorId: author.id, body: "first", createdAt: "2026-10-29T12:01:00.000Z" },
    ],
    reposts: [{ postId: "p2", userId: viewer.id, createdAt: "2026-10-29T12:03:00.000Z" }],
    suggestions: [],
  };
}

/** The provider before its snapshot: not ready, nobody known, and one action we can watch. */
function outerValue(partial: Partial<SocialContextValue> = {}): SocialContextValue {
  return {
    ready: false,
    hasFullSnapshot: false,
    mode: "local",
    user: null,
    profiles: [],
    posts: [],
    removedPostIds: new Set<string>(),
    toggleLike: () => {},
    ...partial,
  } as unknown as SocialContextValue;
}

function Probe({ onValue }: { onValue: (value: SocialContextValue) => void }) {
  const value = useContext(SocialContext);
  if (value) onValue(value);
  return createElement("span", { "data-probe": "" }, value?.user?.username ?? "nobody");
}

describe("seeded social state", () => {
  it("answers the first screen's reads the way the snapshot does", () => {
    const value = seededSocialValue(outerValue(), seed());
    assert.equal(value.ready, true);
    assert.equal(value.hasFullSnapshot, false);
    assert.equal(value.mode, "supabase");
    assert.equal(value.user?.id, viewer.id);
    assert.equal(value.isLiked("p1"), true);
    assert.equal(value.isLiked("p2"), false);
    assert.equal(value.likeCount("p1"), 7);
    assert.equal(value.likeCount("p2"), 2);
    assert.deepEqual(value.commentsFor("p1").map((comment) => comment.id), ["c1", "c2"]);
    assert.equal(value.repostCount("p2"), 1);
    assert.equal(value.isReposted("p2"), true);
    assert.equal(value.isFollowing(author.id), true);
    assert.equal(value.followingCount(viewer.id), 1);
    assert.equal(value.findPost("p1")?.id, "p1");
    // The provider's own actions still answer.
    assert.equal(typeof value.toggleLike, "function");
  });

  it("draws the seed inert until the provider is ready, then hands over for good", () => {
    let seen: SocialContextValue | null = null;
    const homeSeed = seed();
    const tree = (outer: SocialContextValue) =>
      createElement(
        SocialContext.Provider,
        { value: outer },
        createElement(SeededSocial, { seed: homeSeed }, createElement(Probe, { onValue: (value) => (seen = value) })),
      );
    const html = renderToString(tree(outerValue()));
    assert.match(html, /data-seeded-viewer=""/);
    assert.match(html, /inert=""/);
    assert.match(html, />ada</);

    act(() => root!.render(tree(outerValue())));
    assert.equal(host.querySelector("[data-seeded-viewer]")?.hasAttribute("inert"), true);
    assert.equal(seen!.user?.id, viewer.id);

    // Unrelated provider updates don't redraw the seeded rows: the value stays the same object.
    const before = seen;
    act(() => root!.render(tree(outerValue({ mode: "supabase" }))));
    assert.equal(seen, before);

    const ready = outerValue({ ready: true, mode: "supabase", user: { ...viewer, email: "live@example.com" } });
    act(() => root!.render(tree(ready)));
    assert.equal(seen, ready);
    assert.equal(host.querySelector("[data-seeded-viewer]"), null);
    assert.equal(host.querySelector("[inert]"), null);

    // A later reload (ready goes false again) never brings the old seed back.
    const reloading = outerValue({ ready: false, mode: "supabase" });
    act(() => root!.render(tree(reloading)));
    assert.equal(seen, reloading);
  });

  it("forwards an action to the live provider while seeded", () => {
    const liked: string[] = [];
    let seen: SocialContextValue | null = null;
    const tree = (outer: SocialContextValue) =>
      createElement(
        SocialContext.Provider,
        { value: outer },
        createElement(SeededSocial, { seed: seed() }, createElement(Probe, { onValue: (value) => (seen = value) })),
      );
    act(() => root!.render(tree(outerValue())));
    act(() => root!.render(tree(outerValue({ toggleLike: (id: string) => void liked.push(id) }))));
    seen!.toggleLike("p1");
    assert.deepEqual(liked, ["p1"]);
  });
});

describe("seeded viewer (Collection and a card page)", () => {
  const card = { id: "card-1", playerName: "Victor Wembanyama" } as SportsCard;

  function CardsProbe() {
    const collection = useContext(CollectionContext);
    const social = useContext(SocialContext);
    return createElement(
      "span",
      { "data-probe": "" },
      `${collection?.ready ? "ready" : "loading"}:${collection?.cards.length}:${collection?.getCard("card-1")?.playerName ?? "-"}:${social?.user?.username ?? "nobody"}`,
    );
  }

  function tree(social: SocialContextValue, collection: { ready: boolean; cards: SportsCard[] }, children: ReactNode = createElement(CardsProbe)) {
    return createElement(
      SocialContext.Provider,
      { value: social },
      createElement(
        CollectionContext.Provider,
        {
          value: {
            ...collection,
            syncError: null,
            getCard: (id: string) => collection.cards.find((item) => item.id === id),
          } as never,
        },
        createElement(SeededViewer, { seed: { viewer, cards: [card] } }, children),
      ),
    );
  }

  it("draws the server's cards and viewer until both providers have their own", () => {
    const html = renderToString(tree(outerValue(), { ready: false, cards: [] }));
    assert.match(html, /ready:1:Victor Wembanyama:ada/);
    assert.match(html, /data-seeded-viewer=""/);

    act(() => root!.render(tree(outerValue(), { ready: false, cards: [] })));
    assert.equal(host.textContent, "ready:1:Victor Wembanyama:ada");
    // The social snapshot alone isn't enough: the collection is still loading.
    act(() => root!.render(tree(outerValue({ ready: true, user: viewer }), { ready: false, cards: [] })));
    assert.equal(host.textContent, "ready:1:Victor Wembanyama:ada");
    assert.ok(host.querySelector("[inert]"));

    act(() => root!.render(tree(outerValue({ ready: true, user: viewer }), { ready: true, cards: [card, { ...card, id: "card-2" }] })));
    assert.equal(host.textContent, "ready:2:Victor Wembanyama:ada");
    assert.equal(host.querySelector("[inert]"), null);
    assert.equal(host.querySelector("[data-seeded-viewer]"), null);
  });

  it("is a plain pass-through without a seed", () => {
    const social = outerValue();
    act(() =>
      root!.render(
        createElement(
          SocialContext.Provider,
          { value: social },
          createElement(
            CollectionContext.Provider,
            { value: { ready: false, cards: [], syncError: null, getCard: () => undefined } as never },
            createElement(SeededViewer, { seed: null }, createElement(CardsProbe)),
          ),
        ),
      ),
    );
    assert.equal(host.textContent, "loading:0:-:nobody");
    assert.equal(host.querySelector("[inert]"), null);
  });
});

describe("progressive rows", () => {
  function List({ total, enabled, hold = false }: { total: number; enabled: boolean; hold?: boolean }) {
    const rows = useProgressiveRows(total, { enabled, step: 3, hold });
    return createElement("span", null, String(Math.min(rows, total)));
  }

  it("draws every row at once unless the screen was server-drawn", () => {
    act(() => root!.render(createElement(List, { total: 10, enabled: false })));
    assert.equal(host.textContent, "10");
  });

  it("starts a server-drawn list at one step and holds it there while asked", () => {
    act(() => root!.render(createElement(List, { total: 10, enabled: true, hold: true })));
    assert.equal(host.textContent, "3");
  });
});

describe("server-drawn signed-in screens", () => {
  it("renders Home per request and never caches a viewer's first screen", () => {
    const home = read("app/(app)/page.tsx");
    assert.doesNotMatch(home, /export const revalidate|use cache|force-static|unstable_cache/);
    assert.match(home, /<Suspense fallback=\{<HomeGate landing=\{null\} movers=\{payload\} \/>\}>/);
    assert.match(home, /const seed = await requestHomeSeed\(\);/);
    // A visit from inside the app skips the server reads.
    assert.match(home, /if \(await isRouterRequest\(\)\)/);
    const viewerRead = read("lib/supabase/request-viewer.ts");
    assert.match(viewerRead, /supabase\.auth\.getUser\(\)/);
    assert.doesNotMatch(viewerRead, /getSession\(\)/);
  });

  it("streams Collection from the viewer's own reads and keeps today's snapshot save", () => {
    const page = read("app/(app)/collection/page.tsx");
    assert.doesNotMatch(page, /export const revalidate|use cache|force-static/);
    assert.match(page, /<Suspense fallback=\{<Dashboard \/>\}>/);
    assert.match(page, /loadCollectionSeed\(viewer\)/);
    assert.match(page, /upsertTodaysCollectionSnapshot\(userId\)/);
    const seedLoad = read("lib/collection/load-viewer-seed.ts");
    // Card values go through the same rate limit and owner/public filter as /api/card-values.
    assert.match(seedLoad, /consumeCardValueLimit\(userId\)/);
    assert.match(seedLoad, /lookupAllowedIds\(batch, userId\)/);
    const route = read("app/api/card-values/route.ts");
    assert.match(route, /readCardValues\(allowedIds, userId\)/);
    assert.match(route, /await lookupAllowedIds\(parsed\.ids, userId\)/);
  });

  it("checks card access alongside the card page's other reads", () => {
    const page = read("app/(app)/cards/[id]/page.tsx");
    assert.match(page, /await Promise\.all\(\[\s*requireCardPageAccess\(id, cardPageAccessWith\(\(\) => userIdTask\)\),\s*searchParams,/);
    assert.match(page, /<SeededViewer seed=\{seed\}>\s*<CardDetail/);
  });

  it("shows the signed-in shell before the snapshot only around a server-drawn page", () => {
    const shell = read("components/app-shell.tsx");
    assert.match(shell, /getSupabaseConfig\(\)\.configured && seedsViewer\(pathname\)/);
    assert.match(shell, /data-pending-shell=\{pending \? "" : undefined\}/);
    const css = read("app/globals.css");
    assert.match(css, /\[data-pending-shell\]:not\(:has\(\[data-seeded-viewer\]\)\) \{\s*display: none;/);
  });
});
