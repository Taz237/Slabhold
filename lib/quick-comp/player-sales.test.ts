import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { TrawlSoldResult } from "@/lib/comps/types";
import { SCAN_DIRECTORY } from "@/lib/players/scan-directory";
import { playerSalesFrom, saleGrade, titleIsAuto, titleSet, titleYear } from "./player-sales";

function sale(title: string, extra: Partial<TrawlSoldResult> = {}): TrawlSoldResult {
  return {
    title,
    sale_price: 25,
    shipping_price: null,
    currency: "USD",
    condition: "",
    condition_raw: null,
    date_sold: "2026-11-10T00:00:00Z",
    buying_format: "auction",
    item_id: title,
    item_link: "",
    image_url: "https://i.ebayimg.com/images/g/abc/s-l500.jpg",
    ...extra,
  };
}

const PLAYER = "Darius Acuff Jr.";

describe("Player mode: sold titles to feed rows", () => {
  it("reads only what the title prints", () => {
    const [row] = playerSalesFrom([sale("2025-26 Bowman Chrome U Darius Acuff Jr. Auto Gold Refractor /50 PSA 10")], PLAYER, SCAN_DIRECTORY);
    assert.equal(row.year, "2025-26");
    assert.equal(row.set, "Bowman Chrome");
    assert.equal(row.auto, true);
    assert.equal(row.run, 50);
    assert.equal(row.grade, "PSA 10");
    assert.equal(row.company, "PSA");
    assert.match(row.parallel ?? "", /gold/i);
    assert.equal(row.photo, "https://i.ebayimg.com/images/g/abc/s-l500.jpg");
  });

  it("never claims a parallel the title doesn't show", () => {
    const rows = playerSalesFrom(
      [sale("2025 Bowman Chrome Darius Acuff Jr. 1st Bowman #BCP-12", { item_id: "a" }), sale("Darius Acuff Jr. rookie card /99", { item_id: "b" })],
      PLAYER,
      SCAN_DIRECTORY,
    );
    assert.equal(rows.length, 2);
    for (const row of rows) assert.equal(row.parallel, null, row.title);
    const numbered = rows.find((row) => row.run === 99)!;
    assert.equal(numbered.year, null, "no year printed, none claimed");
    assert.equal(numbered.set, null);
  });

  it("drops lots, other players, bad photos and zero prices", () => {
    const rows = playerSalesFrom(
      [
        sale("Darius Acuff Jr. lot of 5", { item_id: "1" }),
        sale("Cooper Flagg Prizm", { item_id: "2" }),
        sale("Acuff Jr. Prizm", { item_id: "3", sale_price: 0 }),
        sale("Acuff Prizm Silver", { item_id: "4", image_url: "http://evil.test/x.jpg" }),
      ],
      PLAYER,
      SCAN_DIRECTORY,
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].photo, null);
    assert.equal(rows[0].parallel, "Silver");
  });

  it("grades: raw, a grader with no number, Beckett as BGS", () => {
    assert.deepEqual(saleGrade(sale("Acuff Prizm")), { grade: "Raw", company: "raw" });
    assert.deepEqual(saleGrade(sale("Acuff Prizm BGS 9.5")), { grade: "BGS 9.5", company: "BGS" });
    assert.equal(saleGrade(sale("Acuff Prizm SGC 10")).company, "SGC");
    assert.equal(saleGrade(sale("Acuff Prizm CGC 9")).company, "other");
  });

  it("year, set and auto words", () => {
    assert.equal(titleYear("2024 Topps Chrome 88/99"), "2024");
    assert.equal(titleYear("Prizm 88/2023"), null);
    assert.equal(titleYear("2023/24 Prizm"), "2023-24");
    assert.equal(titleSet("Panini Donruss Optic Rated Rookie"), "Optic");
    assert.equal(titleSet("Topps Chrome Update"), "Topps Chrome Update");
    assert.equal(titleIsAuto("On-card autograph"), true);
    assert.equal(titleIsAuto("Prizm no auto"), false);
  });
});
