import "@/lib/test/server-only-stub";
import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { POPULAR_INSERTS } from "@/lib/cards/data/popular-inserts";
import { installFakeCompsBackend, trawlRow, type FakeCompsBackend } from "@/lib/test/fake-comps-backend";
import type { CardRow } from "@/lib/social/cards";
import { refreshQueueFromRows } from "@/lib/value/getCardValue";
import { trawlSkipReason } from "./lookup-guard";
import {
  NAMED_INSERTS,
  buildSoldSearchQuery,
  isWideInsertCard,
  matchComps,
  titleMatchesCard,
  type MatchCard,
} from "./match";
import type { SoldCompCard } from "./types";

/**
 * The Jonathon Brooks report: a raw 2024 Color Blast saved under "Panini Prizm".
 * The card is really 2024 Prizm Draft Picks Color Blast #CB-19, and every sold
 * title says "Prizm Draft Picks", so the set rule threw all of them out.
 */
const DRAFT_RAW = "Panini 2024 Prizm Draft Picks Color Blast Jonathon Brooks RC #CB-19 Texas";
const DRAFT_RAW_2 = "2024 Panini Prizm Draft Picks Color Blast Jonathon Brooks #CB-19 Rookie";
const DRAFT_BLACK = "2024 Panini Prizm Draft Picks - Black Color Blast Jonathon Brooks #CB-19 (RC)";
const NFL_PRIZM = "2024 Panini Prizm Color Blast Jonathon Brooks #14 Panthers RC";

const brooks: MatchCard = {
  playerName: "Jonathon Brooks",
  year: 2024,
  yearLabel: "2024",
  setBrand: "Panini Prizm",
  cardNumber: "CB-19",
  parallel: "Color Blast",
  conditionType: "raw",
  grade: "Raw",
};
const brooksNoNumber: MatchCard = { ...brooks, cardNumber: "" };

describe("Prizm and Prizm Draft Picks share an insert", () => {
  it("keeps a Draft Picks title for a Prizm Color Blast with the same card #", () => {
    assert.equal(titleMatchesCard(DRAFT_RAW, brooks), true);
    assert.equal(titleMatchesCard(DRAFT_RAW_2, brooks), true);
  });

  it("keeps a plain Prizm title for a card saved as Prizm Draft Picks", () => {
    const saved = { ...brooks, setBrand: "Prizm Draft Picks" };
    assert.equal(titleMatchesCard("2024 Panini Prizm Color Blast Jonathon Brooks #CB-19 Texas", saved), true);
    assert.equal(titleMatchesCard(DRAFT_RAW, saved), true);
  });

  it("still drops another card: wrong number, wrong insert color, wrong player", () => {
    assert.equal(titleMatchesCard(NFL_PRIZM, brooks), false, "the NFL Prizm Color Blast is #14");
    assert.equal(titleMatchesCard(DRAFT_BLACK, brooks), false, "Black Color Blast is another card");
    assert.equal(
      titleMatchesCard("2024 Panini Prizm Draft Picks Color Blast Blake Corum #CB-19", brooks),
      false,
    );
  });

  it("still keeps the two sets apart when the insert is not in play", () => {
    const base = { ...brooks, cardNumber: "136", parallel: "Base" };
    assert.equal(titleMatchesCard("2024 Panini Prizm Draft Picks Jonathon Brooks #136", base), false);
    const silver = { ...brooks, cardNumber: "136", parallel: "Silver" };
    assert.equal(titleMatchesCard("2024 Panini Prizm Draft Picks Jonathon Brooks #136 Silver", silver), false);
    // The insert has to be in the title too.
    assert.equal(titleMatchesCard("2024 Panini Prizm Draft Picks Jonathon Brooks #CB-19", brooks), false);
  });

  it("does not relate other Prizm lines", () => {
    assert.equal(
      titleMatchesCard("2024 Panini Monopoly Prizm Color Blast Jonathon Brooks #CB-19", brooks),
      false,
    );
  });

  it("prices the reported card from the raw Draft Picks sale only", () => {
    const sales = matchComps(brooks, [
      trawlRow("a", DRAFT_RAW, 80, 27),
      trawlRow("b", DRAFT_BLACK, 105.5, 9, { grader: "PSA", grade: "10" }),
      trawlRow("c", NFL_PRIZM, 400, 5),
    ]);
    assert.deepEqual(sales.map((sale) => sale.price), [80]);
  });
});

describe("no card #: the wider insert search", () => {
  it("names the same inserts as the add-card chips", () => {
    assert.deepEqual([...NAMED_INSERTS], POPULAR_INSERTS.map((item) => item.name.toLowerCase()));
  });

  it("is only for a card with a player, a year, a set and a named insert", () => {
    assert.equal(isWideInsertCard(brooksNoNumber), true);
    const flagged: MatchCard = { ...brooksNoNumber, noNumber: true };
    assert.equal(isWideInsertCard(flagged), true);
    assert.equal(isWideInsertCard(brooks), false, "a numbered card uses the normal search");
    assert.equal(isWideInsertCard({ ...brooksNoNumber, parallel: "Silver" }), false);
    assert.equal(isWideInsertCard({ ...brooksNoNumber, parallel: "Base" }), false);
    assert.equal(isWideInsertCard({ ...brooksNoNumber, playerName: "" }), false);
    assert.equal(isWideInsertCard({ ...brooksNoNumber, setBrand: "" }), false);
    assert.equal(isWideInsertCard({ ...brooksNoNumber, year: 0, yearLabel: "" }), false);
  });

  it("searches player, year, brand and the insert words", () => {
    assert.equal(buildSoldSearchQuery(brooksNoNumber), "2024 Panini Prizm Jonathon Brooks Color Blast");
  });

  it("keeps titles that name the same player and insert and agree on one card", () => {
    const sales = matchComps(brooksNoNumber, [
      trawlRow("a", DRAFT_RAW, 80, 27),
      trawlRow("b", DRAFT_RAW_2, 72, 20),
      trawlRow("c", DRAFT_BLACK, 105.5, 9, { grader: "PSA", grade: "10" }),
      trawlRow("d", "2024 Panini Prizm Draft Picks Color Blast Blake Corum #CB-12", 60, 3),
      trawlRow("e", "2024 Panini Prizm Draft Picks Jonathon Brooks #136 Silver", 5, 2),
    ]);
    assert.deepEqual(sales.map((sale) => sale.price).sort(), [72, 80]);
  });

  it("needs the full player name, not just the last name", () => {
    const sales = matchComps(brooksNoNumber, [
      trawlRow("a", "2024 Panini Prizm Draft Picks Color Blast Brooks #CB-19", 80, 27),
      trawlRow("b", "2024 Panini Prizm Draft Picks Color Blast Jordan Brooks #CB-19", 80, 26),
    ]);
    assert.deepEqual(sales, []);
  });

  it("stays open when the titles name two different cards", () => {
    const twoNumbers = matchComps(brooksNoNumber, [
      trawlRow("a", DRAFT_RAW, 80, 27),
      trawlRow("b", NFL_PRIZM, 400, 5),
    ]);
    assert.deepEqual(twoNumbers, [], "#CB-19 and #14 are two cards");

    const twoLines = matchComps(brooksNoNumber, [
      trawlRow("a", "2024 Panini Prizm Draft Picks Color Blast Jonathon Brooks RC Texas", 80, 27),
      trawlRow("b", "2024 Panini Prizm Color Blast Jonathon Brooks RC Panthers", 400, 5),
    ]);
    assert.deepEqual(twoLines, [], "Draft Picks and Prizm with no number to tell them apart");
  });

  it("re-matching the kept sales gives the same list", () => {
    const first = matchComps(brooksNoNumber, [trawlRow("a", DRAFT_RAW, 80, 27), trawlRow("b", DRAFT_RAW_2, 72, 20)]);
    assert.deepEqual(matchComps(brooksNoNumber, first), first);
  });

  it("a card with no number and no named insert still matches nothing", () => {
    const plain = { ...brooksNoNumber, parallel: "Base" };
    assert.deepEqual(matchComps(plain, [trawlRow("a", "2024 Panini Prizm Jonathon Brooks #301 RC", 3, 1)]), []);
  });
});

describe("lookups for a card with no number", () => {
  const card: SoldCompCard = { ...brooksNoNumber, id: "fixture-brooks-no-number" };
  let backend: FakeCompsBackend;
  let gates = 0;
  const gate = async () => {
    gates += 1;
    return true;
  };

  before(() => {
    backend = installFakeCompsBackend();
  });
  after(() => backend.restore());
  beforeEach(() => {
    backend.trawlCalls = 0;
    backend.cache = [];
    gates = 0;
  });

  it("lets a named insert through the guard, and nothing else", () => {
    assert.equal(trawlSkipReason(card), null);
    assert.equal(trawlSkipReason({ ...card, parallel: "Silver" }), "no_number");
    assert.equal(trawlSkipReason({ ...card, parallel: "Base" }), "no_number");
    assert.equal(trawlSkipReason({ ...card, playerName: "" }), "no_number");
    assert.equal(trawlSkipReason({ ...card, sellPrice: 50, sellDate: "2026-10-01" }), "sold");
    assert.equal(
      trawlSkipReason({ ...card, conditionType: "graded", grade: "Gem Mint" }),
      "unparsed_grade",
    );
  });

  it("makes one Trawl call, through the same limiters, and shows the Draft Picks sale", async () => {
    backend.trawlResults = [
      trawlRow("a", DRAFT_RAW, 80, 27),
      trawlRow("b", DRAFT_BLACK, 105.5, 9, { grader: "PSA", grade: "10" }),
    ];
    const { getSoldComps } = await import("./index");
    const result = await getSoldComps(card, { beforeRequest: gate, beforeTrawl: gate });
    assert.ok(result.ok);
    assert.equal(result.payload.count, 1);
    assert.equal(result.payload.median, 80);
    assert.equal(backend.trawlCalls, 1);
    assert.equal(gates, 2);

    const again = await getSoldComps(card, { beforeRequest: gate, beforeTrawl: gate });
    assert.ok(again.ok);
    assert.equal(again.payload.median, 80);
    assert.equal(backend.trawlCalls, 1, "the second read is the cache");
  });

  it("shows no price when the search finds two different cards", async () => {
    backend.trawlResults = [trawlRow("a", DRAFT_RAW, 80, 27), trawlRow("b", NFL_PRIZM, 400, 5)];
    const { getSoldComps } = await import("./index");
    const result = await getSoldComps(card, { beforeRequest: gate, beforeTrawl: gate });
    assert.ok(result.ok);
    assert.equal(result.payload.count, 0);
    assert.equal(result.payload.median, null);
  });

  it("queues a no-number insert card for the daily refresh, not a plain no-number card", () => {
    const row = (id: string, parallel: string): CardRow =>
      ({
        id,
        player: "Jonathon Brooks",
        year: 2024,
        year_label: "2024",
        set: "Panini Prizm",
        set_name: "Panini Prizm",
        parallel,
        card_number: "",
        no_number: false,
        grade: "Raw",
        grader: null,
        condition_type: "raw",
        sell_price: null,
        sell_date: null,
        sold_at: null,
      }) as unknown as CardRow;
    const queue = refreshQueueFromRows([row("insert", "Color Blast"), row("plain", "Base")], []);
    assert.deepEqual(queue.map((item) => item.cardId), ["insert"]);
  });
});
