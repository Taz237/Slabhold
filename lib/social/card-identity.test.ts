import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { join } from "node:path";
import { SET_MANUFACTURER_WORDS, setMatchPhrase } from "@/lib/comps/match";
import { cardIdentityKey, type IdentityCard } from "./card-identity";

const love: IdentityCard = {
  playerName: "Jordan Love",
  year: 2020,
  yearLabel: "2020",
  setBrand: "Panini Select",
  cardNumber: "47",
  parallel: "Base",
  conditionType: "graded",
  grade: "PSA 10",
  grader: "PSA",
};

describe("cardIdentityKey", () => {
  it("treats a leading # on the card number as the same number", () => {
    assert.equal(
      cardIdentityKey({ ...love, cardNumber: "#47" }),
      cardIdentityKey({ ...love, cardNumber: "47" }),
    );
  });

  it("treats Select and Panini Select as the same set", () => {
    assert.equal(
      cardIdentityKey({ ...love, setBrand: "Select" }),
      cardIdentityKey({ ...love, setBrand: "Panini Select" }),
    );
  });

  it("keeps PSA 10 distinct from PSA 9", () => {
    assert.notEqual(
      cardIdentityKey(love),
      cardIdentityKey({ ...love, grade: "PSA 9", grader: "PSA" }),
    );
  });

  it("keeps PSA 10 distinct from raw", () => {
    assert.notEqual(
      cardIdentityKey(love),
      cardIdentityKey({
        ...love,
        conditionType: "raw",
        grade: "Raw",
        grader: null,
      }),
    );
  });

  it("keeps Base distinct from Silver", () => {
    assert.notEqual(
      cardIdentityKey({ ...love, parallel: "Base" }),
      cardIdentityKey({ ...love, parallel: "Silver" }),
    );
  });

  it("treats a missing parallel as base", () => {
    assert.equal(
      cardIdentityKey({ ...love, parallel: null }),
      cardIdentityKey({ ...love, parallel: "Base" }),
    );
  });

  it("uses the season label from the comps year helper", () => {
    const season = cardIdentityKey({
      ...love,
      year: 2023,
      yearLabel: "2023-24",
    });
    assert.equal(
      season,
      cardIdentityKey({ ...love, year: 2023, yearLabel: "2023-24" }),
    );
    assert.notEqual(
      season,
      cardIdentityKey({ ...love, year: 2024, yearLabel: "2024" }),
    );
  });

  it("builds a stable lowercase key", () => {
    assert.equal(
      cardIdentityKey({ ...love, cardNumber: "#47", parallel: null }),
      "jordan love|2020|select|47|base|psa 10",
    );
  });

  it("keeps SQL set aliases in parity with cardIdentityKey", () => {
    const sql = readFileSync(
      join(
        process.cwd(),
        "supabase/migrations/20261017180000_set_aliases_and_comp_flags_anon.sql",
      ),
      "utf8",
    );
    const block = sql.match(
      /-- BEGIN set_identity_aliases\s*([\s\S]*?)-- END set_identity_aliases/,
    );
    assert.ok(block);
    const aliases = block[1]
      .split("\n")
      .map((line) => line.replace(/^--\s*/, "").trim())
      .filter(Boolean);
    assert.deepEqual(aliases, [...SET_MANUFACTURER_WORDS]);
    assert.match(sql, new RegExp(`\\(\\?:${aliases.join("|")}\\)`));

    const samples = [
      "Select",
      "Panini Select",
      "panini select",
      "  Panini   Select ",
      "Prizm",
      "Panini Prizm",
      "Topps Chrome",
      "Panini",
      "Donruss Optic",
      "Panini Donruss Optic",
    ];
    for (const sample of samples) {
      assert.equal(sqlStyleSet(sample, aliases), setMatchPhrase(sample), sample);
    }
    assert.equal(
      cardIdentityKey({ ...love, setBrand: "Select" }),
      cardIdentityKey({ ...love, setBrand: "Panini Select" }),
    );
    assert.match(sql, /revoke all on public\.comp_flags from anon/i);
  });
});

/** Same whole-word strip the card_identity_key set clause applies. */
function sqlStyleSet(setBrand: string, aliases: string[]): string {
  const raw = setBrand.trim();
  if (!raw) return "";
  const pattern = new RegExp(
    `(^|[^a-z0-9_])(?:${aliases.join("|")})([^a-z0-9_]|$)`,
    "g",
  );
  const stripped = raw
    .toLowerCase()
    .replace(pattern, "$1$2")
    .replace(/\s+/g, " ")
    .trim();
  return stripped || raw.toLowerCase();
}
