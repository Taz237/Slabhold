import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  appendCatalogTiles,
  CATALOG_MAX_OFFSET,
  CATALOG_SORTS,
  CATALOG_SPORTS,
  catalogNoMatchText,
  catalogPriceLabel,
  catalogSearch,
  catalogTileFromRow,
  catalogTileName,
  cleanCatalogSearch,
  isTcgRow,
  likesByCard,
  parseCatalogFilters,
  parseCatalogOffset,
  rankByLikes,
  type CatalogTile,
} from "./query";

function tile(id: string, partial: Partial<CatalogTile> = {}): CatalogTile {
  return {
    id,
    href: `/u/ada/cards/${id}`,
    player: "Victor Wembanyama",
    yearLabel: "2023-24",
    setName: "Prizm",
    grade: "PSA 10",
    grader: "PSA",
    conditionType: "graded",
    isRookie: true,
    imageUrl: null,
    accent: "#7c5cff",
    sport: "basketball",
    priceLabel: "",
    ...partial,
  };
}

describe("catalog filters", () => {
  it("offers All plus every sport we support, and three sorts with Newest first", () => {
    assert.deepEqual(
      CATALOG_SPORTS.map((sport) => sport.label),
      ["Baseball", "Basketball", "Football", "Hockey", "Soccer"],
    );
    assert.deepEqual(
      CATALOG_SORTS.map((sort) => sort.label),
      ["Newest", "Most liked", "Graded only"],
    );
  });

  it("reads the URL and falls back to Newest, all sports, no search", () => {
    assert.deepEqual(parseCatalogFilters({}), { sport: null, sort: "newest", q: "" });
    assert.deepEqual(parseCatalogFilters({ sport: "Football", sort: "liked", q: "  Mahomes " }), {
      sport: "football",
      sort: "liked",
      q: "Mahomes",
    });
    assert.deepEqual(parseCatalogFilters({ sport: "pokemon", sort: "cheapest" }), { sport: null, sort: "newest", q: "" });
  });

  it("writes only non-default filters into the URL", () => {
    assert.equal(catalogSearch({ sport: null, sort: "newest", q: "" }), "");
    assert.equal(catalogSearch({ sport: "baseball", sort: "graded", q: "Topps Chrome" }, 48), "?sport=baseball&sort=graded&q=Topps+Chrome&offset=48");
  });

  it("strips anything that could change the database filter", () => {
    assert.equal(cleanCatalogSearch('Prizm,"),id.eq.1'), "Prizm id.eq.1");
    assert.equal(cleanCatalogSearch("Ja'Marr Chase"), "Ja'Marr Chase");
    assert.equal(cleanCatalogSearch("100%_*"), "100");
    assert.equal(cleanCatalogSearch("x".repeat(200)).length, 60);
  });

  it("clamps the offset", () => {
    assert.equal(parseCatalogOffset("-4"), 0);
    assert.equal(parseCatalogOffset("abc"), 0);
    assert.equal(parseCatalogOffset("48"), 48);
    assert.equal(parseCatalogOffset("999999"), CATALOG_MAX_OFFSET);
  });
});

describe("catalog tiles", () => {
  it("builds a tile with player, year and set, linked to the owner's card page", () => {
    const out = catalogTileFromRow(
      { id: "c1", player: "Shohei Ohtani", year: 2018, set: "Topps Chrome", grader: "", condition_type: "raw", sport: "Baseball" },
      "ada",
    );
    assert.equal(out?.href, "/u/ada/cards/c1");
    assert.equal(out?.yearLabel, "2018");
    assert.equal(out?.setName, "Topps Chrome");
    assert.equal(out?.sport, "baseball");
    assert.equal(out?.priceLabel, "");
    assert.equal(catalogTileFromRow({ id: "c1" }, ""), null, "no owner handle, no tile");
  });

  it("shows a value only when there is one, never No value yet", () => {
    assert.equal(catalogPriceLabel(null), "");
    assert.equal(catalogPriceLabel(0), "");
    assert.equal(catalogPriceLabel("abc"), "");
    assert.equal(catalogPriceLabel(35), "$35.00");
    assert.equal(catalogPriceLabel("1250.5"), "$1,250.50");
  });

  it("treats an older row with a grading company as graded", () => {
    const out = catalogTileFromRow({ id: "c2", player: "A", grader: "BGS", grade: "9.5", condition_type: null }, "ben");
    assert.equal(out?.conditionType, "graded");
    assert.equal(out?.grade, "BGS 9.5");
  });

  it("names a tile for screen readers", () => {
    assert.equal(catalogTileName(tile("a", { priceLabel: "$200.00" })), "Victor Wembanyama, 2023-24 Prizm, PSA 10, $200.00");
    assert.equal(catalogTileName(tile("a", { conditionType: "raw", grade: "" })), "Victor Wembanyama, 2023-24 Prizm");
  });

  it("knows a TCG row", () => {
    assert.equal(isTcgRow({ sport: "Pokémon" }), true);
    assert.equal(isTcgRow({ sport: "Other", category: "TCG" }), true);
    assert.equal(isTcgRow({ sport: "Football" }), false);
  });

  it("appends a page without repeating a card already shown", () => {
    const out = appendCatalogTiles([tile("a"), tile("b")], [tile("b"), tile("c")]);
    assert.deepEqual(out.map((t) => t.id), ["a", "b", "c"]);
  });

  it("explains an empty filter", () => {
    assert.equal(catalogNoMatchText({ sport: null, sort: "newest", q: "Mahomes" }), 'No cards match "Mahomes"');
    assert.equal(catalogNoMatchText({ sport: "hockey", sort: "liked", q: "" }), "No liked hockey cards yet");
    assert.equal(catalogNoMatchText({ sport: null, sort: "graded", q: "" }), "No graded cards yet");
  });
});

describe("most liked", () => {
  it("counts a post's likes for each card it shows, once per card", () => {
    const totals = likesByCard(
      [
        { id: "p1", likes: 5, cardId: "a" },
        { id: "p2", likes: 3, cardId: "a" },
        { id: "p3", likes: 2, cardId: null },
        { id: "p4", likes: 0, cardId: "c" },
      ],
      [
        { postId: "p1", cardId: "a" },
        { postId: "p3", cardId: "b" },
        { postId: "p3", cardId: "a" },
      ],
    );
    assert.deepEqual([...totals.entries()].sort(), [
      ["a", 10],
      ["b", 2],
    ]);
  });

  it("ranks by likes, newer card first on a tie", () => {
    const likes = new Map([
      ["a", 2],
      ["b", 5],
      ["c", 2],
    ]);
    const ranked = rankByLikes(
      [
        { id: "a", createdAt: "2026-10-01" },
        { id: "b", createdAt: "2026-09-01" },
        { id: "c", createdAt: "2026-10-05" },
      ],
      likes,
    );
    assert.deepEqual(ranked.map((row) => row.id), ["b", "c", "a"]);
  });
});
