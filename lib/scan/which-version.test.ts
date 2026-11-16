import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadChecklistsFor } from "@/lib/cards/checklist-load";
import { loadProductData, type ProductRecord } from "@/lib/cards/product-data";
import { SCAN_DIRECTORY } from "@/lib/players/scan-directory";
import { CONFIRM_COPY, confirmMatch, initialChoice, parallelHint, readyToSave } from "./confirm";
import { rankScanMatches, scanChecklistKey, type ScanMatch } from "./match";
import { scanReadFrom } from "./session";

/**
 * A slab whose label names no parallel is never saved as Base on our say-so. A base label prints
 * no variety line, and so does a label whose variety line didn't read: the two look the same.
 * So the parallel stays open and the sheet asks "Which version?" with the closest ones.
 */

async function slab(lines: string[], products?: readonly ProductRecord[]): Promise<ScanMatch> {
  const read = scanReadFrom({ lines, backLines: [], kind: "slab", image: null, alternates: null, backAlternates: null, cert: null }, SCAN_DIRECTORY);
  const key = scanChecklistKey(read, SCAN_DIRECTORY);
  const checklists = key ? await loadChecklistsFor(key) : [];
  const top = rankScanMatches(read, [], { directory: SCAN_DIRECTORY, products: products ?? (await loadProductData()), soldTitles: [], checklists }).matches[0];
  assert.ok(top);
  return top;
}

const names = (match: ScanMatch) => match.parallelOptions.map((option) => option.name);

describe("a slab label that names no parallel", () => {
  it("Dart, the variety line missed: the parallel is open, with Base, Refractor and X-Fractor to pick from", async () => {
    const top = await slab(["2025 TOPPS CHROME #306", "JAXSON DART", "GEM MT 10", "PSA", "98765432"]);
    assert.equal(top.playerName, "Jaxson Dart");
    assert.equal(top.cardNumber, "306");
    assert.equal(top.parallel, "");
    assert.equal(top.sureness.parallel, "unsure");
    assert.deepEqual(names(top).slice(0, 3), ["Base", "Refractor", "X-Fractor"]);
    assert.ok(names(top).length >= 3 && names(top).length <= 5, names(top).join(", "));
    // Only look-alikes: no color is offered for a card whose label named none.
    assert.ok(!names(top).some((name) => /gold|red|blue|green|pink|purple|orange|sepia/i.test(name)), names(top).join(", "));
  });

  it("the same label with X-FRACTOR read is still X-Fractor, sure", async () => {
    const top = await slab(["2025 TOPPS CHROME #306", "JAXSON DART", "X-FRACTOR", "GEM MT 10", "PSA", "98765432"]);
    assert.equal(top.parallel, "X-Fractor");
    assert.equal(top.sureness.parallel, "sure");
  });

  it("a set with a checklist offers that year's unnumbered look-alikes: Prizm shows Base and Silver", async () => {
    const top = await slab(["2024 PANINI PRIZM #329", "DRAKE MAYE", "GEM MT 10", "PSA", "98765433"]);
    assert.equal(top.parallel, "");
    assert.equal(names(top)[0], "Base");
    assert.ok(names(top).includes("Silver"), names(top).join(", "));
    assert.ok(names(top).length <= 5);
    assert.ok(top.parallelOptions.every((option) => option.serialRun == null));
  });

  it("a set with no look-alikes is still open: Base first, then its unnumbered colors, never a numbered one", async () => {
    const products: ProductRecord[] = [
      {
        sport: "Football",
        yearLabel: "2025",
        product: "Topps Chrome",
        manufacturer: "Topps",
        parallels: [
          { subset: "Base", name: "Base", serialRun: null },
          { subset: "Base", name: "Pink Wave", serialRun: null },
          { subset: "Base", name: "Green", serialRun: null },
          { subset: "Base", name: "Gold", serialRun: 50 },
          { subset: "Base", name: "Red", serialRun: 5 },
        ],
      },
    ];
    const top = await slab(["2025 TOPPS CHROME #306", "JAXSON DART", "GEM MT 10", "PSA", "98765432"], products);
    assert.equal(top.parallel, "");
    assert.equal(top.sureness.parallel, "unsure");
    assert.deepEqual(names(top), ["Base", "Green", "Pink Wave"]);
  });

  it("a set whose list has nothing but Base and numbered parallels: just Base to pick, never Base on our say-so", async () => {
    const products: ProductRecord[] = [
      {
        sport: "Football",
        yearLabel: "2025",
        product: "Topps Chrome",
        manufacturer: "Topps",
        parallels: [
          { subset: "Base", name: "Base", serialRun: null },
          { subset: "Base", name: "Gold", serialRun: 50 },
          { subset: "Base", name: "Red", serialRun: 5 },
        ],
      },
    ];
    const top = await slab(["2025 TOPPS CHROME #306", "JAXSON DART", "GEM MT 10", "PSA", "98765432"], products);
    assert.equal(top.parallel, "");
    assert.equal(top.sureness.parallel, "unsure");
    assert.deepEqual(names(top), ["Base"]);
    // The sheet asks, and nothing saves in one tap until Base (or Something else) is picked.
    assert.equal(initialChoice(top), null);
    assert.equal(parallelHint(top, null, false), CONFIRM_COPY.whichVersion);
    assert.equal(readyToSave(top), false);
  });

  it("a numbered label with no parallel named is still open, and never offers Base", async () => {
    const top = await slab(["2025 TOPPS CHROME #306", "JAXSON DART", "12/50", "GEM MT 10", "PSA", "98765432"]);
    assert.equal(top.parallel, "");
    assert.equal(top.serialRun, 50);
    assert.ok(!names(top).includes("Base"));
  });
});

describe("a set with no parallel list", () => {
  it("before 1993: Base and Something else only (1986-87 Fleer printed no parallels)", async () => {
    const top = await slab(["1986 FLEER #57", "MICHAEL JORDAN", "NM-MT 8", "PSA", "10234567"]);
    assert.equal(top.parallel, "");
    assert.equal(top.sureness.parallel, "unsure");
    assert.deepEqual(names(top), ["Base"]);
  });

  it("before 1993, a family list for modern products is ignored: a 1986 Donruss slab offers Base only, never Press Proofs", async () => {
    const top = await slab(["1986 DONRUSS #72", "KIRBY PUCKETT", "NM-MT 8", "PSA", "10234569"]);
    assert.equal(top.setBrand.toLowerCase().includes("donruss"), true);
    assert.equal(top.parallel, "");
    assert.equal(top.sureness.parallel, "unsure");
    assert.deepEqual(names(top), ["Base"]);
  });

  it("1993 on, a family list still applies: a 2023 Donruss slab offers its Press Proofs", async () => {
    const top = await slab(["2023 DONRUSS #301", "C.J. STROUD", "GEM MT 10", "PSA", "10234570"], []);
    assert.equal(top.parallel, "");
    assert.ok(names(top).length > 1, names(top).join(", "));
  });

  it("1993 on keeps the general list: a 1993 Finest can be a Refractor", async () => {
    const top = await slab(["1993 FINEST #1", "MICHAEL JORDAN", "GEM MT 10", "PSA", "10234568"]);
    assert.equal(top.parallel, "");
    assert.equal(names(top)[0], "Base");
    assert.ok(names(top).includes("Refractor"), names(top).join(", "));
  });

  it("a vintage set we do have a list for keeps its list", async () => {
    const products: ProductRecord[] = [
      {
        sport: "Basketball",
        yearLabel: "1986-87",
        product: "Fleer",
        manufacturer: "Fleer",
        parallels: [
          { subset: "Base", name: "Base", serialRun: null },
          { subset: "Base", name: "Fixture Glossy", serialRun: null },
        ],
      },
    ];
    const top = await slab(["1986 FLEER #57", "MICHAEL JORDAN", "NM-MT 8", "PSA", "10234567"], products);
    assert.deepEqual(names(top), ["Base", "Fixture Glossy"]);
  });
});

describe("the sheet asks, and nothing is saved until a version is picked", () => {
  it("no chip is preselected, the hint is 'Which version?', and one tap can't save it", async () => {
    const top = await slab(["2025 TOPPS CHROME #306", "JAXSON DART", "GEM MT 10", "PSA", "98765432"]);
    assert.equal(initialChoice(top), null);
    assert.equal(CONFIRM_COPY.whichVersion, "Which version?");
    assert.equal(parallelHint(top, null, false), CONFIRM_COPY.whichVersion);
    assert.equal(readyToSave(top), false);
  });

  it("a raw card with the parallel open keeps 'Pick the parallel'; a pick or 'Something else' clears the hint", async () => {
    const top = await slab(["2025 TOPPS CHROME #306", "JAXSON DART", "GEM MT 10", "PSA", "98765432"]);
    const raw: ScanMatch = { ...top, grade: null };
    assert.equal(parallelHint(raw, null, false), CONFIRM_COPY.pickParallel);
    assert.equal(parallelHint(top, { name: "X-Fractor", serialRun: null }, false), null);
    assert.equal(parallelHint(top, null, true), null);
  });

  it("picking X-Fractor makes it X-Fractor, sure, and ready to save", async () => {
    const top = await slab(["2025 TOPPS CHROME #306", "JAXSON DART", "GEM MT 10", "PSA", "98765432"]);
    const result = confirmMatch(top, { name: "X-Fractor", serialRun: null }, "");
    assert.ok("match" in result);
    assert.equal(result.match.parallel, "X-Fractor");
    assert.equal(result.match.sureness.parallel, "sure");
    assert.equal(readyToSave(result.match), true);
  });
});
