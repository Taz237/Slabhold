import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ImageConfigContext } from "next/dist/shared/lib/image-config-context.shared-runtime";
import { imageConfigDefault } from "next/dist/shared/lib/image-config";
import { CollectionGrid } from "@/components/collection-grid";
import nextConfig from "@/next.config";
import type { SportsCard } from "@/lib/types";
import type { CardValueResult } from "@/lib/value/types";

const PHOTO = "https://knuwflptobyutrauxblj.supabase.co/storage/v1/object/public/card-photos/u1/";

function card(partial: Partial<SportsCard> = {}): SportsCard {
  return {
    id: "c1",
    playerName: "Luka Dončić",
    year: 2018,
    yearLabel: "2018",
    setBrand: "Prizm",
    setIsCustom: false,
    cardNumber: "280",
    noNumber: false,
    grade: "Raw",
    parallel: "Base",
    parallelIsCustom: false,
    serialRun: null,
    serialNo: null,
    isRookie: false,
    isAuto: false,
    isRelic: false,
    conditionType: "raw",
    gradeQualifier: "",
    certNumber: "",
    sport: "Basketball",
    purchasePrice: 100,
    purchaseDate: "2024-01-01",
    estimatedSellPrice: 0,
    sellPrice: null,
    sellDate: null,
    notes: "",
    photoDataUrl: null,
    accent: "#7c5cff",
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    ...partial,
  };
}

function ok(median: number): CardValueResult {
  return { status: "ok", median, low: median, high: median, nSales: 5, matchedAt: null };
}

function render(
  cards: SportsCard[],
  values = new Map<string, CardValueResult>(),
  extra: { valuesLoading?: boolean; valuesFailed?: boolean } = {},
) {
  // The bundler normally injects next.config images. Tests pass it in, so
  // a photo outside the allowed pattern fails here too.
  return renderToStaticMarkup(
    createElement(
      ImageConfigContext.Provider,
      { value: { ...imageConfigDefault, ...nextConfig.images } },
      createElement(CollectionGrid, {
        cards,
        values,
        valuesLoading: extra.valuesLoading ?? false,
        valuesFailed: extra.valuesFailed ?? false,
      }),
    ),
  );
}

function tiles(html: string) {
  return html.split("data-tile=").slice(1);
}

describe("CollectionGrid", () => {
  it("lays out 2, 3 and 4 columns", () => {
    const html = render([card()]);
    assert.match(html, /class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4/);
  });

  it("links each tile to its card page with a full accessible name", () => {
    const html = render(
      [card({ conditionType: "graded", grade: "PSA 10", photoDataUrl: `${PHOTO}a.jpg` })],
      new Map([["c1", ok(412)]]),
    );
    assert.match(html, /href="\/cards\/c1"/);
    assert.match(html, /aria-label="Luka Dončić 2018 Prizm, PSA 10, \$412.00"/);
  });

  it("dresses graded cards as slabs with a label strip", () => {
    const html = render([card({ conditionType: "graded", grade: "PSA 10", certNumber: "81234567" })]);
    assert.match(html, /data-kind="slab"/);
    assert.match(html, /data-tone="psa"/);
    assert.match(html, />PSA</);
    assert.match(html, />10</);
    assert.match(html, /81234567/);
  });

  it("dresses raw cards as cards", () => {
    const html = render([card()]);
    assert.match(html, /data-kind="card"/);
    assert.doesNotMatch(html, /data-kind="slab"/);
  });

  it("draws a designed placeholder and no img without a photo", () => {
    const html = render([card()]);
    assert.doesNotMatch(html, /<img/);
    assert.match(html, /data-placeholder/);
    assert.match(html, />LD</);
    assert.match(html, /2018 · Prizm/);
    assert.match(html, /href="\/cards\/c1\/edit"/);
    assert.match(html, /aria-label="Add a photo of Luka Dončić"/);
  });

  it("sizes photos and asks for only the first 4 eagerly", () => {
    const cards = Array.from({ length: 6 }, (_, i) =>
      card({ id: `c${i}`, photoDataUrl: `${PHOTO}${i}.jpg` }),
    );
    const html = render(cards);
    const imgs = html.match(/<img[^>]*>/g) ?? [];
    assert.equal(imgs.length, 6);
    for (const img of imgs) assert.match(img, /sizes="\(min-width: 1024px\)/);
    const eager = imgs.filter((img) => /loading="eager"/.test(img));
    const lazy = imgs.filter((img) => /loading="lazy"/.test(img));
    assert.equal(eager.length, 4);
    assert.equal(lazy.length, 2);
    assert.ok(imgs.slice(0, 4).every((img) => /fetchPriority="high"/i.test(img)));
    assert.ok(imgs.every((img) => img.includes("/_next/image?url=")));
  });

  it("keeps local data photos on a plain img", () => {
    const html = render([card({ photoDataUrl: "data:image/jpeg;base64,abc" })]);
    assert.match(html, /<img[^>]*src="data:image\/jpeg;base64,abc"/);
  });

  it("shows a gain pill only with a price paid and a value", () => {
    const values = new Map([
      ["up", ok(150)],
      ["down", ok(50)],
      ["unknown", ok(150)],
    ]);
    const html = render(
      [
        card({ id: "up" }),
        card({ id: "down", createdAt: "2024-01-02T00:00:00.000Z" }),
        card({ id: "unknown", purchasePrice: null, createdAt: "2024-01-03T00:00:00.000Z" }),
        card({ id: "novalue", createdAt: "2024-01-04T00:00:00.000Z" }),
      ],
      values,
    );
    const byId = Object.fromEntries(
      tiles(html).map((tile) => [tile.match(/^"([^"]+)"/)?.[1] ?? "", tile]),
    );
    assert.match(byId.up, /data-gain="up"[^>]*class="[^"]*emerald/);
    assert.match(byId.up, /\+50\.0%/);
    assert.match(byId.down, /data-gain="down"[^>]*class="[^"]*rose/);
    assert.match(byId.down, /−50\.0%/);
    assert.doesNotMatch(byId.unknown, /data-gain/);
    assert.doesNotMatch(byId.novalue, /data-gain/);
  });

  it("marks rookies, sold cards and missing details", () => {
    const html = render([
      card({ isRookie: true, sellPrice: 90, sellDate: "2024-03-01", cardNumber: "" }),
    ]);
    assert.match(html, />RC</);
    assert.match(html, />Sold</);
    assert.match(html, /aria-label="Needs: number"/);
    assert.doesNotMatch(html, /Public|Private/);
  });

  it("never shows $0 while values load", () => {
    const html = render([card()], new Map(), { valuesLoading: true });
    assert.doesNotMatch(html, /\$0\.00/);
    assert.match(html, /animate-pulse/);
  });

  it("adds a ghost Add a card tile for 1 to 3 cards", () => {
    const one = render([card()]);
    assert.match(one, /href="\/cards\/new"/);
    assert.match(one, /Add a card/);
    assert.match(one, /border-dashed/);
    const many = render(
      Array.from({ length: 4 }, (_, i) => card({ id: `c${i}` })),
    );
    assert.doesNotMatch(many, /href="\/cards\/new"/);
  });
});
