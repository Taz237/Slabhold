import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { join } from "node:path";
import { renderMovingTodayOg } from "@/components/og-frame";
import { movingTodayCacheControl } from "./cache";
import { movingTodayShareModel } from "./share";
import { emptyMovingToday, MOVING_TODAY_TITLE, type MovingTodayPayload } from "./types";

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function payload(): MovingTodayPayload {
  return {
    title: MOVING_TODAY_TITLE,
    date: "2026-10-22",
    dateLabel: "Oct 22",
    sales: [
      {
        cardId: "ba95893e-89fe-4735-be3f-1509b6b6f3b9",
        href: "/u/ada/cards/ba95893e-89fe-4735-be3f-1509b6b6f3b9",
        player: "Victor Wembanyama ada@example.com",
        detail: "2023-24 Prizm",
        imageUrl: null,
        accent: "#7c5cff",
        priceCents: 18500,
        priceLabel: "$185.00",
        soldOn: "2026-10-22",
        soldLabel: "Oct 22",
        percent: 24,
        percentLabel: "+24%",
      },
      {
        cardId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        href: "/u/ada/cards/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        player: "Luka Doncic",
        detail: "2018 Prizm",
        imageUrl: null,
        accent: "#7c5cff",
        priceCents: 4000,
        priceLabel: "$40.00",
        soldOn: "2026-10-22",
        soldLabel: "Oct 22",
        percent: null,
        percentLabel: null,
      },
    ],
  };
}

describe("Moving today share image", () => {
  it("draws the price, the honest percent, and the sale date", async () => {
    const model = movingTodayShareModel(payload());
    assert.equal(model.title, "Moving today");
    assert.equal(model.dateLabel, "Oct 22");
    assert.equal(model.lines[0]?.name, "Victor Wembanyama");
    assert.equal(model.lines[0]?.price, "$185.00");
    assert.equal(model.lines[0]?.move, "+24%");
    assert.equal(model.lines[0]?.sold, "Oct 22");
    assert.equal(model.lines[1]?.move, "");
    assert.equal(JSON.stringify(model).includes("ada@example.com"), false);
    assert.equal(JSON.stringify(model).includes("ba95893e"), false);

    const response = renderMovingTodayOg(model);
    assert.equal(response.headers.get("content-type"), "image/png");
    assert.equal(response.headers.get("cache-control"), movingTodayCacheControl());
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(bytes[0], 0x89);
    assert.equal(bytes[1], 0x50);
    assert.ok(bytes.length > 1000);
  });

  it("still renders a clean image when the day has no sales", async () => {
    const response = renderMovingTodayOg(movingTodayShareModel(emptyMovingToday("2026-10-22")));
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(bytes[0], 0x89);
    assert.ok(bytes.length > 500);
  });

  it("uses the Open Graph route", () => {
    const image = read("app/moving-today/opengraph-image.tsx");
    const twitter = read("app/moving-today/twitter-image.tsx");
    assert.match(image, /renderMovingTodayOg/);
    assert.match(image, /getMovingToday/);
    assert.match(image, /movingTodayShareModel/);
    assert.match(image, /alt = MOVING_TODAY_TITLE/);
    assert.match(twitter, /opengraph-image/);
    assert.equal(MOVING_TODAY_TITLE, "Moving today");
  });
});
