import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { gapMultiple, gradeGaps } from "./grade-gap";
import type { RecentComp } from "./recent";

function recent(player: string, grade: string, median: number | null, extra: Partial<RecentComp["identity"]> = {}): RecentComp {
  const comps =
    median == null ? [] : [{ id: `${player}${grade}`, title: "t", soldPrice: median, soldDate: "2026-11-01", itemId: "i", platform: "eBay", condition: grade, shipping: null, url: "" }];
  return {
    key: `${player}|${grade}|${extra.parallel ?? "Base"}`,
    identity: { playerName: player, year: 2024, yearLabel: "2024", setBrand: "Prizm", cardNumber: "312", parallel: "Base", grade, ...extra },
    catalog: null,
    savedAt: "2026-11-17T00:00:00Z",
    payload: { median, p25: median, p75: median, count: comps.length, source: "trawl", fetchedAt: null, lowConfidence: false, sample: false, comps } as RecentComp["payload"],
  };
}

describe("quick comp grade gap", () => {
  it("pairs a raw and a PSA 10 comp of the same card", () => {
    const { gaps, rest } = gradeGaps([recent("Fixture A", "PSA 10", 158.75), recent("Fixture B", "Raw", 12), recent("Fixture A", "Raw", 1.74)]);
    assert.equal(gaps.length, 1);
    assert.equal(gaps[0].raw.payload.median, 1.74);
    assert.equal(gaps[0].top.payload.median, 158.75);
    assert.deepEqual(
      rest.map((item) => item.identity.playerName),
      ["Fixture B"],
    );
  });

  it("never pairs different cards, parallels or grades other than PSA 10", () => {
    const { gaps, rest } = gradeGaps([
      recent("Fixture A", "PSA 10", 100),
      recent("Fixture A", "Raw", 5, { parallel: "Silver" }),
      recent("Fixture C", "PSA 9", 40),
      recent("Fixture C", "Raw", 4),
    ]);
    assert.equal(gaps.length, 0);
    assert.equal(rest.length, 4);
  });

  it("needs a real price on both sides", () => {
    const { gaps } = gradeGaps([recent("Fixture A", "PSA 10", null), recent("Fixture A", "Raw", 2)]);
    assert.equal(gaps.length, 0);
  });

  it("states the multiple only when the slab is worth at least twice the raw card", () => {
    assert.equal(gapMultiple(1.74, 158.75), "91x");
    assert.equal(gapMultiple(10, 25), "2.5x");
    assert.equal(gapMultiple(10, 15), null);
    assert.equal(gapMultiple(0, 15), null);
  });
});
