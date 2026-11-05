import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { act, createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoot, type Root } from "react-dom/client";
import { ImageConfigContext } from "next/dist/shared/lib/image-config-context.shared-runtime";
import { imageConfigDefault } from "next/dist/shared/lib/image-config";
import { installDom } from "@/lib/test/dom";
import { SlabFrame, type ArtCard } from "@/components/card-slab-frame";
import { CardSlabArt } from "@/components/card-slab-art";
import { CardTile } from "@/components/card-tile";
import { PostCardTile } from "@/components/post-card-tile";
import { ProfileCardGrid } from "@/components/profile-card-grid";
import nextConfig from "@/next.config";
import { forgetCardShapes, rememberShape } from "@/lib/ui/card-shape";
import type { PublicCard } from "@/lib/social/types";

installDom();

const RAW: ArtCard = {
  playerName: "Demo Collector",
  year: 2023,
  yearLabel: "",
  setBrand: "Prizm",
  grade: "",
  gradeQualifier: "",
  certNumber: "",
  accent: "#7C3AED",
  conditionType: "raw",
};
const SLAB: ArtCard = { ...RAW, grade: "PSA 10", grader: "PSA", certNumber: "12345678", conditionType: "graded" };
const WIDE = "https://example.com/demo/hug-wide.jpg";

// The raw photo box's look: the same border and shadow in both fits.
const BOX_LOOK =
  "w-full overflow-hidden rounded-lg border border-black/10 bg-zinc-900 shadow-[0_10px_24px_-10px_rgba(0,0,0,0.55)] dark:border-white/10";

function frame(card: ArtCard, props: { shape?: "portrait" | "landscape"; fit?: "tile" | "hug" } = {}) {
  return renderToStaticMarkup(
    <SlabFrame card={card} {...props}>
      <i />
    </SlabFrame>,
  );
}

function withImages(element: ReactElement) {
  return renderToStaticMarkup(
    createElement(ImageConfigContext.Provider, { value: { ...imageConfigDefault, ...nextConfig.images } }, element),
  );
}

function publicCard(partial: Partial<PublicCard> = {}): PublicCard {
  return {
    id: "c1",
    playerName: "Demo Collector",
    year: 2023,
    setBrand: "Prizm",
    cardNumber: "1",
    sport: "Basketball",
    photoDataUrl: null,
    accent: "#7C3AED",
    estimatedSellPrice: 0,
    createdAt: "2024-01-01T00:00:00.000Z",
    ...partial,
  };
}

let root: Root | null = null;
let host: HTMLElement;

beforeEach(() => {
  forgetCardShapes();
  if (root) act(() => root!.unmount());
  document.body.innerHTML = "";
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

describe("SlabFrame fit", () => {
  it("tile is the default and draws byte for byte the same", () => {
    for (const card of [RAW, SLAB]) {
      for (const shape of ["portrait", "landscape"] as const) {
        assert.equal(frame(card, { shape, fit: "tile" }), frame(card, { shape }));
      }
    }
    assert.doesNotMatch(frame(RAW), /data-fit/);
  });

  it("hug draws a raw card as only its 5:7 photo box, no 3:5 band", () => {
    const out = frame(RAW, { fit: "hug" });
    assert.doesNotMatch(out, /aspect-\[3\/5\]|justify-end/);
    assert.match(out, /^<div class="relative aspect-\[5\/7\] /);
    assert.ok(out.includes(BOX_LOOK), "same border and shadow");
    assert.match(out, /data-kind="card"/);
    assert.match(out, /data-fit="hug"/);
    assert.equal((out.match(/<div/g) ?? []).length, 1, "one box, no wrapper");
  });

  it("hug draws a raw landscape card as a 7:5 box", () => {
    const out = frame(RAW, { fit: "hug", shape: "landscape" });
    assert.match(out, /^<div class="relative aspect-\[7\/5\] /);
    assert.match(out, /data-shape="landscape"/);
    assert.doesNotMatch(out, /aspect-\[3\/5\]|aspect-\[5\/7\]/);
    assert.ok(out.includes(BOX_LOOK));
  });

  it("leaves a graded slab untouched", () => {
    for (const shape of ["portrait", "landscape"] as const) {
      assert.equal(frame(SLAB, { shape, fit: "hug" }), frame(SLAB, { shape }));
    }
  });
});

describe("CardSlabArt fit", () => {
  it("reserves a portrait box, then hugs a wide photo once it loads", () => {
    const art = createElement(CardSlabArt, {
      card: RAW,
      index: 99,
      source: { kind: "plain", src: WIDE },
      status: "loading",
      onStatus: () => {},
      fit: "hug",
    });
    act(() => root!.render(art));
    assert.match(host.querySelector("[data-kind]")!.className, /aspect-\[5\/7\]/);
    const img = host.querySelector("img")!;
    Object.defineProperty(img, "naturalWidth", { configurable: true, value: 1400 });
    Object.defineProperty(img, "naturalHeight", { configurable: true, value: 1000 });
    act(() => {
      img.dispatchEvent(new window.Event("load"));
    });
    const box = host.querySelector("[data-kind]")!;
    assert.match(box.className, /aspect-\[7\/5\]/);
    assert.equal(box.getAttribute("data-fit"), "hug");
    assert.match(host.querySelector("img")!.className, /object-contain/);
  });

  it("draws a photo seen before as landscape from the first paint", () => {
    rememberShape(WIDE, 1400, 1000);
    act(() =>
      root!.render(
        createElement(CardSlabArt, {
          card: RAW,
          index: 99,
          source: { kind: "plain", src: WIDE },
          status: "loading",
          onStatus: () => {},
          fit: "hug",
        }),
      ),
    );
    assert.match(host.querySelector("[data-kind]")!.className, /aspect-\[7\/5\]/);
  });
});

describe("Where hug applies", () => {
  const tile = (props: Partial<Parameters<typeof CardTile>[0]> = {}) =>
    withImages(
      createElement(CardTile, {
        card: publicCard({ conditionType: "raw" }),
        href: "/cards/c1",
        index: 0,
        priceLabel: null,
        ...props,
      }),
    );

  it("CardTile keeps the 3:5 tile unless artFit says hug", () => {
    assert.match(tile(), /aspect-\[3\/5\]/);
    assert.equal(tile({ artFit: "tile" }), tile());
    assert.doesNotMatch(tile({ artFit: "hug" }), /aspect-\[3\/5\]/);
  });

  it("a raw card on a post hugs its photo", () => {
    const html = withImages(
      createElement(PostCardTile, { card: publicCard({ conditionType: "raw" }), href: "/cards/c1", priceText: null, soldHref: null }),
    );
    assert.match(html, /data-fit="hug"/);
    assert.doesNotMatch(html, /aspect-\[3\/5\]/);
  });

  it("a slab on a post is the same slab as before", () => {
    const html = withImages(
      createElement(PostCardTile, {
        card: publicCard({ conditionType: "graded", grade: "PSA 10" }),
        href: "/cards/c1",
        priceText: null,
        soldHref: null,
      }),
    );
    assert.match(html, /data-kind="slab"/);
    assert.match(html, /relative flex aspect-\[3\/5\] w-full/);
    assert.doesNotMatch(html, /data-fit/);
  });

  it("grids stay 3:5", () => {
    const html = withImages(
      createElement(ProfileCardGrid, { cards: [publicCard({ conditionType: "raw" })], username: "demo", values: new Map() }),
    );
    assert.match(html, /flex aspect-\[3\/5\] w-full flex-col justify-end/);
    assert.doesNotMatch(html, /data-fit/);
  });
});
