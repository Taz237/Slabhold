import "@/lib/test/server-only-stub";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadProductData } from "@/lib/cards/product-data";
import type { TrawlSoldResult } from "@/lib/comps/types";
import { quickCompCacheKey } from "./cache";
import { quickCompUrl } from "./client";
import { quickCompIdentityKey, toMatchCard, type QuickCompIdentity } from "./identity";
import { getQuickComp, type QuickCompDeps } from "./lookup";
import { parseQuickCompParams } from "./respond";
import { quickCompVersions, withVersion } from "./versions";

const dart: QuickCompIdentity = {
  playerName: "Jaxson Dart",
  year: 2025,
  yearLabel: "2025",
  setBrand: "Topps Chrome",
  cardNumber: "306",
  parallel: "Base",
  grade: "PSA 10",
};

const names = (list: readonly { name: string }[]) => list.map((item) => item.name);

describe("Quick Comp versions", () => {
  it("a set with no checklist offers its family's list, Base first: Base, Refractor, X-Fractor", async () => {
    const list = quickCompVersions(await loadProductData(), { ...dart, sport: "Football" });
    assert.deepEqual(names(list).slice(0, 3), ["Base", "Refractor", "X-Fractor"]);
    assert.ok(list.every((item) => item.serialRun === null));
  });

  it("a set with a checklist offers that year's parallels with their runs", async () => {
    const list = quickCompVersions(await loadProductData(), { yearLabel: "2025-26", setBrand: "Panini Prizm", cardNumber: "103", sport: "Basketball" });
    assert.equal(list[0].name, "Base");
    assert.deepEqual(list.find((item) => item.name === "Orange Pulsar"), { name: "Orange Pulsar", serialRun: 175 });
    assert.equal(list.find((item) => item.name === "Silver")?.serialRun, null);
  });

  it("no sport (a typed card): one product for the year and set is used; two that disagree on a run leave it open", async () => {
    const data = await loadProductData();
    const typed = quickCompVersions(data, { yearLabel: "2025-26", setBrand: "Prizm", cardNumber: "103" });
    assert.ok(names(typed).includes("Orange Pulsar"));
    const two = quickCompVersions(
      [
        { sport: "Football", yearLabel: "2025", product: "Fixture Chrome", manufacturer: "Fixture", parallels: [{ subset: "Base", name: "Gold", serialRun: 50 }, { subset: "Base", name: "Red", serialRun: 5 }] },
        { sport: "Baseball", yearLabel: "2025", product: "Fixture Chrome", manufacturer: "Fixture", parallels: [{ subset: "Base", name: "Gold", serialRun: 10 }, { subset: "Base", name: "Red", serialRun: 5 }] },
      ],
      { yearLabel: "2025", setBrand: "Fixture Chrome", cardNumber: "1" },
    );
    assert.deepEqual(two, [
      { name: "Base", serialRun: null },
      { name: "Gold", serialRun: null },
      { name: "Red", serialRun: 5 },
    ]);
  });

  it("the picked version is always in the list, right after Base", () => {
    const list = quickCompVersions(null, { ...dart }, { parallel: "Orange Geometric", serialRun: 25 });
    assert.deepEqual(list[1], { name: "Orange Geometric", serialRun: 25 });
    assert.equal(quickCompVersions(null, { ...dart }, { parallel: "x fractor" }).filter((item) => /fractor/i.test(item.name) && /^x/i.test(item.name)).length, 1);
  });

  it("before the checklists load, the family list still shows", () => {
    assert.deepEqual(names(quickCompVersions(null, dart)).slice(0, 3), ["Base", "Refractor", "X-Fractor"]);
  });

  it("picking a version sets the parallel and its run, and Base clears the run", () => {
    const pulsar = withVersion({ ...dart, setBrand: "Panini Prizm" }, { name: "Orange Pulsar", serialRun: 175 });
    assert.equal(pulsar.parallel, "Orange Pulsar");
    assert.equal(pulsar.serialRun, 175);
    const base = withVersion(pulsar, { name: "Base", serialRun: null });
    assert.equal(base.parallel, "Base");
    assert.equal(base.serialRun, null);
  });
});

describe("the version travels with the lookup", () => {
  it("the URL carries the parallel and the run, and the route reads them back", () => {
    const identity = withVersion({ ...dart, yearLabel: "2025-26", setBrand: "Panini Prizm", cardNumber: "103" }, { name: "Orange Pulsar", serialRun: 175 });
    const url = new URL(quickCompUrl(identity), "http://localhost");
    assert.equal(url.searchParams.get("parallel"), "Orange Pulsar");
    assert.equal(url.searchParams.get("run"), "175");
    const parsed = parseQuickCompParams(url.searchParams);
    assert.ok(parsed.ok);
    assert.equal(parsed.identity.parallel, "Orange Pulsar");
    assert.equal(parsed.identity.serialRun, 175);
    assert.equal(new URL(quickCompUrl(dart), "http://localhost").searchParams.has("run"), false);
  });

  it("a run that is not a whole number from 1 to 99999 is refused", () => {
    for (const run of ["0", "-5", "abc", "1.5", "100000"]) {
      const params = new URLSearchParams({ player: "Jaxson Dart", year: "2025", run });
      assert.equal(parseQuickCompParams(params).ok, false, run);
    }
  });

  it("each version and run is its own cache entry, under a new key so older mixed results are not reused", () => {
    const xf = withVersion(dart, { name: "X-Fractor", serialRun: null });
    assert.notEqual(quickCompIdentityKey(dart), quickCompIdentityKey(xf));
    assert.notEqual(quickCompIdentityKey(withVersion(dart, { name: "Gold", serialRun: 50 })), quickCompIdentityKey(withVersion(dart, { name: "Gold", serialRun: null })));
    assert.match(quickCompCacheKey(dart), /^quick-comp-v2\|/);
  });

  it("the matcher gets the run; a named version with no known run takes sales at any run", () => {
    assert.equal(toMatchCard(withVersion(dart, { name: "Gold", serialRun: 50 })).serialRun, 50);
    const gold = withVersion(dart, { name: "Gold", serialRun: null });
    assert.equal(toMatchCard(gold, { openRun: true }).anyRun, true);
    // The scanner's lookups never open the run: no run read means no numbered sale counted.
    assert.equal(toMatchCard(gold).anyRun, undefined);
    assert.equal(toMatchCard(dart, { openRun: true }).anyRun, undefined);
    assert.equal(toMatchCard(dart).serialRun, undefined);
  });
});

/** The Nov 16 miss: Base PSA 10 showed X-Fractor sales, and the photo was an X-Fractor slab. Titles modeled. */
function sold(id: string, title: string, price: number, grade: string | null = "10"): TrawlSoldResult {
  return {
    title,
    sale_price: price,
    shipping_price: 0,
    currency: "$",
    condition: "Graded",
    condition_raw: null,
    date_sold: "2026-11-10T18:00:00.000Z",
    buying_format: "Auction",
    item_id: id,
    item_link: `https://www.ebay.com/itm/${id}`,
    image_url: `https://i.ebayimg.com/images/g/${id}/s-l500.jpg`,
    details: { listing_state: "sold", grading: { graded: grade != null, grader: grade ? "PSA" : null, grade, condition: null } },
  };
}

const DART_SOLDS = [
  sold("base1", "2025 Topps Chrome Jaxson Dart #306 RC PSA 10 Giants", 60),
  sold("base2", "2025 Topps Chrome Football Jaxson Dart Rookie #306 PSA 10 GEM MINT", 64),
  sold("base3", "Jaxson Dart 2025 Topps Chrome #306 Rookie Card PSA 10", 58),
  sold("xf1", "2025 Topps Chrome Jaxson Dart X-Fractor #306 RC PSA 10", 150),
  sold("xf2", "2025 Topps Chrome Jaxson Dart #306 X-Fractor Rookie PSA 10 GEM MINT", 160),
  sold("xf3", "2025 Topps Chrome Football Jaxson Dart Xfractor RC #306 PSA 10", 155),
  sold("xf4", "Jaxson Dart 2025 Topps Chrome X Fractor #306 PSA 10", 148),
  sold("ref1", "2025 Topps Chrome Jaxson Dart #306 Refractor RC PSA 10", 95),
  sold("gold1", "2025 Topps Chrome Jaxson Dart #306 Gold Refractor /50 PSA 10", 900),
  sold("nine", "2025 Topps Chrome Jaxson Dart #306 RC PSA 9", 30, "9"),
  sold("raw", "2025 Topps Chrome Jaxson Dart #306 RC", 12, null),
];

function deps(): Partial<QuickCompDeps> {
  return {
    source: () => "trawl",
    hasTrawlKey: () => true,
    fetchSold: (async () => ({ ok: true, body: { results: DART_SOLDS } })) as unknown as QuickCompDeps["fetchSold"],
    limits: { consumeDaily: async () => true, consumeHourly: async () => true },
    cache: ((load: () => Promise<unknown>) => load) as QuickCompDeps["cache"],
    now: () => Date.parse("2026-11-16T12:00:00.000Z"),
  };
}

async function comp(identity: QuickCompIdentity) {
  const result = await getQuickComp(identity, "fixture-user", deps());
  assert.ok(result.ok);
  return result.payload;
}

describe("Jaxson Dart 2025 Topps Chrome #306 PSA 10, by version", () => {
  it("Base: the 3 base PSA 10 sales, no X-Fractor, Refractor, Gold, PSA 9 or raw, and a base photo", async () => {
    const payload = await comp(dart);
    assert.deepEqual(payload.comps.map((item) => item.itemId).sort(), ["base1", "base2", "base3"]);
    assert.ok(payload.median != null && payload.median < 70);
    assert.match(payload.photo?.itemId ?? "", /^base[123]$/);
  });

  it("X-Fractor: the 4 X-Fractor PSA 10 sales in every spelling, and an X-Fractor photo", async () => {
    const payload = await comp(withVersion(dart, { name: "X-Fractor", serialRun: null }));
    assert.deepEqual(payload.comps.map((item) => item.itemId).sort(), ["xf1", "xf2", "xf3", "xf4"]);
    assert.match(payload.photo?.itemId ?? "", /^xf[1234]$/);
  });

  it("Refractor: only the Refractor sale. Gold: only the Gold /50", async () => {
    assert.deepEqual((await comp(withVersion(dart, { name: "Refractor", serialRun: null }))).comps.map((item) => item.itemId), ["ref1"]);
    assert.deepEqual((await comp(withVersion(dart, { name: "Gold", serialRun: null }))).comps.map((item) => item.itemId), ["gold1"]);
    assert.deepEqual((await comp(withVersion(dart, { name: "Gold", serialRun: 50 }))).comps.map((item) => item.itemId), ["gold1"]);
    assert.deepEqual((await comp(withVersion(dart, { name: "Gold", serialRun: 25 }))).comps, []);
  });
});
