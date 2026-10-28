import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ImageConfigContext } from "next/dist/shared/lib/image-config-context.shared-runtime";
import { imageConfigDefault } from "next/dist/shared/lib/image-config";
import { PostCardTile, postCardHref } from "@/components/post-card-tile";
import { ProfileCardGrid } from "@/components/profile-card-grid";
import nextConfig from "@/next.config";
import type { PublicCard } from "@/lib/social/types";
import type { CardValueResult } from "@/lib/value/types";

const PHOTO = "https://knuwflptobyutrauxblj.supabase.co/storage/v1/object/public/card-photos/u1/a.jpg";

function card(partial: Partial<PublicCard> = {}): PublicCard {
  return {
    id: "c1",
    playerName: "Luka Dončić",
    year: 2018,
    setBrand: "Prizm",
    cardNumber: "280",
    sport: "Basketball",
    photoDataUrl: null,
    accent: "#7c5cff",
    estimatedSellPrice: 0,
    createdAt: "2024-01-01T00:00:00.000Z",
    ...partial,
  };
}

function ok(median: number): CardValueResult {
  return { status: "ok", median, low: median, high: median, nSales: 5, matchedAt: null };
}

function render(element: ReactElement) {
  return renderToStaticMarkup(
    createElement(
      ImageConfigContext.Provider,
      { value: { ...imageConfigDefault, ...nextConfig.images } },
      element,
    ),
  );
}

function profileGrid(cards: PublicCard[], values = new Map<string, CardValueResult>()) {
  return render(createElement(ProfileCardGrid, { cards, username: "luka77", values }));
}

function postTile(
  partial: Partial<PublicCard> = {},
  extra: { priceText?: string | null; soldHref?: string | null; href?: string } = {},
) {
  return render(
    createElement(PostCardTile, {
      card: card(partial),
      href: extra.href ?? "/cards/c1",
      priceText: extra.priceText ?? null,
      soldHref: extra.soldHref ?? null,
    }),
  );
}

describe("ProfileCardGrid", () => {
  it("renders slab tiles in the collection grid with profile links and prices", () => {
    const html = profileGrid(
      [card({ conditionType: "graded", grade: "PSA 10", photoDataUrl: PHOTO })],
      new Map([["c1", ok(412)]]),
    );
    assert.match(html, /class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4/);
    assert.match(html, /href="\/u\/luka77\/cards\/c1"/);
    assert.match(html, /data-kind="slab"/);
    assert.match(html, />PSA</);
    assert.match(html, />Luka Dončić</);
    assert.match(html, /2018 · Prizm/);
    assert.match(html, /Est\. \$412\.00/);
    assert.doesNotMatch(html, /h-36/);
  });

  it("dresses raw cards as cards and uses the designed placeholder", () => {
    const html = profileGrid([card({ conditionType: "raw", grade: "Raw" })]);
    assert.match(html, /data-kind="card"/);
    assert.doesNotMatch(html, /data-kind="slab"/);
    assert.match(html, /data-placeholder/);
    assert.doesNotMatch(html, /<img/);
  });

  it("reads the grader column for public cards", () => {
    const html = profileGrid([card({ conditionType: "graded", grader: "BGS", grade: "9.5" })]);
    assert.match(html, /data-tone="bgs"/);
    assert.match(html, />9\.5</);
  });

  it("keeps the eBay sold link outside the tile link when there is no price", () => {
    const html = profileGrid([card()], new Map([["c1", { ...ok(0), status: "no_sales", median: null } as CardValueResult]]));
    const link = html.match(/<a[^>]*href="\/u\/luka77[^"]*"[\s\S]*?<\/a>/)?.[0] ?? "";
    assert.ok(link);
    assert.doesNotMatch(link, /ebay\.com/);
    assert.match(html, /href="https:\/\/www\.ebay\.com[^"]*"/);
  });

  it("never shows the owner's needs-details dot or an add-photo link", () => {
    const html = profileGrid([card({ cardNumber: "" })]);
    assert.doesNotMatch(html, /bg-amber-400/);
    assert.doesNotMatch(html, /\/edit"/);
  });

  it("shows the RC tag and the open to offers badge", () => {
    const html = profileGrid([card({ isRookie: true, openToOffers: true })]);
    assert.match(html, />RC</);
    assert.match(html, /Open to offers/i);
  });
});

describe("PostCardTile", () => {
  it("renders a centered, capped slab tile with the price and link", () => {
    const html = postTile(
      { conditionType: "graded", grade: "SGC 9.5", photoDataUrl: PHOTO },
      { priceText: "$412.00", href: "/u/luka77/cards/c1" },
    );
    assert.match(html, /mx-auto[^"]*w-\[60%\][^"]*max-w-\[260px\]/);
    assert.match(html, /href="\/u\/luka77\/cards\/c1"/);
    assert.match(html, /data-kind="slab"/);
    assert.match(html, /data-tone="sgc"/);
    assert.match(html, /\$412\.00/);
    assert.match(html, /sizes="260px"/);
    assert.match(html, /loading="lazy"/);
    assert.doesNotMatch(html, /max-h-80/);
  });

  it("dresses raw cards as cards", () => {
    const html = postTile({ conditionType: "raw" });
    assert.match(html, /data-kind="card"/);
    assert.doesNotMatch(html, /data-kind="slab"/);
  });

  it("uses the slab placeholder, not the initials gradient", () => {
    const html = postTile();
    assert.match(html, /data-placeholder/);
    assert.doesNotMatch(html, /grid h-36/);
  });

  it("shows the eBay sold link under the tile", () => {
    const html = postTile({}, { soldHref: "https://www.ebay.com/sch/i.html?q=x" });
    assert.match(html, /<\/a>[\s\S]*href="https:\/\/www\.ebay\.com\/sch\/i\.html\?q=x"/);
  });

  it("shows a skeleton while the price loads, never $0", () => {
    const html = postTile({}, { priceText: "…" });
    assert.match(html, /animate-pulse/);
    assert.doesNotMatch(html, /\$0/);
  });
});

describe("390px layout", () => {
  it("keeps long names and prices inside the tile", () => {
    const long = "Giannis Antetokounmpo Milwaukee Signature Rookie Patch Auto";
    for (const html of [
      profileGrid([card({ playerName: long, setBrand: long })]),
      postTile({ playerName: long, setBrand: long }, { priceText: `${long} · $1,234,567.00` }),
    ]) {
      const name = html.match(/<p class="([^"]*)">Giannis/)?.[1] ?? "";
      assert.match(name, /\bmin-w-0\b/);
      assert.match(name, /\btruncate\b/);
      assert.match(html, /<p class="[^"]*\btruncate\b[^"]*">[^<]*Giannis[^<]*<\/p>/);
      assert.match(html, /<p class="min-w-0 truncate text-sm font-bold[^"]*" title=/);
      assert.doesNotMatch(html, /(?<![\w-])(?:w|min-w)-\[\d+px\]/);
    }
  });

  it("sizes the post tile by percent with a cap, never a fixed width", () => {
    const html = postTile();
    const outer = html.match(/^<div data-tile="c1" class="([^"]*)"/)?.[1] ?? "";
    assert.match(outer, /\bw-\[60%\]/);
    assert.match(outer, /\bmax-w-\[260px\]/);
  });
});

describe("postCardHref", () => {
  it("links your own card to its card page and others to the profile card", () => {
    assert.equal(postCardHref({ cardId: "c1", username: "luka77", owned: true }), "/cards/c1");
    assert.equal(
      postCardHref({ cardId: "c 1", username: "luka77", owned: false }),
      "/u/luka77/cards/c%201",
    );
  });
});
