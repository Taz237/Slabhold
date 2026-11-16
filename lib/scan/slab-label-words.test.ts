import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadProductData, type ProductRecord } from "@/lib/cards/product-data";
import { SCAN_DIRECTORY } from "@/lib/players/scan-directory";
import { rankScanMatches, type ScanMatch } from "./match";
import { scanReadFrom } from "./session";

/**
 * A slab label's parallel words, read the way graders print them: short forms spelled out, and a
 * parallel named only when the list's name covers every word the label printed. "Orange Pulsar"
 * is never "Orange" on our say-so. Label lines are modeled, not captured.
 */

async function slab(lines: string[], products?: readonly ProductRecord[]): Promise<ScanMatch> {
  const read = scanReadFrom({ lines, backLines: [], kind: "slab", image: null, alternates: null, backAlternates: null, cert: null }, SCAN_DIRECTORY);
  const top = rankScanMatches(read, [], { directory: SCAN_DIRECTORY, products: products ?? (await loadProductData()), soldTitles: [], checklists: [] }).matches[0];
  assert.ok(top);
  return top;
}

const chrome = (variety: string) => ["2025 TOPPS CHROME #306", "JAXSON DART", variety, "GEM MT 10", "PSA", "98765432"];

/** A set whose list has Orange but no Orange Pulsar, like the list a slab falls back to. */
const ORANGE_ONLY: ProductRecord[] = [
  {
    sport: "Football",
    yearLabel: "2025",
    product: "Panini Prizm",
    manufacturer: "Panini",
    parallels: [
      { subset: "Base", name: "Base", serialRun: null },
      { subset: "Base", name: "Silver", serialRun: null },
      { subset: "Base", name: "Orange", serialRun: 249 },
      { subset: "Base", name: "Gold", serialRun: 10 },
    ],
  },
];
const prizm = (variety: string) => ["2025 PANINI PRIZM #332", "JAXSON DART", variety, "GEM MT 10", "PSA", "98765432"];

describe("a parallel is named only when the list's name covers the label's words", () => {
  it("ORANGE PULSAR PRIZM with only Orange in the list keeps the label's words, never 'Orange', sure", async () => {
    const top = await slab(prizm("ORANGE PULSAR PRIZM"), ORANGE_ONLY);
    assert.equal(top.parallel, "Orange Pulsar");
    assert.equal(top.sureness.parallel, "likely");
    // Never the /249 of a parallel the label didn't name.
    assert.equal(top.serialRun, null);
  });

  it("the whole name in the list is still sure", async () => {
    assert.equal((await slab(prizm("ORANGE PRIZM"), ORANGE_ONLY)).parallel, "Orange");
    assert.equal((await slab(prizm("ORANGE PRIZM"), ORANGE_ONLY)).sureness.parallel, "sure");
    const silver = await slab(prizm("SILVER PRIZM"), ORANGE_ONLY);
    assert.equal(silver.parallel, "Silver");
    assert.equal(silver.sureness.parallel, "sure");
  });

  it("'Refractor' after a color is the same parallel: GOLD REFRACTOR is the list's Gold", async () => {
    const top = await slab(chrome("GOLD REFRACTOR"));
    assert.match(top.parallel, /^Gold( Refractor)?$/);
    assert.equal(top.sureness.parallel, "sure");
  });

  it("a word the list doesn't have beside one it does: GOLD WAVE is not Gold or Wave", async () => {
    const top = await slab(prizm("GOLD WAVE PRIZM"), ORANGE_ONLY);
    assert.equal(top.parallel, "Gold Wave");
    assert.equal(top.sureness.parallel, "likely");
    assert.equal(top.serialRun, null);
  });
});

describe("short forms on a label are spelled out", () => {
  for (const [label, want] of [
    ["REF.", "Refractor"],
    ["REF", "Refractor"],
    ["REFR.", "Refractor"],
    ["XFRACTOR", "X-Fractor"],
    ["X-FRACTOR", "X-Fractor"],
    ["PRISM REF.", "Prism Refractor"],
  ] as const) {
    it(`${label} is ${want}`, async () => {
      const top = await slab(chrome(label));
      assert.equal(top.parallel, want);
      assert.equal(top.sureness.parallel, "sure");
    });
  }

  it("GLD REF is Gold, BLU REF is Blue, GRN is Green, PRPL is Purple, ORNG is Orange, BLK is Black, PNK is Pink", async () => {
    for (const [label, want] of [["GLD REF", "Gold"], ["BLU REF.", "Blue"], ["GRN", "Green"], ["PRPL", "Purple"], ["ORNG", "Orange"], ["BLK", "Black"], ["PNK", "Pink"]] as const) {
      const top = await slab(chrome(label));
      assert.match(top.parallel, new RegExp(`^${want}( Refractor)?$`), label);
    }
  });

  it("SLV PRZM and SLVR PRIZM are Silver", async () => {
    assert.equal((await slab(prizm("SLV PRZM"), ORANGE_ONLY)).parallel, "Silver");
    assert.equal((await slab(prizm("SLVR PRIZM"), ORANGE_ONLY)).parallel, "Silver");
  });

  it("a short form we don't know stays the label's own word, marked likely: never Base", async () => {
    const top = await slab(chrome("ZZQ"));
    assert.equal(top.parallel, "Zzq");
    assert.equal(top.sureness.parallel, "likely");
  });
});

describe("a cert read with a slip is not a parallel word", () => {
  it("SILVER PRIZM beside '4567B912' is still Silver, sure", async () => {
    const top = await slab(["PSA", "2018 PANINI PRIZM", "LUKA DONCIC", "SILVER PRIZM", "GEM MT 10", "4567B912"]);
    assert.equal(top.parallel, "Silver");
    assert.equal(top.sureness.parallel, "sure");
  });
});
