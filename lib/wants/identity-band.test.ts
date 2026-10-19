import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { join } from "node:path";
import { mailDayFlag, type WantMatchEvent } from "./notify-want-matches";
import { identityBandValue, type BandValueRow } from "./identity-band";

function row(partial: Partial<BandValueRow> & Pick<BandValueRow, "cardId">): BandValueRow {
  return {
    inPublicCards: false,
    median: null,
    low: null,
    nSales: 1,
    matchedAt: "2026-10-01T00:00:00.000Z",
    ...partial,
  };
}

function mailEvent(cardValue: number | null): WantMatchEvent {
  return {
    sourceType: "post",
    sourceId: "post-1",
    cardKey: "jordan|2020|select|47|base|psa 10",
    actorId: "poster",
    actorUsername: "poster",
    label: "Jordan Love PSA 10",
    href: "/posts/post-1",
    mailDay: true,
    cardIsPublic: true,
    cardValue,
  };
}

describe("mail day identity band", () => {
  const rows = [
    row({
      cardId: "stranger-private",
      inPublicCards: false,
      median: 400,
      low: 380,
      nSales: 8,
      matchedAt: "2026-10-20T00:00:00.000Z",
    }),
    row({
      cardId: "public-copy",
      inPublicCards: true,
      median: 30,
      low: 25,
      nSales: 4,
      matchedAt: "2026-10-18T00:00:00.000Z",
    }),
    row({
      cardId: "poster",
      inPublicCards: false,
      median: 50,
      low: 45,
      nSales: 2,
      matchedAt: "2026-10-19T00:00:00.000Z",
    }),
  ];

  it("below, at, and above use a public or poster value", () => {
    const band = identityBandValue(rows, "poster");
    assert.equal(band?.median, 50);
    assert.equal(band?.low, 45);
    assert.equal(mailDayFlag(mailEvent(band?.median ?? null), 35), "above");
    assert.equal(mailDayFlag(mailEvent(band?.median ?? null), 50), "at");
    assert.equal(mailDayFlag(mailEvent(band?.median ?? null), 80), "below");

    const publicOnly = identityBandValue(
      rows.filter((item) => item.cardId !== "poster"),
      "poster",
    );
    assert.equal(publicOnly?.median, 30);
    assert.equal(mailDayFlag(mailEvent(publicOnly?.median ?? null), 35), "below");
    assert.equal(mailDayFlag(mailEvent(publicOnly?.median ?? null), 30), "at");
    assert.equal(mailDayFlag(mailEvent(publicOnly?.median ?? null), 20), "above");
  });

  it("drops another user's private card even when it is the newest value", () => {
    const band = identityBandValue(
      [
        row({
          cardId: "stranger-private",
          median: 10,
          nSales: 9,
          matchedAt: "2026-10-21T00:00:00.000Z",
        }),
      ],
      "poster",
    );
    assert.equal(band, null);
    assert.equal(mailDayFlag(mailEvent(null), 35), null);
  });

  it("reads public_cards and the poster's own card", () => {
    const source = readFileSync(join(process.cwd(), "lib/wants/dispatch.ts"), "utf8");
    const start = source.indexOf("async function identityBand");
    const end = source.indexOf("export async function notifyMailDayPost");
    assert.ok(start >= 0 && end > start);
    const body = source.slice(start, end);
    assert.match(body, /\.from\("public_cards"\)/);
    assert.match(body, /identityBandValue\(/);
    const cardsQuery = body.slice(body.indexOf('.from("cards")'));
    assert.match(cardsQuery, /\.eq\("id", card\.id\)/);
    assert.match(cardsQuery, /\.eq\("user_id", posterId\)/);
    assert.doesNotMatch(cardsQuery, /\.ilike\(/);
  });
});
