import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { RecentComp } from "@/lib/quick-comp/recent";
import { CompsEmpty, RecentComps, ScanHero, setLine } from "./comp-home";
import { railSales, RAIL_LIMIT } from "./slabhold-rail";

function recent(player: string, grade: string, median: number | null, photo = false): RecentComp {
  const comps =
    median == null ? [] : [{ id: `${player}${grade}`, title: "t", soldPrice: median, soldDate: "2026-11-01", itemId: "i", platform: "eBay", condition: grade, shipping: null, url: "" }];
  return {
    key: `${player}|${grade}`,
    identity: { playerName: player, year: 2024, yearLabel: "2024", setBrand: "Prizm", cardNumber: "312", parallel: "Base", grade },
    catalog: null,
    savedAt: "2026-11-17T00:00:00Z",
    payload: {
      median,
      p25: median,
      p75: median,
      count: comps.length,
      source: "trawl",
      fetchedAt: null,
      lowConfidence: false,
      sample: false,
      comps,
      photo: photo ? { url: "https://i.ebayimg.com/images/g/x/s-l500.jpg", itemId: "i", soldAt: "2026-11-01" } : null,
    } as RecentComp["payload"],
  };
}

const noop = () => {};

describe("quick comp home", () => {
  it("leads with the scan hero, linked to the scanner", () => {
    const html = renderToStaticMarkup(createElement(ScanHero, { href: "/scan?for=comp", title: "Scan a card", body: "Snap it and see what it sold for" }));
    assert.match(html, /href="\/scan\?for=comp"/);
    assert.match(html, /data-scan-hero/);
    assert.match(html, /Open camera/);
    assert.match(html, /qc-scan-line/);
  });

  it("shows the grade gap when a card was comped raw and in a PSA 10", () => {
    const html = renderToStaticMarkup(
      createElement(RecentComps, { items: [recent("Fixture A", "PSA 10", 158.75), recent("Fixture A", "Raw", 1.74), recent("Fixture B", "PSA 9", 46, true)], onOpen: noop }),
    );
    assert.match(html, /data-grade-gap/);
    assert.match(html, /Raw \$1\.74 to PSA 10 \$158\.75/);
    assert.match(html, />91x</);
    // The paired comps live in the gap card, not again in the grid.
    assert.equal(html.split("Fixture A").length - 1, 1 + 1);
    assert.match(html, /data-comp-thumb="photo"/);
    assert.match(html, /loading="lazy"/);
    assert.match(html, /data-grade-chip="graded"/);
  });

  it("draws a placeholder slab, never a broken image, when a comp has no photo", () => {
    const html = renderToStaticMarkup(createElement(RecentComps, { items: [recent("Fixture C", "Raw", 12)], onOpen: noop }));
    assert.match(html, /data-comp-thumb="none"/);
    assert.doesNotMatch(html, /<img/);
    assert.match(html, /\$12\.00/);
    assert.match(html, /data-grade-chip="raw"/);
  });

  it("says no recent sales instead of $0", () => {
    const html = renderToStaticMarkup(createElement(RecentComps, { items: [recent("Fixture D", "Raw", null)], onOpen: noop }));
    assert.match(html, /No recent sales/);
    assert.doesNotMatch(html, /\$0/);
  });

  it("has a designed empty state", () => {
    const html = renderToStaticMarkup(createElement(CompsEmpty));
    assert.match(html, /data-quick-comp-state="idle"/);
    assert.match(html, /Your comps land here/);
  });

  it("names the set, number and version", () => {
    assert.equal(setLine({ playerName: "x", year: 2024, yearLabel: "2024", setBrand: "Prizm", cardNumber: "7", parallel: "Silver", grade: "Raw" }), "2024 Prizm #7 Silver");
  });

  it("only rails real public cards, and nothing when there are none", () => {
    assert.deepEqual(railSales(null), []);
    assert.deepEqual(railSales({ sales: [] }), []);
    assert.deepEqual(railSales({ sales: [{ kind: "card", href: "/sample" }] }), []);
    const tile = (i: number) => ({
      kind: "card",
      cardId: `c${i}`,
      href: `/u/fixture/cards/c${i}`,
      player: "Fixture",
      detail: "",
      yearLabel: "2024",
      setBrand: "Prizm",
      grade: "Raw",
      grader: "",
      conditionType: "raw",
      isRookie: false,
      imageUrl: null,
      accent: "",
      priceCents: 100,
      priceLabel: "$1",
      percent: null,
      percentLabel: null,
    });
    assert.equal(railSales({ sales: Array.from({ length: 14 }, (_, i) => tile(i)) }).length, RAIL_LIMIT);
  });

  it("keeps banned words out of the new copy", () => {
    for (const path of ["components/quick-comp/comp-home.tsx", "components/quick-comp/slabhold-rail.tsx"]) {
      const text = readFileSync(join(process.cwd(), path), "utf8")
        .split("\n")
        .filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("*") && !line.trim().startsWith("/*"))
        .join("\n");
      const strings = text.match(/"[^"]*"|`[^`]*`|>[^<>{}]+</g) ?? [];
      for (const value of strings) {
        assert.doesNotMatch(value, /\b(best|AI|free|number one|flip)\b/i, `${path}: ${value}`);
      }
    }
  });
});
