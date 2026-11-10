import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import { createLookupGate, type QuickCompOutcome } from "@/lib/quick-comp/client";
import { quickCompIdentityKey, type QuickCompIdentity } from "@/lib/quick-comp/identity";
import type { QuickCompPayload } from "@/lib/quick-comp/lookup";
import {
  REVIEW_VALUE_LATER_LABEL,
  REVIEW_VALUE_LOADING_LABEL,
  REVIEW_VALUE_SETTLE_MS,
  createReviewValueLookup,
  reviewValueIdentity,
  reviewValueView,
  type ReviewValueAnswers,
} from "@/lib/cards/review-value";
import { NOT_ENOUGH_SALES_LABEL, VALUE_UNAVAILABLE_LABEL } from "@/lib/value/format";

const maxey: ReviewValueAnswers = {
  playerName: "Tyrese Maxey",
  yearLabel: "2024-25",
  setBrand: "Donruss Optic",
  cardNumber: "7",
  noNumber: false,
  parallel: "Downtown",
  gradeCompany: "Raw",
  gradeNumber: "",
};

function payload(overrides: Partial<QuickCompPayload> = {}): QuickCompPayload {
  return {
    comps: [
      { id: "a", title: "Maxey Downtown", soldPrice: 120, soldDate: "2026-10-01" },
      { id: "b", title: "Maxey Downtown", soldPrice: 140, soldDate: "2026-10-20" },
      { id: "c", title: "Maxey Downtown", soldPrice: 130, soldDate: "2026-10-10" },
      { id: "d", title: "Maxey Downtown", soldPrice: 110, soldDate: "2026-09-01" },
    ].map((comp) => ({ ...comp, itemId: comp.id, platform: "eBay" as const, condition: "Raw", shipping: null, url: "" })),
    history: [],
    median: 125,
    p25: 115,
    p75: 135,
    count: 4,
    source: "trawl",
    cached: true,
    fetchedAt: "2026-11-01T00:00:00.000Z",
    query: "maxey downtown",
    lowConfidence: false,
    sample: false,
    photo: null,
    ...overrides,
  };
}

const ready = (p: QuickCompPayload): QuickCompOutcome => ({ status: "ready", payload: p });

describe("reviewValueIdentity: only a complete card is looked up", () => {
  it("builds the Quick Comp identity from the flow answers", () => {
    assert.deepEqual(reviewValueIdentity(maxey), {
      playerName: "Tyrese Maxey",
      year: 2024,
      yearLabel: "2024-25",
      setBrand: "Donruss Optic",
      cardNumber: "7",
      parallel: "Downtown",
      grade: "Raw",
    });
  });

  it("keeps a recognized graded grade and Base", () => {
    const identity = reviewValueIdentity({ ...maxey, parallel: "Base", gradeCompany: "PSA", gradeNumber: "10" });
    assert.equal(identity?.grade, "PSA 10");
    assert.equal(identity?.parallel, "Base");
  });

  it("is null for no number: a whole-set search is noisy", () => {
    assert.equal(reviewValueIdentity({ ...maxey, noNumber: true }), null);
    assert.equal(reviewValueIdentity({ ...maxey, cardNumber: "" }), null);
  });

  it("is null for a grade that does not parse", () => {
    assert.equal(reviewValueIdentity({ ...maxey, gradeCompany: "PSA", gradeNumber: "" }), null);
    assert.equal(reviewValueIdentity({ ...maxey, gradeCompany: "PSA", gradeNumber: "eleven" }), null);
    assert.equal(reviewValueIdentity({ ...maxey, gradeCompany: "", gradeNumber: "" }), null);
  });

  it("is null without a player, a real year, a set or a parallel", () => {
    assert.equal(reviewValueIdentity({ ...maxey, playerName: " " }), null);
    assert.equal(reviewValueIdentity({ ...maxey, yearLabel: "soon" }), null);
    assert.equal(reviewValueIdentity({ ...maxey, setBrand: "" }), null);
    assert.equal(reviewValueIdentity({ ...maxey, parallel: "" }), null);
  });
});

describe("reviewValueView: what Review shows", () => {
  const identity = reviewValueIdentity(maxey)!;
  const key = quickCompIdentityKey(identity);
  const loading = { key, status: "loading" as const };

  it("is a calm loading line while the lookup is out", () => {
    const view = reviewValueView({ enabled: true, identity, state: loading });
    assert.equal(view.kind, "loading");
    assert.equal(view.text, REVIEW_VALUE_LOADING_LABEL);
    assert.equal(REVIEW_VALUE_LOADING_LABEL, "Finding recent sales…");
    assert.doesNotMatch(view.text, /\$/);
  });

  it("treats an answer for another card as still loading", () => {
    const view = reviewValueView({ enabled: true, identity, state: { key: "other", status: "done", outcome: ready(payload()) } });
    assert.equal(view.kind, "loading");
  });

  it("says Worth about with the median and up to 3 recent sold prices, newest first", () => {
    const view = reviewValueView({ enabled: true, identity, state: { key, status: "done", outcome: ready(payload()) } });
    assert.equal(view.kind, "ok");
    assert.equal(view.text, "Worth about $125.00 based on 4 recent sales.");
    assert.ok(view.kind === "ok");
    assert.deepEqual(view.sales.map((sale) => sale.priceText), ["$140.00", "$130.00", "$120.00"]);
    assert.equal(view.caption, "Recent sold prices via Trawl");
    assert.doesNotMatch(view.caption, /ebay/i);
  });

  it("says one recent sale in the singular", () => {
    const one = payload({ median: 90, count: 1, comps: payload().comps.slice(0, 1) });
    const view = reviewValueView({ enabled: true, identity, state: { key, status: "done", outcome: ready(one) } });
    assert.equal(view.text, "Worth about $90.00 based on 1 recent sale.");
  });

  it("says Not enough sales yet when nothing matched, with no dollar figure", () => {
    for (const empty of [
      payload({ median: null, count: 0, comps: [] }),
      payload({ median: 0, count: 0, comps: [] }),
      payload({ median: 0, count: 3 }),
    ]) {
      const view = reviewValueView({ enabled: true, identity, state: { key, status: "done", outcome: ready(empty) } });
      assert.equal(view.kind, "no_sales");
      assert.equal(view.text, NOT_ENOUGH_SALES_LABEL);
      assert.doesNotMatch(view.text, /\$/);
    }
  });

  it("holds back one cheap sale on a premium card", () => {
    const cheap = payload({ median: 4, count: 1, comps: payload().comps.slice(0, 1) });
    const view = reviewValueView({
      enabled: true,
      identity,
      state: { key, status: "done", outcome: ready(cheap) },
      card: { isAuto: true },
    });
    assert.equal(view.kind, "no_sales");
  });

  it("never shows $0 on a failed, limited or offline lookup", () => {
    const outcomes: QuickCompOutcome[] = [
      { status: "error" },
      { status: "offline" },
      { status: "limited", reason: "daily", resetAt: null },
      { status: "limited", reason: "hourly", resetAt: "2026-11-10T12:00:00.000Z" },
    ];
    for (const outcome of outcomes) {
      const view = reviewValueView({ enabled: true, identity, state: { key, status: "done", outcome } });
      assert.equal(view.kind, "unavailable");
      assert.equal(view.text, VALUE_UNAVAILABLE_LABEL);
      assert.doesNotMatch(view.text, /\$/);
    }
  });

  it("never shows sample or off dollars as a market value", () => {
    for (const fixture of [
      payload({ source: "sample", sample: true }),
      payload({ source: "off", sample: true }),
      payload({ source: "trawl", sample: true }),
      payload({ source: "sample", sample: false }),
    ]) {
      const view = reviewValueView({ enabled: true, identity, state: { key, status: "done", outcome: ready(fixture) } });
      assert.equal(view.kind, "later");
      assert.equal(view.text, REVIEW_VALUE_LATER_LABEL);
      assert.doesNotMatch(view.text, /\$/);
    }
  });

  it("is the quiet later line when Quick Comp is off, and hidden for an incomplete card", () => {
    assert.equal(reviewValueView({ enabled: false, identity, state: loading }).kind, "later");
    assert.equal(reviewValueView({ enabled: true, identity: null, state: { key: null, status: "idle" } }).kind, "hidden");
  });
});

describe("createReviewValueLookup: debounced, shared, one call per identity", () => {
  const identity = reviewValueIdentity(maxey)!;
  const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

  function harness(run: (identity: QuickCompIdentity) => Promise<QuickCompOutcome>) {
    const calls: string[] = [];
    const gate = createLookupGate((id) => {
      calls.push(`${id.parallel}|${id.grade}`);
      return run(id);
    });
    const lookup = createReviewValueLookup({ lookup: gate.lookup });
    return { calls, lookup };
  }

  it("waits 400ms before the first call, and never calls without an identity", async () => {
    assert.equal(REVIEW_VALUE_SETTLE_MS, 400);
    mock.timers.enable({ apis: ["setTimeout"] });
    try {
      const { calls, lookup } = harness(async () => ready(payload()));
      lookup.request(null);
      assert.equal(lookup.snapshot().status, "idle");
      lookup.request(identity);
      assert.equal(lookup.snapshot().status, "loading");
      mock.timers.tick(399);
      assert.equal(calls.length, 0);
      mock.timers.tick(1);
      assert.equal(calls.length, 1);
      await flush();
      assert.equal(lookup.snapshot().status, "done");
    } finally {
      mock.timers.reset();
    }
  });

  it("does not look up again for the same identity (caption, visibility, photo do not change it)", async () => {
    mock.timers.enable({ apis: ["setTimeout"] });
    try {
      const { calls, lookup } = harness(async () => ready(payload()));
      lookup.request(identity);
      mock.timers.tick(400);
      await flush();
      lookup.request({ ...identity });
      lookup.request(reviewValueIdentity({ ...maxey })!);
      mock.timers.tick(1000);
      await flush();
      assert.equal(calls.length, 1);
    } finally {
      mock.timers.reset();
    }
  });

  it("changing parallel then grade fast looks up only the settled identity, once", async () => {
    mock.timers.enable({ apis: ["setTimeout"] });
    try {
      const { calls, lookup } = harness(async () => ready(payload()));
      lookup.request(identity);
      mock.timers.tick(100);
      lookup.request({ ...identity, parallel: "Kaboom" });
      mock.timers.tick(100);
      lookup.request({ ...identity, parallel: "Kaboom", grade: "PSA 10" });
      mock.timers.tick(400);
      await flush();
      assert.deepEqual(calls, ["Kaboom|PSA 10"]);
    } finally {
      mock.timers.reset();
    }
  });

  it("clears the old price as soon as the identity changes", async () => {
    mock.timers.enable({ apis: ["setTimeout"] });
    try {
      const { lookup } = harness(async () => ready(payload()));
      lookup.request(identity);
      mock.timers.tick(400);
      await flush();
      assert.equal(lookup.snapshot().status, "done");
      lookup.request({ ...identity, grade: "PSA 9" });
      assert.equal(lookup.snapshot().status, "loading", "never a previous card's price");
    } finally {
      mock.timers.reset();
    }
  });

  it("shares an in-flight request and drops a late answer for an old identity", async () => {
    mock.timers.enable({ apis: ["setTimeout"] });
    try {
      let resolve!: (outcome: QuickCompOutcome) => void;
      const { calls, lookup } = harness(() => new Promise((done) => (resolve = done)));
      lookup.request(identity);
      mock.timers.tick(400);
      const other = { ...identity, grade: "PSA 10" };
      lookup.request(other);
      lookup.request(identity);
      mock.timers.tick(400);
      assert.equal(calls.length, 1, "second request for the same card shares the first");
      resolve(ready(payload()));
      await flush();
      assert.equal(lookup.snapshot().status, "done");

      // A late answer for a card no longer on screen is dropped.
      let late!: (outcome: QuickCompOutcome) => void;
      const slow = harness(() => new Promise((done) => (late = done)));
      slow.lookup.request(other);
      mock.timers.tick(400);
      slow.lookup.request(identity);
      late(ready(payload({ median: 999 })));
      await flush();
      assert.equal(slow.lookup.snapshot().status, "loading");
    } finally {
      mock.timers.reset();
    }
  });

  it("reuses a good answer when they come back to Review, but retries a failure", async () => {
    mock.timers.enable({ apis: ["setTimeout"] });
    try {
      let outcome: QuickCompOutcome = ready(payload());
      const { calls, lookup } = harness(async () => outcome);
      lookup.request(identity);
      mock.timers.tick(400);
      await flush();
      lookup.release();
      lookup.request(identity);
      assert.equal(lookup.snapshot().status, "done", "instant on a revisit");
      assert.equal(calls.length, 1);

      outcome = { status: "error" };
      const bad = { ...identity, parallel: "Kaboom" };
      lookup.request(bad);
      mock.timers.tick(400);
      await flush();
      lookup.release();
      lookup.request(bad);
      mock.timers.tick(400);
      await flush();
      assert.equal(calls.length, 3, "a failure is not cached");
    } finally {
      mock.timers.reset();
    }
  });

  it("release cancels a pending lookup, so leaving Review fast spends nothing", async () => {
    mock.timers.enable({ apis: ["setTimeout"] });
    try {
      const { calls, lookup } = harness(async () => ready(payload()));
      lookup.request(identity);
      mock.timers.tick(200);
      lookup.release();
      mock.timers.tick(1000);
      await flush();
      assert.equal(calls.length, 0);
    } finally {
      mock.timers.reset();
    }
  });

  it("notifies subscribers on each change", async () => {
    mock.timers.enable({ apis: ["setTimeout"] });
    try {
      const { lookup } = harness(async () => ready(payload()));
      const seen: string[] = [];
      const stop = lookup.subscribe(() => seen.push(lookup.snapshot().status));
      lookup.request(identity);
      mock.timers.tick(400);
      await flush();
      stop();
      assert.deepEqual(seen, ["loading", "done"]);
    } finally {
      mock.timers.reset();
    }
  });
});
