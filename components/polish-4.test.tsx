import "@/lib/test/server-only-stub";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, it } from "node:test";
import { act, createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { installDom } from "@/lib/test/dom";
import { CollectionContext } from "@/components/collection-provider";
import { SocialContext } from "@/components/social-provider";
import { PRICE_BASIS_LINE } from "@/lib/comps/price-basis";
import { TEAM_BADGE_USERNAMES } from "@/lib/social/team-badge";

const { win } = installDom();
const require = createRequire(process.cwd() + "/package.json");
const { AppRouterContext } = require("next/dist/shared/lib/app-router-context.shared-runtime") as {
  AppRouterContext: { Provider: (props: { value: unknown; children?: ReactNode }) => ReactNode };
};
const { PathnameContext, SearchParamsContext } = require("next/dist/shared/lib/hooks-client-context.shared-runtime") as {
  PathnameContext: { Provider: (props: { value: unknown; children?: ReactNode }) => ReactNode };
  SearchParamsContext: { Provider: (props: { value: unknown; children?: ReactNode }) => ReactNode };
};
const router = { back() {}, forward() {}, refresh() {}, push() {}, replace() {}, prefetch() {} };
const TEAM = TEAM_BADGE_USERNAMES[0];
const read = (path: string) => readFileSync(path, "utf8");

function wrap(child: ReactNode, social: Record<string, unknown> = {}) {
  return createElement(
    AppRouterContext.Provider,
    { value: router },
    createElement(
      PathnameContext.Provider,
      { value: "/" },
      createElement(
        SearchParamsContext.Provider,
        { value: new URLSearchParams() },
        createElement(
          SocialContext.Provider,
          {
            value: new Proxy({ ready: true, mode: "supabase", user: null, profiles: [], posts: [], ...social }, {
              // Anything else a screen asks for reads as an inert function.
              get: (target: Record<string, unknown>, key: string) => (key in target ? target[key] : () => undefined),
            }) as never,
          },
          createElement(CollectionContext.Provider, { value: { ready: true, cards: [], syncError: null } as never }, child),
        ),
      ),
    ),
  );
}

async function mount(node: ReactNode) {
  const { createRoot } = await import("react-dom/client");
  const host = win.document.createElement("div");
  win.document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(node));
  return {
    host,
    unmount() {
      act(() => root.unmount());
      host.remove();
    },
  };
}

describe("Slabhold team badge on every list of people", () => {
  it("shows beside a team member on the value board, and not beside anyone else", async () => {
    const { ValueBoardView } = await import("@/components/value-board");
    const row = (username: string, rank: number) => ({
      userId: username,
      username,
      displayName: username,
      avatarUrl: null,
      accent: "#7C3AED",
      percent: 0.1,
      percentLabel: "+10.0%",
      flagged: false,
      rank,
    });
    const html = renderToStaticMarkup(
      wrap(
        createElement(ValueBoardView, {
          model: {
            start: "",
            end: "",
            weekLabel: "",
            note: "",
            closedMessage: null,
            emptyMessage: null,
            viewerUserId: null,
            brackets: [{ id: "b", label: "B", rows: [row(TEAM, 1), row("fixture_collector", 2)] }],
          },
          checklist: { openByDefault: false, eligible: true, status: null, line: "", items: [] } as never,
        }),
      ),
    );
    assert.equal((html.match(/data-team-badge=""/g) ?? []).length, 1);
  });

  it("is wired into the leaderboard, player hub, card owners and public card page", () => {
    for (const path of [
      "components/leaderboard-view.tsx",
      "components/player-hub.tsx",
      "components/card-people-view.tsx",
      "components/public-card-view.tsx",
      "components/value-board.tsx",
    ]) {
      assert.match(read(path), /<TeamBadge username=\{[^}]+\} inLink/, path);
    }
  });
});

describe("public comps say USD", () => {
  it("shows the USD line under the fair price", async () => {
    const { PublicCardCompsPreview } = await import("@/components/public-card-comps");
    const html = renderToStaticMarkup(
      wrap(
        createElement(PublicCardCompsPreview, {
          pathname: "/u/fixture/cards/1",
          comps: {
            sales: [{ priceCents: 4000, soldAt: "2026-04-02", grade: "PSA 10", source: "eBay" }],
            medianCents: 3500,
            p25Cents: 3000,
            p75Cents: 4000,
            nSales: 3,
            matchedAt: "2026-11-01T00:00:00.000Z",
            status: "ok",
          } as never,
        }),
      ),
    );
    assert.ok(html.includes(PRICE_BASIS_LINE));
  });
});

describe("avatar", () => {
  it("falls back to the initials when the photo URL is broken", async () => {
    const { Avatar } = await import("@/components/avatar");
    const view = await mount(wrap(createElement(Avatar, { name: "Fixture Collector", image: "https://cdn.example/gone.jpg", expandable: false })));
    const img = view.host.querySelector("img");
    assert.ok(img);
    await act(async () => {
      img.dispatchEvent(new win.Event("error"));
    });
    assert.equal(view.host.querySelector("img"), null);
    assert.equal(view.host.querySelector("[data-avatar-initials]")?.textContent, "FC");
    view.unmount();
  });
});

describe("post replies come in pages", () => {
  it("shows 20, then 20 more from the end of the list", async () => {
    const { PostView } = await import("@/components/post-view");
    const author = { id: "author", username: "author", displayName: "Author", createdAt: "2026-01-01T00:00:00Z" };
    const post = { id: "p1", authorId: "author", body: "post", createdAt: "2026-11-01T00:00:00Z", likeCount: 0 };
    const replies = Array.from({ length: 45 }, (_, index) => ({
      id: `r${index}`,
      postId: "p1",
      authorId: "author",
      body: `reply ${index}`,
      createdAt: `2026-11-01T00:${String(index).padStart(2, "0")}:00Z`,
    }));
    const view = await mount(
      wrap(createElement(PostView, { id: "p1" }), {
        posts: [post],
        profiles: [author],
        commentsFor: () => replies,
        blockedIds: [],
        mutedIds: [],
        loadingPostId: null,
        postLoadFailedId: null,
        isLiked: () => false,
        isReposted: () => false,
        likeCount: () => 0,
        repostCount: () => 0,
        quotesOf: () => [],
        reposts: [],
      }),
    );
    const count = () => view.host.querySelectorAll("li").length;
    assert.equal(count(), 20);
    const more = view.host.querySelector<HTMLButtonElement>("[data-more-replies]");
    assert.ok(more, "Show more replies");
    assert.match(more.className, /min-h-11/);
    await act(async () => more.click());
    assert.equal(count(), 40);
    await act(async () => view.host.querySelector<HTMLButtonElement>("[data-more-replies]")!.click());
    assert.equal(count(), 45);
    assert.equal(view.host.querySelector("[data-more-replies]"), null);
    view.unmount();
  });
});

describe("skeletons, not spinners", () => {
  it("card search and the photo field draw skeletons", () => {
    for (const path of ["components/card-search.tsx", "components/card-photo-field.tsx"]) {
      assert.doesNotMatch(read(path), /animate-spin|Loader2/, path);
    }
    assert.match(read("components/card-search.tsx"), /data-search-skeleton/);
    assert.match(read("components/card-photo-field.tsx"), /data-photo-skeleton/);
  });

  it("the Edit card skeleton shows in light mode too", async () => {
    const { EditCardPage } = await import("@/components/edit-card-page");
    const html = renderToStaticMarkup(
      createElement(CollectionContext.Provider, { value: { ready: false, cards: [], getCard: () => undefined } as never }, createElement(EditCardPage, { id: "x" })),
    );
    assert.match(html, /data-edit-skeleton/);
    // The shared shimmer has its own light and dark gray (globals.css).
    assert.match(html, /skeleton-shimmer/);
  });
});

describe("type and color", () => {
  it("uses Geist weights up to 600: no bold outside the grading slab's printed label", () => {
    const files = ["components/badges/badge-share-view.tsx", "components/attach-card-field.tsx", "components/leaderboard-view.tsx"];
    for (const path of files) assert.doesNotMatch(read(path), /font-(?:bold|extrabold|black)\b/, path);
    const slab = read("components/card-slab-frame.tsx");
    assert.equal((slab.match(/font-extrabold/g) ?? []).length, 2, "only the slab label copies a real grading label");
  });

  it("repost, the met requirement ✓ and the invite note are brand purple, never green", () => {
    for (const path of ["components/tweet.tsx", "components/value-board.tsx", "components/invite/invite-settings.tsx"]) {
      assert.doesNotMatch(read(path), /emerald|green-/, path);
    }
  });

  it("the comps screen-reader label never says eBay", () => {
    assert.doesNotMatch(read("components/comps-list.tsx"), /aria-label="[^"]*eBay/);
  });
});
