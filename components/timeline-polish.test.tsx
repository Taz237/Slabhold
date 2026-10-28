import "@/lib/test/server-only-stub";
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { act, createElement, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { ImageConfigContext } from "next/dist/shared/lib/image-config-context.shared-runtime";
import { imageConfigDefault } from "next/dist/shared/lib/image-config";
import nextConfig from "@/next.config";
import { installDom } from "@/lib/test/dom";
import { CollectionContext } from "@/components/collection-provider";
import { SocialContext } from "@/components/social-provider";
import { Tweet } from "@/components/tweet";
import { PostSkeleton, TimelineSkeleton } from "@/components/status";
import { FollowingEmpty } from "@/components/collector-suggestions";
import {
  LaneTabs,
  NewPostsPill,
  PostBody,
  useLaneScroll,
  useNewPostsAbove,
} from "@/components/timeline-ui";
import type { Post, Profile, PublicCard } from "@/lib/social/types";

const { state } = installDom();

let root: Root | null = null;
let host: HTMLElement;

beforeEach(() => {
  if (root) act(() => root!.unmount());
  document.body.innerHTML = "";
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  state.reducedMotion = false;
  state.scrollY = 0;
  state.scrolls.length = 0;
});

function mount(element: ReactNode) {
  act(() => root!.render(element));
}

function click(element: Element | null) {
  assert.ok(element, "element to click");
  act(() => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

const maya: Profile = {
  id: "u1",
  username: "waxroom",
  displayName: "Maya Chen",
  bio: "",
  avatarDataUrl: null,
  coverDataUrl: null,
  accent: "#7c5cff",
  createdAt: "2026-01-01T00:00:00.000Z",
} as Profile;

const sam: Profile = { ...maya, id: "u2", username: "boxbreak", displayName: "Sam Ortiz" };

function card(partial: Partial<PublicCard> = {}): PublicCard {
  return {
    id: "c1",
    playerName: "Victor Wembanyama",
    year: 2023,
    setBrand: "Prizm",
    cardNumber: "136",
    sport: "Basketball",
    photoDataUrl: null,
    accent: "#7c5cff",
    estimatedSellPrice: 0,
    ...partial,
  };
}

function post(partial: Partial<Post> = {}): Post {
  return {
    id: "p1",
    authorId: maya.id,
    body: "Wemby still feels like the hold.",
    imageDataUrl: null,
    card: null,
    quotedPostId: null,
    createdAt: new Date().toISOString(),
    ...partial,
  };
}

const router = {
  push: () => {},
  replace: () => {},
  refresh: () => {},
  prefetch: () => {},
  back: () => {},
  forward: () => {},
};

/** The parts of useSocial a feed post reads, with likes kept in state. */
function Providers({
  children,
  viewer = sam,
  suggestions = [],
}: {
  children?: ReactNode;
  viewer?: Profile | null;
  suggestions?: Profile[];
}) {
  const [likes, setLikes] = useState<Record<string, number>>({});
  const [mine, setMine] = useState<Set<string>>(new Set());
  const social = {
    user: viewer,
    profiles: [maya, sam],
    posts: [],
    publicCards: [],
    blockedIds: [],
    mutedIds: [],
    postCardValues: new Map(),
    postCardValuesLoading: false,
    commentsFor: () => [],
    findPost: () => undefined,
    profileByUsername: () => undefined,
    isLiked: (id: string) => mine.has(id),
    isReposted: () => false,
    likeCount: (id: string) => likes[id] ?? 2,
    repostCount: () => 0,
    toggleLike: (id: string) => {
      const on = !mine.has(id);
      setMine((current) => {
        const next = new Set(current);
        if (on) next.add(id);
        else next.delete(id);
        return next;
      });
      setLikes((current) => ({ ...current, [id]: (current[id] ?? 2) + (on ? 1 : -1) }));
    },
    toggleRepost: () => {},
    deletePost: async () => ({}),
    pinPost: async () => ({}),
    unpinPost: async () => ({}),
    isFollowing: () => false,
    toggleFollow: async () => ({}),
    followMany: async () => ({}),
    suggestions,
  };
  const value = new Proxy(social, {
    get(target, key) {
      if (key in target) return target[key as keyof typeof target];
      if (typeof key === "symbol" || key === "then" || key === "$$typeof") return undefined;
      // Anything else a post reads is an action it does not call here.
      return () => undefined;
    },
  });
  return createElement(
    AppRouterContext.Provider,
    { value: router as never },
    createElement(
      ImageConfigContext.Provider,
      { value: { ...imageConfigDefault, ...nextConfig.images } },
      createElement(
        SocialContext.Provider,
        { value: value as never },
        createElement(
          CollectionContext.Provider,
          { value: { cards: [], ready: true, syncError: null } as never },
          children,
        ),
      ),
    ),
  );
}

function feedPost(partial: Partial<Post> = {}) {
  return createElement(Providers, null, createElement(Tweet, { post: post(partial), author: maya }));
}

describe("1. For You / Following tabs", () => {
  function Harness({ laneTop = 300 }: { laneTop?: number }) {
    const [lane, setLane] = useState<"foryou" | "following">("foryou");
    const switchLane = useLaneScroll(lane, setLane, () => laneTop);
    return createElement(LaneTabs, { lane, onChange: switchLane });
  }

  it("marks the active tab and slides the underline", () => {
    mount(createElement(Harness));
    const tabs = [...document.querySelectorAll("[role=tab]")];
    assert.equal(tabs.length, 2);
    assert.equal(tabs[0].getAttribute("aria-selected"), "true");
    assert.equal(tabs[1].getAttribute("aria-selected"), "false");
    const underline = document.querySelector<HTMLElement>("[data-lane-underline]");
    assert.ok(underline);
    const before = underline.style.transform;

    click(tabs[1]);
    assert.equal(tabs[1].getAttribute("aria-selected"), "true");
    assert.equal(tabs[0].getAttribute("aria-selected"), "false");
    assert.notEqual(underline.style.transform, before);
    const bar = document.querySelector("[data-lane-tabs]")?.className ?? "";
    assert.match(bar, /sticky/);
    assert.match(bar, /backdrop-blur/);
  });

  it("restores each tab's scroll spot", () => {
    mount(createElement(Harness));
    const [forYou, following] = [...document.querySelectorAll("[role=tab]")];
    state.scrollY = 1400;
    click(following);
    assert.equal(state.scrollY, 300, "a new lane starts at its top");
    state.scrollY = 820;
    click(forYou);
    assert.equal(state.scrollY, 1400);
    click(following);
    assert.equal(state.scrollY, 820);
  });
});

describe("2. Like", () => {
  it("fills the heart and bumps the count right away, with a pop", () => {
    mount(feedPost());
    const like = document.querySelector<HTMLButtonElement>("button[aria-label^='Like']");
    assert.ok(like);
    assert.equal(like.getAttribute("aria-pressed"), "false");
    assert.match(like.textContent ?? "", /2/);
    click(like);
    const liked = document.querySelector<HTMLButtonElement>("button[aria-label^='Unlike']");
    assert.ok(liked);
    assert.equal(liked.getAttribute("aria-pressed"), "true");
    assert.match(liked.textContent ?? "", /3/);
    assert.match(liked.querySelector("svg")?.getAttribute("class") ?? "", /fill-current/);
    assert.ok(liked.querySelector("[data-like-pop]"), "pop animation runs");

    click(liked);
    const unliked = document.querySelector<HTMLButtonElement>("button[aria-label^='Like']");
    assert.ok(unliked);
    assert.match(unliked.textContent ?? "", /2/);
  });

  it("skips the pop under reduced motion", () => {
    state.reducedMotion = true;
    mount(feedPost());
    click(document.querySelector("button[aria-label^='Like']"));
    const liked = document.querySelector("button[aria-label^='Unlike']");
    assert.ok(liked);
    assert.match(liked.querySelector("svg")?.getAttribute("class") ?? "", /fill-current/);
    assert.equal(liked.querySelector("[data-like-pop]"), null);
    assert.doesNotMatch(liked.innerHTML, /like-pop/);
  });
});

describe("3. Long posts", () => {
  const long = Array.from({ length: 9 }, (_, i) => `Line ${i + 1} about grading.`).join("\n");

  it("collapses with Show more, which expands", () => {
    mount(createElement(PostBody, { text: long }));
    const body = document.querySelector("[data-post-body]");
    assert.match(body?.className ?? "", /line-clamp-6/);
    const more = [...document.querySelectorAll("button")].find((b) => b.textContent === "Show more");
    assert.ok(more);
    assert.equal(more.getAttribute("aria-expanded"), "false");
    click(more);
    assert.doesNotMatch(document.querySelector("[data-post-body]")?.className ?? "", /line-clamp/);
    assert.equal(
      [...document.querySelectorAll("button")].some((b) => b.textContent === "Show more"),
      false,
    );
  });

  it("does not offer Show more on a short post", () => {
    mount(createElement(PostBody, { text: "Clark Prizm comps are still sticky." }));
    assert.equal(document.querySelectorAll("button").length, 0);
    assert.doesNotMatch(document.querySelector("[data-post-body]")?.className ?? "", /line-clamp/);
  });

  it("is used for feed posts", () => {
    mount(feedPost({ body: long }));
    assert.ok([...document.querySelectorAll("button")].some((b) => b.textContent === "Show more"));
  });
});

describe("4. Card posts", () => {
  it("shows the grade pill above the card tile", () => {
    mount(feedPost({ card: card({ grade: "PSA 10", grader: "PSA", conditionType: "graded" }) }));
    const pill = document.querySelector("[data-post-pill]");
    assert.equal(pill?.textContent, "PSA 10");
    assert.ok(document.querySelector("[data-tile='c1']"), "PostCardTile renders");
  });

  it("renders no pill without a card", () => {
    mount(feedPost());
    assert.equal(document.querySelector("[data-post-pill]"), null);
    assert.equal(document.querySelector("[data-tile]"), null);
  });

  it("never says Mail Day", () => {
    mount(feedPost({ card: card({ isRookie: true }) }));
    assert.equal(document.querySelector("[data-post-pill]")?.textContent, "Rookie");
    assert.doesNotMatch(document.body.textContent ?? "", /mail day/i);
  });
});

describe("5. Loading and empty states", () => {
  it("draws a post-shaped skeleton with a 5:7 card box and shimmer", () => {
    const out = renderToStaticMarkup(createElement(PostSkeleton, { withCard: true }));
    assert.match(out, /data-post-skeleton/);
    assert.match(out, /rounded-full/);
    assert.match(out, /aspect-\[5\/7\]/);
    assert.match(out, /skeleton-shimmer/);
    const timeline = renderToStaticMarkup(createElement(TimelineSkeleton));
    assert.match(timeline, /aria-busy="true"/);
    assert.ok((timeline.match(/data-post-skeleton/g) ?? []).length >= 3);
  });

  it("shows collectors to follow on an empty Following tab", () => {
    mount(
      createElement(
        Providers,
        { suggestions: [maya] },
        createElement(FollowingEmpty, { profiles: [maya] }),
      ),
    );
    const text = document.body.textContent ?? "";
    assert.match(text, /Follow/);
    assert.match(text, /Maya Chen/);
    assert.match(text, /@waxroom/);
    assert.ok(document.querySelector("[data-snap-rail]"));
  });
});

describe("6. New posts pill", () => {
  function Harness({ keys, anchor, lane = "foryou" }: { keys: string[]; anchor: string | null; lane?: string }) {
    const { show, dismiss } = useNewPostsAbove({ lane, keys, readAnchor: () => anchor });
    return show ? createElement(NewPostsPill, { onClick: dismiss }) : null;
  }

  it("appears only when new posts land above the reader's spot", () => {
    mount(createElement(Harness, { keys: ["a", "b", "c"], anchor: "b" }));
    assert.equal(document.querySelector("[data-new-posts]"), null);
    mount(createElement(Harness, { keys: ["a", "b", "c", "d"], anchor: "b" }));
    assert.equal(document.querySelector("[data-new-posts]"), null, "load more is not new");
    mount(createElement(Harness, { keys: ["n", "a", "b", "c", "d"], anchor: "b" }));
    assert.ok(document.querySelector("[data-new-posts]"));
  });

  it("stays hidden at the top of the feed and across a tab switch", () => {
    mount(createElement(Harness, { keys: ["a", "b"], anchor: null }));
    mount(createElement(Harness, { keys: ["n", "a", "b"], anchor: null }));
    assert.equal(document.querySelector("[data-new-posts]"), null);
    mount(createElement(Harness, { keys: ["x", "a"], anchor: "a", lane: "following" }));
    assert.equal(document.querySelector("[data-new-posts]"), null);
  });

  it("scrolls to the top when tapped", () => {
    mount(createElement(Harness, { keys: ["a", "b"], anchor: "b" }));
    mount(createElement(Harness, { keys: ["n", "a", "b"], anchor: "b" }));
    state.scrollY = 2000;
    const pill = document.querySelector("[data-new-posts]");
    assert.match(pill?.textContent ?? "", /New posts/);
    click(pill);
    assert.equal(state.scrollY, 0);
    assert.equal(document.querySelector("[data-new-posts]"), null);
  });
});

describe("7. Engagement bar", () => {
  it("gives every action a 44px tap target", () => {
    mount(feedPost());
    const bar = document.querySelector("[data-engagement]");
    assert.ok(bar);
    const buttons = [...bar.querySelectorAll("button")];
    assert.ok(buttons.length >= 4);
    for (const button of buttons) {
      assert.match(button.className, /min-h-11/, button.getAttribute("aria-label") ?? "");
    }
  });

  it("fits 390px: the row shrinks instead of overflowing", () => {
    mount(feedPost({ card: card({ grade: "PSA 10", grader: "PSA" }) }));
    const bar = document.querySelector("[data-engagement]");
    assert.ok(bar);
    assert.doesNotMatch(bar.className, /\bw-\[|min-w-\[/);
    for (const button of bar.querySelectorAll("button")) {
      assert.match(button.className, /min-w-0/);
    }
    const article = document.querySelector("article");
    assert.doesNotMatch(article?.innerHTML ?? "", /w-\[(39[1-9]|[4-9]\d\d)px\]/);
  });
});
