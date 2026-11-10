import "@/lib/test/server-only-stub";
import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { installFakeCompsBackend, trawlRow, type FakeCompsBackend } from "@/lib/test/fake-comps-backend";
import { buildQueryKey } from "./query-key";
import { trawlSkipReason } from "./lookup-guard";
import type { SoldCompCard } from "./types";
import type { CardRow } from "@/lib/social/cards";

const TITLE = "2023-24 Panini Prizm Victor Wembanyama #136";

const raw: SoldCompCard = {
  id: "fixture-raw",
  playerName: "Victor Wembanyama",
  year: 2023,
  yearLabel: "2023-24",
  setBrand: "Panini Prizm",
  cardNumber: "136",
  parallel: "Base",
  conditionType: "raw",
  grade: "Raw",
};

const graded: SoldCompCard = { ...raw, id: "fixture-psa", conditionType: "graded", grade: "PSA 10" };
const sold: SoldCompCard = { ...raw, id: "fixture-sold", sellPrice: 120, sellDate: "2026-10-01" };
const soldAt: SoldCompCard = { ...raw, id: "fixture-sold-at", soldAt: "2026-10-01T00:00:00.000Z" };
const noNumber: SoldCompCard = { ...raw, id: "fixture-no-number", cardNumber: "" };
const flaggedNoNumber: SoldCompCard = { ...raw, id: "fixture-flag-no-number", cardNumber: "", noNumber: true };
const unparsed: SoldCompCard = { ...raw, id: "fixture-bad-grade", conditionType: "graded", grade: "Gem Mint" };

let backend: FakeCompsBackend;
let gates = 0;
const gate = async () => {
  gates += 1;
  return true;
};

before(() => {
  backend = installFakeCompsBackend();
  backend.trawlResults = [trawlRow("item-1", TITLE, 40, 1), trawlRow("item-2", TITLE, 44, 2)];
});

after(() => backend.restore());

beforeEach(() => {
  backend.trawlCalls = 0;
  backend.cache = [];
  gates = 0;
});

describe("trawlSkipReason", () => {
  it("names sold, no-number, and unparsed-grade cards", () => {
    assert.equal(trawlSkipReason(sold), "sold");
    assert.equal(trawlSkipReason(soldAt), "sold");
    assert.equal(trawlSkipReason(noNumber), "no_number");
    assert.equal(trawlSkipReason(flaggedNoNumber), "no_number");
    assert.equal(trawlSkipReason(unparsed), "unparsed_grade");
  });

  it("lets a numbered raw card and a recognized grade through", () => {
    assert.equal(trawlSkipReason(raw), null);
    assert.equal(trawlSkipReason(graded), null);
    assert.equal(trawlSkipReason({ ...raw, conditionType: undefined, grade: "BGS 9.5" }), null);
  });
});

describe("getSoldComps before a paid call", () => {
  for (const card of [sold, soldAt, noNumber, unparsed]) {
    it(`does not call Trawl or the limiters for ${card.id}`, async () => {
      const { getSoldComps } = await import("./index");
      const result = await getSoldComps(card, { beforeRequest: gate, beforeTrawl: gate });
      assert.equal(result.ok, false);
      assert.ok(!result.ok && "unavailable" in result && result.skipped);
      assert.equal(backend.trawlCalls, 0);
      assert.equal(gates, 0, "no budget spent");
    });
  }

  it("still returns stored comps for a skipped card", async () => {
    const { getSoldComps } = await import("./index");
    backend.cache = [
      {
        card_id: sold.id,
        query_key: buildQueryKey(sold),
        item_id: "stored-1",
        title: TITLE,
        price: 50,
        currency: "USD",
        sold_at: "2026-09-01T00:00:00.000Z",
        grader: null,
        grade: null,
        url: null,
        fetched_at: "2026-09-02T00:00:00.000Z",
      },
    ];
    const result = await getSoldComps(sold, { beforeRequest: gate, beforeTrawl: gate });
    assert.ok(result.ok);
    assert.equal(result.payload.median, 50);
    assert.equal(backend.trawlCalls, 0);
    assert.equal(gates, 0);
  });

  it("calls Trawl on a cache miss for a numbered raw card", async () => {
    const { getSoldComps } = await import("./index");
    const result = await getSoldComps(raw, { beforeRequest: gate, beforeTrawl: gate });
    assert.ok(result.ok);
    assert.equal(backend.trawlCalls, 1);
    assert.equal(gates, 2);
  });

  it("calls Trawl on a cache miss for a recognized grade", async () => {
    const { getSoldComps } = await import("./index");
    const result = await getSoldComps(graded, { beforeTrawl: gate });
    assert.ok(result.ok);
    assert.equal(backend.trawlCalls, 1);
  });
});

function row(id: string, extra: Partial<CardRow> = {}): CardRow {
  return {
    id,
    card_number: "136",
    no_number: false,
    grade: "Raw",
    grader: null,
    condition_type: "raw",
    sell_price: null,
    sell_date: null,
    sold_at: null,
    ...extra,
  } as CardRow;
}

describe("refresh queue", () => {
  it("leaves out cards a lookup cannot help, before the budget is taken", async () => {
    const { refreshQueueFromRows } = await import("@/lib/value/getCardValue");
    const { takeRefreshBatch } = await import("@/lib/value/refresh-queue");
    const rows = [
      row("sold", { sell_price: 120, sell_date: "2026-10-01" }),
      row("sold-at", { sold_at: "2026-10-01T00:00:00.000Z" }),
      row("no-number", { card_number: "" }),
      row("flag-no-number", { no_number: true }),
      row("bad-grade", { condition_type: "graded", grade: "Gem Mint" }),
      row("raw"),
      row("psa", { condition_type: "graded", grade: "10", grader: "PSA" }),
    ];
    const queue = refreshQueueFromRows(rows, [{ card_id: "raw", matched_at: "2026-10-01T00:00:00.000Z" }]);
    assert.deepEqual(queue.map((card) => card.cardId).sort(), ["psa", "raw"]);
    const { picked } = takeRefreshBatch(queue, 2);
    assert.deepEqual(picked.map((card) => card.cardId), ["psa", "raw"]);
  });

  it("queues every card when the guard columns could not be read", async () => {
    const { refreshQueueFromRows } = await import("@/lib/value/getCardValue");
    const queue = refreshQueueFromRows([{ id: "a" } as CardRow, { id: "b" } as CardRow], [], { guard: false });
    assert.deepEqual(queue.map((card) => card.cardId), ["a", "b"]);
  });
});
