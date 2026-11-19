import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SoldsState } from "./comp";
import {
  HIT_BUDGET_MS,
  HIT_FULL_BUDGET_MS,
  HIT_SHAKE_MS,
  NO_STREAK,
  hitFor,
  hitLabel,
  hitPlan,
  hitTotalMs,
  matchedSaleCents,
  shakeOffset,
  streakAfterScan,
  streakShown,
  streakWithLateHit,
  type Hit,
} from "./hit";
import type { ScanMatch } from "./match";
import { PREVIEW_SLAB } from "./preview-fixtures";

const card = (over: Partial<ScanMatch> = {}): ScanMatch => ({ ...PREVIEW_SLAB, grade: null, parallel: "Silver", serialRun: null, serialNo: "", isAuto: false, isRelic: false, ...over });

const sold = (dollars: number, more: number[] = []): Extract<SoldsState, { status: "done" }> => ({
  status: "done",
  query: "fixture",
  comp: {
    status: "ok",
    sales: [dollars, ...more].map((price) => ({ priceCents: price * 100, soldAt: "2026-11-01" })),
    nSales: 1 + more.length,
    medianCents: null,
    lowCents: null,
    highCents: null,
    trend: null,
    asOf: null,
    source: "live",
  },
});

describe("hitFor: is it a hit, which effect, how strong", () => {
  it("a plain card with a small sale is not a hit", () => {
    assert.equal(hitFor(card(), sold(12)), null);
    assert.equal(hitFor(card({ serialRun: 99 }), sold(99)), null);
    assert.equal(hitFor(null), null);
  });

  it("a 1/1 gets the crystal at full strength", () => {
    assert.deepEqual(hitFor(card({ serialRun: 1, serialNo: "1" })), { effect: "shatter", strength: 3, reasons: ["one-of-one"] });
  });

  it("a 1/1 auto is still the crystal: the rarest rule wins", () => {
    const hit = hitFor(card({ serialRun: 1, isAuto: true }));
    assert.equal(hit?.effect, "shatter");
    assert.equal(hit?.strength, 3);
  });

  it("/10 or lower gets the crystal, a step down from a 1/1", () => {
    assert.deepEqual(hitFor(card({ serialRun: 10 })), { effect: "shatter", strength: 2, reasons: ["low-serial"] });
    assert.equal(hitFor(card({ serialRun: 5 }))?.effect, "shatter");
    assert.equal(hitFor(card({ serialRun: 11 }))?.effect, "pixel");
  });

  it("an auto gets the storm; a patch auto, a low serial or a $100 sale makes it bigger", () => {
    assert.deepEqual(hitFor(card({ isAuto: true })), { effect: "storm", strength: 1, reasons: ["auto"] });
    assert.deepEqual(hitFor(card({ isAuto: true, isRelic: true })), { effect: "storm", strength: 2, reasons: ["patch-auto"] });
    assert.equal(hitFor(card({ isAuto: true, serialRun: 25 }))?.strength, 2);
    assert.equal(hitFor(card({ isAuto: true }), sold(150))?.strength, 2);
    assert.equal(hitFor(card({ isAuto: true, serialRun: 99 }), sold(40))?.strength, 1);
  });

  it("a patch with no auto is not a hit on its own", () => {
    assert.equal(hitFor(card({ isRelic: true })), null);
  });

  it("/25 or lower gets the pixels; /26 does not", () => {
    assert.deepEqual(hitFor(card({ serialRun: 25 })), { effect: "pixel", strength: 1, reasons: ["serial"] });
    assert.equal(hitFor(card({ serialRun: 26 })), null);
  });

  it("a matched sale of $100 or more gets the pixels; $99.99 does not", () => {
    assert.deepEqual(hitFor(card(), sold(100)), { effect: "pixel", strength: 1, reasons: ["sale"] });
    assert.equal(hitFor(card(), { ...sold(100), comp: { ...sold(99).comp, sales: [{ priceCents: 99_99, soldAt: null }] } } as SoldsState), null);
    assert.equal(hitFor(card({ serialRun: 25 }), sold(240))?.strength, 2);
  });

  it("only the newest sale counts, and only a real one", () => {
    assert.equal(hitFor(card(), sold(20, [500])), null);
    assert.equal(hitFor(card(), { status: "looking" }), null);
    assert.equal(hitFor(card(), { status: "done", query: null, comp: { status: "none" } }), null);
    // Two sales more than 10x apart are not a clean price.
    const unclean = sold(900, [20]);
    assert.equal(hitFor(card(), { ...unclean, comp: { ...unclean.comp, unclean: true } } as SoldsState), null);
  });

  it("a sale never counts while the card's version is open: it could be another version's", () => {
    assert.equal(matchedSaleCents(card({ parallel: "" }), sold(400)), null);
    assert.equal(hitFor(card({ parallel: "" }), sold(400)), null);
    assert.equal(matchedSaleCents(card(), sold(400)), 400_00);
  });

  it("a serial run of 0 or less is no serial", () => {
    assert.equal(hitFor(card({ serialRun: 0 })), null);
  });

  it("says why on the sheet", () => {
    assert.equal(hitLabel(hitFor(card({ serialRun: 1 })) as Hit, card({ serialRun: 1 })), "1/1");
    assert.equal(hitLabel(hitFor(card({ serialRun: 10 })) as Hit, card({ serialRun: 10 })), "Numbered /10");
    assert.equal(hitLabel(hitFor(card({ isAuto: true, isRelic: true })) as Hit, card()), "Patch auto");
    assert.equal(hitLabel(hitFor(card(), sold(100)) as Hit, card()), "Sold for $100 or more");
  });
});

describe("hitPlan: the effect's clock", () => {
  const hits: Hit[] = [
    { effect: "pixel", strength: 1, reasons: ["sale"] },
    { effect: "pixel", strength: 2, reasons: ["serial", "sale"] },
    { effect: "storm", strength: 1, reasons: ["auto"] },
    { effect: "storm", strength: 2, reasons: ["patch-auto"] },
    { effect: "shatter", strength: 2, reasons: ["low-serial"] },
  ];

  it("every hit but a 1/1 fits inside the normal reveal's 1.6s", () => {
    for (const hit of hits) assert.ok(hitTotalMs(hitPlan(hit)) <= HIT_BUDGET_MS, `${hit.effect} ${hit.strength}`);
  });

  it("a 1/1 and the first hit ever run longer, never past 2.5s", () => {
    const full = hitPlan({ effect: "shatter", strength: 3, reasons: ["one-of-one"] });
    assert.ok(hitTotalMs(full) > HIT_BUDGET_MS && hitTotalMs(full) <= HIT_FULL_BUDGET_MS);
    for (const hit of hits) {
      const first = hitPlan(hit, { first: true });
      assert.equal(first.first, true);
      assert.ok(hitTotalMs(first) <= HIT_FULL_BUDGET_MS);
      assert.ok(first.durationMs > hitPlan(hit).durationMs);
    }
  });

  it("the rarer the card, the longer the build, the harder the shake and the stronger the buzz", () => {
    const [quick, big, full] = ([1, 2, 3] as const).map((strength) => hitPlan({ effect: "shatter", strength, reasons: [] }));
    assert.ok(quick.impactMs < big.impactMs && big.impactMs < full.impactMs);
    assert.deepEqual([quick.shakePx, big.shakePx, full.shakePx], [4, 6, 8]);
    assert.deepEqual([quick.impactHaptic, big.impactHaptic, full.impactHaptic], ["hit", "hitBig", "hitFull"]);
  });

  it("the hit and its shake end before the effect does", () => {
    for (const hit of hits) {
      const plan = hitPlan(hit);
      assert.ok(plan.impactMs + plan.shakeMs <= plan.durationMs + 1);
    }
  });

  it("the build haptics all come before the hit: a crack, a rumble, or ticks", () => {
    assert.deepEqual(hitPlan(hits[4]).buildHaptics.map((item) => item.moment), ["lock"]);
    assert.deepEqual(hitPlan(hits[2]).buildHaptics.map((item) => item.moment), ["sweep"]);
    const pixel = hitPlan(hits[0]);
    assert.ok(pixel.buildHaptics.length >= 3 && pixel.buildHaptics.every((item) => item.moment === "tick" && item.atMs < pixel.impactMs));
    // The ticks slow down as the card comes together.
    const gaps = pixel.buildHaptics.slice(1).map((item, index) => item.atMs - pixel.buildHaptics[index].atMs);
    assert.ok(gaps.every((gap, index) => index === 0 || gap >= gaps[index - 1]));
  });
});

describe("shakeOffset", () => {
  it("is still before the hit and after 250ms", () => {
    assert.deepEqual(shakeOffset(-1, 8), { x: 0, y: 0 });
    assert.deepEqual(shakeOffset(HIT_SHAKE_MS, 8), { x: 0, y: 0 });
    assert.deepEqual(shakeOffset(100, 0), { x: 0, y: 0 });
  });

  it("never moves further than its size, and dies away", () => {
    for (const px of [4, 6, 8]) {
      let early = 0;
      let late = 0;
      for (let ms = 0; ms < HIT_SHAKE_MS; ms += 4) {
        const { x, y } = shakeOffset(ms, px);
        assert.ok(Math.abs(x) <= px && Math.abs(y) <= px);
        if (ms < 80) early = Math.max(early, Math.abs(x));
        if (ms > 190) late = Math.max(late, Math.abs(x));
      }
      assert.ok(early > px * 0.5, "it starts hard");
      assert.ok(late < px * 0.1, "it ends soft");
    }
  });

  it("a bigger hit shakes harder", () => {
    assert.ok(Math.abs(shakeOffset(0, 8).x) > Math.abs(shakeOffset(0, 4).x));
  });
});

describe("hit streak", () => {
  it("counts hits scanned back-to-back and ends on anything else", () => {
    let streak = NO_STREAK;
    streak = streakAfterScan(streak, true);
    assert.equal(streak.count, 1);
    streak = streakAfterScan(streak, true);
    streak = streakAfterScan(streak, true);
    assert.equal(streak.count, 3);
    streak = streakAfterScan(streak, false);
    assert.equal(streak.count, 0);
    streak = streakAfterScan(streak, true);
    assert.equal(streak.count, 1);
  });

  it("shows from the second hit in a row", () => {
    assert.equal(streakShown(NO_STREAK), null);
    assert.equal(streakShown(streakAfterScan(NO_STREAK, true)), null);
    assert.equal(streakShown(streakAfterScan(streakAfterScan(NO_STREAK, true), true)), 2);
  });

  it("a sale that lands late turns the last scan into a hit and keeps the streak", () => {
    let streak = streakAfterScan(streakAfterScan(NO_STREAK, true), true);
    // The third scan looked plain when it landed...
    streak = streakAfterScan(streak, false);
    assert.equal(streak.count, 0);
    // ...then its $100 sale came in.
    streak = streakWithLateHit(streak);
    assert.equal(streak.count, 3);
    // Counting it twice changes nothing.
    assert.equal(streakWithLateHit(streak).count, 3);
  });
});
