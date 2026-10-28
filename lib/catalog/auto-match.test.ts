import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { CatalogCard } from "@/lib/card-catalog";
import {
  CATALOG_MATCH_DEBOUNCE_MS,
  CATALOG_MISSING_NOTE,
  bestCatalogMatch,
  catalogMatchKey,
  catalogMatchQuery,
  catalogMatchView,
  matchForApply,
  type CatalogMatchForm,
} from "@/lib/catalog/auto-match";
import { catalogPickFields } from "@/lib/catalog/catalog-pick";
import { catalogPickStillMatches } from "@/lib/catalog/catalog-queue";

function row(patch: Partial<CatalogCard> = {}): CatalogCard {
  return {
    id: "luka-prizm-280",
    playerName: "Luka Dončić",
    yearLabel: "2018-19",
    setBrand: "Panini Prizm",
    cardNumber: "280",
    sport: "Basketball",
    parallel: "Base",
    ...patch,
  };
}

const typed: CatalogMatchForm = {
  playerName: "luka doncic",
  yearLabel: "2018-19",
  setBrand: "prizm",
  cardNumber: "#280",
  noNumber: false,
};

describe("bestCatalogMatch", () => {
  it("matches an exact player, year, number, and set hit, ignoring case, accents, and punctuation", () => {
    const hit = row();
    assert.equal(bestCatalogMatch(typed, [hit]), hit);
    assert.equal(
      bestCatalogMatch({ ...typed, playerName: "LUKA DONČIĆ.", setBrand: "Panini Prizm" }, [hit]),
      hit,
    );
  });

  it("accepts a player alias", () => {
    const hit = row();
    assert.equal(bestCatalogMatch({ ...typed, playerName: "Luka" }, [hit]), hit);
  });

  it("returns null with no candidates", () => {
    assert.equal(bestCatalogMatch(typed, []), null);
  });

  it("returns null for a year or number mismatch", () => {
    assert.equal(bestCatalogMatch(typed, [row({ yearLabel: "2019-20" })]), null);
    assert.equal(bestCatalogMatch(typed, [row({ cardNumber: "281" })]), null);
  });

  it("returns null when the player or set does not line up", () => {
    assert.equal(bestCatalogMatch(typed, [row({ playerName: "Luka Garza" })]), null);
    assert.equal(bestCatalogMatch(typed, [row({ setBrand: "Panini Select" })]), null);
    // A shared brand word alone is not a set match.
    assert.equal(
      bestCatalogMatch({ ...typed, setBrand: "Panini Select" }, [row({ setBrand: "Panini Prizm" })]),
      null,
    );
  });

  it("returns null for two equally good candidates", () => {
    const a = row({ id: "a", setBrand: "Panini Prizm" });
    const b = row({ id: "b", setBrand: "Prizm Panini" });
    assert.equal(bestCatalogMatch(typed, [a, b]), null);
  });

  it("prefers the closer set when one is better", () => {
    const close = row({ id: "close", setBrand: "Panini Prizm" });
    const far = row({ id: "far", setBrand: "Panini Prizm Draft Picks" });
    assert.equal(bestCatalogMatch({ ...typed, setBrand: "Panini Prizm" }, [far, close]), close);
  });

  it("treats rows that differ only by parallel as one card", () => {
    const base = row({ id: "base", parallel: "Base" });
    const silver = row({ id: "silver", parallel: "Silver" });
    assert.equal(bestCatalogMatch(typed, [silver, base]), base);
  });

  it("skips the number check for No number", () => {
    const hit = row({ cardNumber: "" });
    assert.equal(bestCatalogMatch({ ...typed, cardNumber: "", noNumber: true }, [hit]), hit);
  });
});

describe("catalog match search", () => {
  it("waits for player, year, set, and number", () => {
    assert.equal(catalogMatchQuery({ ...typed, playerName: " " }), null);
    assert.equal(catalogMatchQuery({ ...typed, yearLabel: "" }), null);
    assert.equal(catalogMatchQuery({ ...typed, setBrand: "" }), null);
    assert.equal(catalogMatchQuery({ ...typed, cardNumber: "" }), null);
    assert.equal(catalogMatchQuery(typed), "luka doncic 2018-19 280");
    assert.equal(catalogMatchQuery({ ...typed, cardNumber: "", noNumber: true }), "luka doncic 2018-19");
  });

  it("starts a new lookup when the set changes", () => {
    assert.equal(catalogMatchKey({ ...typed, setBrand: "" }), null);
    assert.notEqual(catalogMatchKey(typed), catalogMatchKey({ ...typed, setBrand: "Panini Select" }));
  });

  it("debounces at least 400 ms", () => {
    assert.ok(CATALOG_MATCH_DEBOUNCE_MS >= 400);
  });
});

describe("catalog match chip", () => {
  const query = "luka doncic 2018-19 280";

  it("shows the chip for a match on the current entry", () => {
    assert.equal(catalogMatchView({ query, dismissed: false, lookup: { query, match: row() } }), "chip");
  });

  it("shows the note when the catalog has no match", () => {
    assert.equal(catalogMatchView({ query, dismissed: false, lookup: { query, match: null } }), "missing");
    assert.equal(
      CATALOG_MISSING_NOTE,
      "Not in our catalog yet. We'll still look for sales using what you typed, and add it to the catalog.",
    );
  });

  it("hides while searching, after No, and for an unfinished entry", () => {
    assert.equal(catalogMatchView({ query, dismissed: false, lookup: null }), null);
    assert.equal(
      catalogMatchView({ query, dismissed: false, lookup: { query: "older", match: row() } }),
      null,
    );
    assert.equal(catalogMatchView({ query, dismissed: true, lookup: { query, match: row() } }), null);
    assert.equal(catalogMatchView({ query: null, dismissed: false, lookup: { query, match: row() } }), null);
  });

  it("Use this fills the canonical card and keeps the typed parallel", () => {
    const applied = catalogPickFields(matchForApply(row({ parallel: "Silver" }), "Silver Prizm"), "");
    assert.equal(applied.form.playerName, "Luka Dončić");
    assert.equal(applied.form.yearLabel, "2018-19");
    assert.equal(applied.form.setBrand, "Panini Prizm");
    assert.equal(applied.form.cardNumber, "280");
    assert.equal(applied.form.parallel, "Silver Prizm");
    // Grade lives outside the catalog patch, so a pick never resets it.
    assert.ok(!("grade" in applied.form));
    assert.ok(!("gradeNumber" in applied.form));
    // The applied card counts as picked, so the chip does not ask again.
    assert.equal(
      catalogPickStillMatches(applied.snapshot, {
        playerName: "Luka Dončić",
        yearLabel: "2018-19",
        setBrand: "Panini Prizm",
        cardNumber: "280",
        parallel: "Silver Prizm",
      }),
      true,
    );
  });

  it("runs only for unpicked manual entries on Add, and never blocks save", () => {
    const form = readFileSync(join(process.cwd(), "components/card-form.tsx"), "utf8");
    assert.match(form, /catalogPickStillMatches\(catalogPick\.current/);
    assert.match(form, /debounceMs: CATALOG_MATCH_DEBOUNCE_MS/);
    assert.match(form, /session\.abort\(\)/);
    assert.match(form, /Is this your card\?/);
    assert.match(form, /Use this/);
    assert.match(form, /CATALOG_MISSING_NOTE/);
    // Save still sends unmatched cards to staging.
    assert.match(form, /submitCatalogCardQuietly\(card\.id\)/);
  });

  it("adds no network calls to save", () => {
    const form = readFileSync(join(process.cwd(), "components/card-form.tsx"), "utf8");
    assert.doesNotMatch(form, /\bfetch\(/);
    assert.equal((form.match(/searchCatalogRemote/g) ?? []).length, 2, "import plus the one match search");
  });
});
