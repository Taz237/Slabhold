import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ImageConfigContext } from "next/dist/shared/lib/image-config-context.shared-runtime";
import { imageConfigDefault } from "next/dist/shared/lib/image-config";
import { MoverTile } from "@/components/moving-today";
import { CardTile } from "@/components/card-tile";
import nextConfig from "@/next.config";
import { moverAccessibleName } from "@/lib/moving-today/rail";
import type { MovingTodaySale } from "@/lib/moving-today/types";

function render(element: ReactElement) {
  return renderToStaticMarkup(
    createElement(ImageConfigContext.Provider, { value: { ...imageConfigDefault, ...nextConfig.images } }, element),
  );
}

function sale(partial: Partial<MovingTodaySale> = {}): MovingTodaySale {
  return {
    kind: "card",
    cardId: "c1",
    href: "/u/maya/cards/c1",
    player: "Jordan Love",
    detail: "2020 · Prizm · PSA 10",
    yearLabel: "2020",
    setBrand: "Prizm",
    grade: "PSA 10",
    grader: "PSA",
    conditionType: "graded",
    isRookie: true,
    imageUrl: null,
    accent: "#7c5cff",
    isNew: false,
    priceCents: 12000,
    priceLabel: "$120.00",
    percent: null,
    percentLabel: null,
    ...partial,
  };
}

function tile(partial: Partial<MovingTodaySale> = {}) {
  return render(createElement("ul", null, createElement(MoverTile, { sale: sale(partial), index: 0, variant: "grid" })));
}

describe("Moving today tiles with and without a value", () => {
  it("shows the price when the card has a value", () => {
    const html = tile();
    assert.match(html, /\$120\.00/);
    assert.doesNotMatch(html, /No value yet/);
    assert.doesNotMatch(html, /data-new-chip/);
  });

  it("shows a quiet No value yet line, never $0, NaN or a blank slot, when the value is null", () => {
    const html = tile({ priceCents: null, priceLabel: "" });
    assert.match(html, /data-no-value=""[^>]*>No value yet</);
    assert.match(html, /text-zinc-500/);
    assert.doesNotMatch(html, /\$0|NaN/);
    assert.match(moverAccessibleName(sale({ priceCents: null, priceLabel: "" })), /no value yet/);
  });

  it("keeps the New chip on a brand-new card, beside No value yet", () => {
    const html = tile({ priceCents: null, priceLabel: "", isNew: true });
    assert.match(html, /data-new-chip=""/);
    assert.match(html, /No value yet/);
  });

  it("keeps the New chip and the price on a brand-new card that has a value", () => {
    const html = tile({ isNew: true });
    assert.match(html, /data-new-chip=""/);
    assert.match(html, /\$120\.00/);
    assert.doesNotMatch(html, /No value yet/);
  });

  it("treats a $0 or NaN label as no value", () => {
    for (const priceLabel of ["$0.00", "$0", "$NaN", "NaN"]) {
      const html = tile({ priceLabel });
      assert.match(html, /No value yet/, priceLabel);
      assert.doesNotMatch(html, /\$0|NaN/, priceLabel);
    }
  });

  it("leaves the slot empty only when the caller shows the price elsewhere", () => {
    const html = render(
      createElement(CardTile, {
        card: { id: "c1", playerName: "Jordan Love", year: 2020, setBrand: "Prizm", accent: "#7c5cff", photoDataUrl: null },
        href: "/cards/c1",
        index: 0,
        as: "div",
        priceLabel: null,
        noValue: false,
      }),
    );
    assert.doesNotMatch(html, /No value yet/);
  });
});
