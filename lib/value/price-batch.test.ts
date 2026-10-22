import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SoldCompCard } from "@/lib/comps/types";
import { fallbackSales, newestBatchRows, type CachedCompRow } from "@/lib/value/price-batch";

const CARD: SoldCompCard = {
  id: "card-1",
  playerName: "J.J. McCarthy",
  year: 2024,
  setBrand: "Donruss",
  cardNumber: "303",
  parallel: "Optic Preview Pink",
  conditionType: "raw",
  grade: "Raw",
};

const TITLE = "2024 Donruss JJ McCarthy Optic Preview Pink Prizm RC #303";
const NEWEST = "2026-10-02T12:00:00.000Z";
const OLDER = "2026-09-01T12:00:00.000Z";

function row(partial: Partial<CachedCompRow> & Pick<CachedCompRow, "item_id" | "price">): CachedCompRow {
  return {
    title: TITLE,
    currency: "USD",
    sold_at: "2026-10-01T00:00:00.000Z",
    grader: null,
    grade: null,
    url: "",
    fetched_at: NEWEST,
    ...partial,
  };
}

describe("fallback sales batch", () => {
  it("keeps only the newest fetched_at batch", () => {
    const rows = [
      row({ item_id: "old", price: 9, fetched_at: OLDER, sold_at: "2026-08-01T00:00:00.000Z" }),
      row({ item_id: "new-a", price: 40, sold_at: "2026-10-01T00:00:00.000Z" }),
      row({ item_id: "new-b", price: 50, sold_at: "2026-10-02T00:00:00.000Z" }),
      row({ item_id: "__empty__", price: 0, fetched_at: NEWEST }),
    ];
    assert.deepEqual(
      newestBatchRows(rows).map((item) => item.item_id),
      ["new-a", "new-b"],
    );
    const sales = fallbackSales(CARD, rows, new Set());
    assert.deepEqual(
      sales.map((sale) => sale.price),
      [40, 50],
    );
  });

  it("drops the owner's flagged item and a sale that does not match the card", () => {
    const rows = [
      row({ item_id: "keep", price: 40 }),
      row({ item_id: "flagged", price: 44, sold_at: "2026-10-03T00:00:00.000Z" }),
      row({
        item_id: "graded",
        price: 80,
        title: `${TITLE} PSA 10`,
        grader: "PSA",
        grade: "10",
        sold_at: "2026-10-04T00:00:00.000Z",
      }),
      row({
        item_id: "other",
        price: 15,
        title: "2020 Topps Chrome Mike Trout PSA 10 #1",
        grader: "PSA",
        grade: "10",
      }),
    ];
    const sales = fallbackSales(CARD, rows, new Set(["flagged"]));
    assert.deepEqual(
      sales.map((sale) => sale.price),
      [40],
    );
  });
});
