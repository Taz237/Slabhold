import "@/lib/test/server-only-stub";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { after, afterEach, beforeEach, describe, it } from "node:test";
import { act, createElement, type ReactNode } from "react";
import type { Root } from "react-dom/client";
import { installDom } from "@/lib/test/dom";
import { CollectionContext } from "@/components/collection-provider";
import { SocialContext } from "@/components/social-provider";
import type { SportsCard } from "@/lib/types";

after(() => new Promise((resolve) => setTimeout(resolve, 1500)));
const { win } = installDom();
// jsdom has no scrolling; the card menu scrolls itself into view.
win.HTMLElement.prototype.scrollIntoView = () => {};

const require = createRequire(process.cwd() + "/package.json");
const { AppRouterContext } = require("next/dist/shared/lib/app-router-context.shared-runtime") as {
  AppRouterContext: { Provider: (props: { value: unknown; children?: ReactNode }) => ReactNode };
};
const { PathnameContext, SearchParamsContext } = require("next/dist/shared/lib/hooks-client-context.shared-runtime") as {
  PathnameContext: { Provider: (props: { value: unknown; children?: ReactNode }) => ReactNode };
  SearchParamsContext: { Provider: (props: { value: unknown; children?: ReactNode }) => ReactNode };
};

let refreshes = 0;
const router = {
  back() {},
  forward() {},
  refresh() {
    refreshes += 1;
  },
  push() {},
  replace() {},
  prefetch() {},
};

const OWNER = { id: "owner-fixture", username: "owner", displayName: "Owner", createdAt: "2026-01-01T00:00:00Z" };

const CARD: SportsCard = {
  id: "card-fixture",
  playerName: "Fixture Player",
  year: 2020,
  yearLabel: "2020",
  setBrand: "Prizm",
  cardNumber: "1",
  parallel: "Base",
  grade: "PSA 10",
  sport: "Basketball",
  purchasePrice: null,
  estimatedSellPrice: 0,
  isPublic: false,
  category: "pc",
  photoDataUrl: null,
  accent: "#7C3AED",
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
} as unknown as SportsCard;

function social(extra: Record<string, unknown> = {}) {
  return {
    ready: true,
    mode: "supabase",
    user: OWNER,
    profiles: [OWNER],
    posts: [],
    notifications: [],
    blockedIds: [],
    mutedIds: [],
    loadingPostId: null,
    postLoadFailedId: null,
    retryPost() {},
    commentsFor: () => [],
    refresh: async () => [],
    refreshInbox: async () => [],
    markNotificationsRead() {},
    inboxMore: { notifications: false, messages: false },
    loadOlderNotifications: async () => {},
    applySafetyChange() {},
    ...extra,
  } as never;
}

function collection(extra: Record<string, unknown> = {}) {
  const cards = (extra.cards as SportsCard[] | undefined) ?? [];
  return {
    ready: true,
    loaded: true,
    loadFailed: false,
    cards,
    syncError: null,
    getCard: (id: string) => cards.find((card) => card.id === id),
    reload: async () => cards,
    updateCard: () => ({ card: cards[0], saved: Promise.resolve() }),
    removeCard() {},
    addCard: () => ({}),
    ...extra,
  } as never;
}

function screen(
  child: ReactNode,
  opts: { social?: unknown; collection?: unknown; path?: string; search?: string } = {},
) {
  return createElement(
    AppRouterContext.Provider,
    { value: router },
    createElement(
      PathnameContext.Provider,
      { value: opts.path ?? "/" },
      createElement(
        SearchParamsContext.Provider,
        { value: new URLSearchParams(opts.search ?? "") },
        createElement(
          SocialContext.Provider,
          { value: (opts.social ?? social()) as never },
          createElement(CollectionContext.Provider, { value: (opts.collection ?? collection()) as never }, child),
        ),
      ),
    ),
  );
}

let root: Root | null = null;
let host: HTMLElement;

beforeEach(async () => {
  // Loaded after installDom: react-dom checks for input events when it loads.
  const { createRoot } = await import("react-dom/client");
  refreshes = 0;
  document.body.innerHTML = "";
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  (globalThis as { fetch?: unknown }).fetch = async () =>
    new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } });
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  root = null;
});

async function render(node: ReactNode) {
  await act(async () => root!.render(node));
  await act(async () => new Promise((resolve) => setTimeout(resolve, 10)));
}

function text() {
  return host.textContent ?? "";
}

function button(name: RegExp) {
  const found = [...host.querySelectorAll<HTMLButtonElement>("button")].find((node) =>
    name.test(node.getAttribute("aria-label") ?? node.textContent ?? ""),
  );
  assert.ok(found, `button ${name}`);
  return found;
}

async function click(target: HTMLElement) {
  await act(async () => target.click());
  await act(async () => new Promise((resolve) => setTimeout(resolve, 10)));
}

async function type(input: HTMLInputElement, value: string) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value")!.set!;
    setter.call(input, value);
    input.dispatchEvent(new win.Event("input", { bubbles: true }));
  });
}

describe("Collection after a failed load", () => {
  it("shows Couldn't load with Try again, never the first-card welcome", async () => {
    const { Dashboard } = await import("@/components/dashboard");
    let reloads = 0;
    await render(
      screen(createElement(Dashboard), {
        path: "/collection",
        collection: collection({
          loadFailed: true,
          loaded: false,
          syncError: "Couldn't load your collection",
          reload: async () => {
            reloads += 1;
            return null;
          },
        }),
      }),
    );
    assert.match(text(), /Couldn't load your collection/);
    assert.doesNotMatch(text(), /Your collection starts here/);
    await click(button(/Try again/));
    assert.equal(reloads, 1);
  });

  it("still welcomes a collector whose empty collection really loaded", async () => {
    const { Dashboard } = await import("@/components/dashboard");
    await render(screen(createElement(Dashboard), { path: "/collection" }));
    assert.doesNotMatch(text(), /Couldn't load/);
  });
});

describe("Card page", () => {
  it("says Couldn't load this card, with Try again, when the collection failed to load", async () => {
    const { CardDetail } = await import("@/components/card-detail");
    let reloads = 0;
    await render(
      screen(createElement(CardDetail, { id: "missing" }), {
        path: "/cards/missing",
        collection: collection({
          loadFailed: true,
          reload: async () => {
            reloads += 1;
            return null;
          },
        }),
      }),
    );
    assert.match(text(), /Couldn't load this card/);
    assert.doesNotMatch(text(), /Card not found/);
    await click(button(/Try again/));
    assert.equal(reloads, 1);
  });

  it("keeps Card not found for a card that really isn't there, back to Collection", async () => {
    const { CardDetail } = await import("@/components/card-detail");
    await render(screen(createElement(CardDetail, { id: "missing" }), { path: "/cards/missing" }));
    assert.match(text(), /Card not found/);
    assert.match(text(), /Back to Collection/);
  });

  it("Mark as sold says when the save fails, and Try again saves again", async () => {
    const { CardDetail } = await import("@/components/card-detail");
    const patches: unknown[] = [];
    await render(
      screen(createElement(CardDetail, { id: CARD.id }), {
        path: `/cards/${CARD.id}`,
        collection: collection({
          cards: [CARD],
          updateCard: (_id: string, patch: unknown) => {
            patches.push(patch);
            const saved = Promise.reject(new Error("Failed to fetch"));
            saved.catch(() => {});
            return { card: CARD, saved };
          },
        }),
      }),
    );
    await click(button(/^Card actions$/));
    const price = host.querySelector<HTMLInputElement>('input[aria-label="Sold price"]');
    assert.ok(price, "the sold price field has a name");
    await type(price, "125");
    await click(button(/^Mark as sold$/));
    const alert = host.querySelector('[role="alert"]');
    assert.ok(alert, "an alert shows");
    assert.match(alert.textContent ?? "", /Couldn't mark this card sold/);
    await click(button(/Try again/));
    assert.equal(patches.length, 2);
  });

  it("Mark as sold with no price says what's missing instead of doing nothing", async () => {
    const { CardDetail } = await import("@/components/card-detail");
    await render(
      screen(createElement(CardDetail, { id: CARD.id }), { path: `/cards/${CARD.id}`, collection: collection({ cards: [CARD] }) }),
    );
    await click(button(/^Card actions$/));
    await click(button(/^Mark as sold$/));
    assert.match(text(), /Enter a sold price/);
  });

  it("Move category says when the save fails, and Try again moves it again", async () => {
    const { CardDetail } = await import("@/components/card-detail");
    const patches: unknown[] = [];
    await render(
      screen(createElement(CardDetail, { id: CARD.id }), {
        path: `/cards/${CARD.id}`,
        collection: collection({
          cards: [CARD],
          updateCard: (_id: string, patch: unknown) => {
            patches.push(patch);
            const saved = Promise.reject(new Error("Failed to fetch"));
            saved.catch(() => {});
            return { card: CARD, saved };
          },
        }),
      }),
    );
    const radios = [...host.querySelectorAll<HTMLButtonElement>('[role="radiogroup"][aria-label="Card category"] [role="radio"]')];
    const other = radios.find((radio) => radio.getAttribute("aria-checked") !== "true");
    assert.ok(other);
    await click(other);
    assert.match(host.querySelector('[role="alert"]')?.textContent ?? "", /Couldn't move this card/);
    await click(button(/Try again/));
    assert.equal(patches.length, 2);
  });
});

describe("Post page", () => {
  it("says Couldn't load this post, with Try again, when the read failed", async () => {
    const { PostView } = await import("@/components/post-view");
    const retried: string[] = [];
    await render(
      screen(createElement(PostView, { id: "post-1" }), {
        path: "/posts/post-1",
        social: social({ postLoadFailedId: "post-1", retryPost: (id: string) => retried.push(id) }),
      }),
    );
    assert.match(text(), /Couldn't load this post/);
    assert.doesNotMatch(text(), /That post is gone/);
    await click(button(/Try again/));
    assert.deepEqual(retried, ["post-1"]);
  });

  it("keeps That post is gone for a post that really is", async () => {
    const { PostView } = await import("@/components/post-view");
    await render(screen(createElement(PostView, { id: "post-1" }), { path: "/posts/post-1" }));
    assert.match(text(), /That post is gone/);
  });
});

describe("Notifications", () => {
  it("a failed read with nothing to show says so, with Try again", async () => {
    const { NotificationsView } = await import("@/components/notifications-view");
    let reads = 0;
    await render(
      screen(createElement(NotificationsView), {
        path: "/notifications",
        social: social({
          refreshInbox: async () => {
            reads += 1;
            throw new Error("Failed to fetch");
          },
        }),
      }),
    );
    assert.match(text(), /Couldn't load notifications/);
    assert.doesNotMatch(text(), /No notifications yet/);
    await click(button(/Try again/));
    assert.equal(reads, 2);
  });

  it("an empty inbox that really loaded still says No notifications yet", async () => {
    const { NotificationsView } = await import("@/components/notifications-view");
    await render(screen(createElement(NotificationsView), { path: "/notifications" }));
    assert.match(text(), /No notifications yet/);
  });
});

describe("Profile replies", () => {
  function profileSocial(loadRepliesBy: () => Promise<void>) {
    return social({
      reposts: [],
      publicCards: [],
      requestPublicCards() {},
      safetyAccounts: [],
      rememberPosts() {},
      removedPostIds: new Set(),
      repliesBy: () => [],
      loadRepliesBy,
      profileByUsername: () => OWNER,
      requestProfiles() {},
      profilesReady: () => true,
      profilesFailed: () => false,
      followerCount: () => 0,
      followingCount: () => 0,
      isFollowing: () => false,
    });
  }

  it("a failed read says Couldn't load replies, and Try again reads again", async () => {
    const { ProfileView } = await import("@/components/profile-view");
    let reads = 0;
    await render(
      screen(createElement(ProfileView, { username: "owner" }), {
        path: "/u/owner",
        search: "tab=replies",
        social: profileSocial(async () => {
          reads += 1;
          throw new Error("Failed to fetch");
        }),
      }),
    );
    assert.match(text(), /Couldn't load replies/);
    assert.doesNotMatch(text(), /No replies yet/);
    await click(button(/Try again/));
    assert.equal(reads, 2);
  });

  it("no replies that really loaded still says No replies yet", async () => {
    const { ProfileView } = await import("@/components/profile-view");
    await render(
      screen(createElement(ProfileView, { username: "owner" }), {
        path: "/u/owner",
        search: "tab=replies",
        social: profileSocial(async () => {}),
      }),
    );
    assert.match(text(), /No replies yet/);
  });
});

describe("Unblock and unmute", () => {
  it("a failed unblock says so, and Try again asks again", async () => {
    const { SafetyMenu } = await import("@/components/safety-menu");
    let calls = 0;
    const actions = {
      unblockAccount: async () => {
        calls += 1;
        return { ok: false as const, error: "Something went wrong. Try again." };
      },
    };
    await render(
      screen(
        createElement(SafetyMenu, {
          targetType: "user",
          targetId: "them",
          reportedUserId: "them",
          username: "them",
          actions,
        }),
        { social: social({ blockedIds: ["them"] }) },
      ),
    );
    await click(button(/^More$/));
    await click(button(/Unblock @them/));
    const alert = host.querySelector('[role="alert"]');
    assert.ok(alert);
    assert.match(alert.textContent ?? "", /Couldn't unblock @them/);
    await click(button(/Try again/));
    assert.equal(calls, 2);
  });

  it("a failed unmute says so too", async () => {
    const { SafetyMenu } = await import("@/components/safety-menu");
    const actions = { unmuteAccount: async () => ({ ok: false as const, error: "x" }) };
    await render(
      screen(
        createElement(SafetyMenu, { targetType: "user", targetId: "them", reportedUserId: "them", username: "them", actions }),
        { social: social({ mutedIds: ["them"] }) },
      ),
    );
    await click(button(/^More$/));
    await click(button(/Unmute @them/));
    assert.match(host.querySelector('[role="alert"]')?.textContent ?? "", /Couldn't unmute @them/);
  });
});

describe("Leaderboard error", () => {
  it("has a Try again that reloads the page data", async () => {
    const { LeaderboardView } = await import("@/components/leaderboard-view");
    const { unavailableLeaderboard } = await import("@/lib/leaderboard/present");
    const model = unavailableLeaderboard({ week: "current", focusBoardId: null, now: new Date("2026-11-11T12:00:00Z") });
    await render(screen(createElement(LeaderboardView, { model }), { path: "/leaderboard" }));
    assert.doesNotMatch(text(), /Refresh the page/);
    await click(button(/Try again/));
    assert.equal(refreshes, 1);
  });
});

describe("Feed error", () => {
  it("the lane error is a Try again, not a red line", async () => {
    const { FeedLoadError } = await import("@/components/feed-view");
    let retries = 0;
    await render(screen(createElement(FeedLoadError, { onRetry: async () => void retries++ })));
    assert.match(text(), /Couldn't load posts/);
    await click(button(/Try again/));
    assert.equal(retries, 1);
  });
});

describe("ReadRetry", () => {
  it("says Trying again… while the retry runs, and ignores extra taps", async () => {
    const { ReadRetry } = await import("@/components/read-retry");
    let calls = 0;
    let finish: () => void = () => {};
    await render(
      createElement(ReadRetry, {
        title: "Couldn't load posts",
        onRetry: () => {
          calls += 1;
          return new Promise<void>((resolve) => (finish = resolve));
        },
      }),
    );
    const retry = button(/Try again/);
    await click(retry);
    await click(retry);
    assert.equal(calls, 1);
    assert.equal(retry.textContent, "Trying again…");
    await act(async () => finish());
    assert.equal(retry.textContent, "Try again");
  });
});

describe("Delete account confirm", () => {
  it("accepts delete typed in lowercase with a trailing space", async () => {
    const { DeleteAccount } = await import("@/components/delete-account");
    await render(screen(createElement(DeleteAccount)));
    await click(button(/^Delete account$/));
    const input = host.querySelector<HTMLInputElement>("#delete-confirm");
    assert.ok(input);
    assert.equal(input.getAttribute("autocapitalize"), "characters");
    await type(input, "delete ");
    const confirm = [...host.querySelectorAll<HTMLButtonElement>("button")].filter((node) => /Delete/.test(node.textContent ?? "")).at(-1)!;
    assert.equal(confirm.disabled, false);
  });
});

describe("No vendor names or raw errors in the copy", () => {
  it("the sources never show Supabase or Still loading", async () => {
    const { readFileSync } = await import("node:fs");
    const provider = readFileSync("components/social-provider.tsx", "utf8");
    assert.doesNotMatch(provider, /"Could not reach Supabase\."/);
    assert.doesNotMatch(provider, /"Still loading\."/);
    assert.doesNotMatch(provider, /error instanceof Error \? error\.message/);
  });
});
