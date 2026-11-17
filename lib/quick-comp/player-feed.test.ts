import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { feedChips, fillFromSale, filterSales, NO_FILTERS, quickGradeOf, sortSales, toggleChip, wantsPlayerSuggestions, type PlayerSale } from "./player-feed";

function sale(id: string, extra: Partial<PlayerSale> = {}): PlayerSale {
  return { id, title: id, price: 10, soldAt: "2026-11-10", photo: null, grade: "Raw", company: "raw", year: null, set: null, number: null, auto: false, run: null, parallel: null, ...extra };
}

const SALES = [
  sale("a", { price: 50, soldAt: "2026-11-01", year: "2025-26", set: "Prizm", company: "PSA", grade: "PSA 10" }),
  sale("b", { price: 900, soldAt: "2026-11-12", year: "2025", set: "Bowman Chrome", auto: true, run: 99, parallel: "Gold Refractor" }),
  sale("c", { price: 5, soldAt: "2026-11-05", year: "2025-26", set: "Prizm" }),
];

describe("Player mode: feed sort, filters and chips", () => {
  it("sorts newest, highest and lowest", () => {
    assert.deepEqual(sortSales(SALES, "newest").map((row) => row.id), ["b", "c", "a"]);
    assert.deepEqual(sortSales(SALES, "highest").map((row) => row.id), ["b", "a", "c"]);
    assert.deepEqual(sortSales(SALES, "lowest").map((row) => row.id), ["c", "a", "b"]);
  });

  it("chips only for what's in the sales", () => {
    const labels = feedChips(SALES).map((chip) => chip.label);
    assert.deepEqual(labels, ["Raw", "PSA", "Auto", "Numbered", "Parallel", "2025-26", "2025", "Prizm", "Bowman Chrome"]);
  });

  it("filters stack, and the same chip twice clears it", () => {
    const chips = feedChips(SALES);
    const prizm = chips.find((chip) => chip.label === "Prizm")!;
    const raw = chips.find((chip) => chip.label === "Raw")!;
    let filters = toggleChip(prizm, NO_FILTERS);
    assert.deepEqual(filterSales(SALES, filters).map((row) => row.id), ["a", "c"]);
    filters = toggleChip(raw, filters);
    assert.deepEqual(filterSales(SALES, filters).map((row) => row.id), ["c"]);
    filters = toggleChip(prizm, filters);
    assert.equal(filters.set, null);
    const parallel = chips.find((chip) => chip.label === "Parallel")!;
    assert.deepEqual(filterSales(SALES, toggleChip(parallel, NO_FILTERS)).map((row) => row.id), ["b"]);
  });

  it("Comp this card fills only what the title printed", () => {
    assert.deepEqual(fillFromSale("Darius Acuff Jr.", SALES[1]), {
      player: "Darius Acuff Jr.",
      year: "2025",
      set: "Bowman Chrome",
      number: "",
      parallel: "Gold Refractor",
      serialRun: 99,
      grade: "Raw",
    });
    assert.equal(fillFromSale("X", sale("d")).parallel, "Base");
    assert.equal(quickGradeOf({ grade: "PSA 10", company: "PSA" }), "PSA 10");
    assert.equal(quickGradeOf({ grade: "BGS 9.5", company: "BGS" }), "BGS 9.5");
    assert.equal(quickGradeOf({ grade: "Graded", company: "other" }), null);
    assert.equal(quickGradeOf({ grade: "PSA 11", company: "PSA" }), null);
  });

  it("names ask for players; card searches with numbers don't", () => {
    assert.equal(wantsPlayerSuggestions("darius"), true);
    assert.equal(wantsPlayerSuggestions("d"), false);
    assert.equal(wantsPlayerSuggestions("2023 prizm"), false);
  });
});

describe("Player mode: reading the wire", () => {
  it("ready, limited, error and offline", async () => {
    const { fetchPlayerFeed, readPlayerSuggestions } = await import("./player-feed");
    const seen: string[] = [];
    const ready = await fetchPlayerFeed("Darius Acuff Jr.", async (url) => (seen.push(url), Response.json({ player: "Darius Acuff Jr.", sales: [SALES[0], { bad: true }], fetchedAt: null })));
    assert.equal(ready.status, "ready");
    if (ready.status === "ready") assert.equal(ready.body.sales.length, 1);
    assert.equal(seen[0], "/api/quick-comp/player?q=Darius+Acuff+Jr.");
    const limited = await fetchPlayerFeed("x", async () => Response.json({ reason: "daily", resetAt: "t" }, { status: 429 }));
    assert.deepEqual(limited, { status: "limited", reason: "daily", resetAt: "t" });
    assert.deepEqual(await fetchPlayerFeed("x", async () => Promise.reject(new Error("down"))), { status: "error" });
    assert.deepEqual(await fetchPlayerFeed("x", async () => Response.json({})), { status: "error" });
    assert.deepEqual(await fetchPlayerFeed("x", async () => Response.json({}), () => false), { status: "offline" });
    assert.deepEqual(readPlayerSuggestions({ suggestions: [{ label: "Acuff auto", player: "Darius Acuff Jr.", filter: { auto: true, evil: 1 } }, { label: 3 }] }), [
      { label: "Acuff auto", player: "Darius Acuff Jr.", filter: { auto: true } },
    ]);
  });
});

describe("Player mode: stale suggestions", () => {
  it("shows only the suggestions fetched for exactly what's typed", async () => {
    const { currentPlayerItems, sameFilter } = await import("./player-feed");
    const players = { query: "acuff", items: [{ label: "Darius Acuff Jr.", player: "Darius Acuff Jr." }] };
    assert.equal(currentPlayerItems(players, "acuff").length, 1);
    assert.equal(currentPlayerItems(players, " acuff ").length, 1);
    assert.deepEqual(currentPlayerItems(players, "acuf"), []);
    assert.deepEqual(currentPlayerItems(players, "cooper"), []);
    assert.deepEqual(currentPlayerItems(players, "acuff 2025"), []);
    assert.equal(sameFilter({ auto: true }, { auto: true }), true);
    assert.equal(sameFilter({}, undefined), true);
    assert.equal(sameFilter({ auto: true }, { set: "Prizm" }), false);
  });
});
