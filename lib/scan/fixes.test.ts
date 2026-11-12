import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { INDEXED_DIRECTORY } from "@/lib/players/directory";
import { applyFixBoosts, fixFrom, identityKeyOf, readKeyOf, scanFixesEnabled, type FixBoost } from "./fixes";
import type { ScanMatch, ScanMatchResult, ScanRead } from "./match";
import { readRawCardText } from "./raw-text";
import { readSlabLabel } from "./slab-label";

/** Made-up reads and matches. The cert is not a real one. */
function match(partial: Partial<ScanMatch> = {}): ScanMatch {
  return {
    catalogId: "wemby-prizm",
    playerName: "Victor Wembanyama",
    sport: "Basketball",
    yearLabel: "2023-24",
    setBrand: "Panini Prizm",
    cardNumber: "136",
    parallel: "",
    serialRun: null,
    serialNo: "",
    isRookie: true,
    isAuto: false,
    grade: null,
    score: 80,
    sureness: { player: "sure", year: "likely", set: "likely", number: "unsure", parallel: "unsure" },
    parallelOptions: [
      { name: "Base", serialRun: null },
      { name: "Silver", serialRun: null },
    ],
    ...partial,
  };
}

const RAW: ScanRead = {
  kind: "raw",
  front: readRawCardText(["VICTOR WEMBANYAMA", "PRIZM", "SILVER"], INDEXED_DIRECTORY),
  back: readRawCardText(["#136", "2023-24 PANINI PRIZM"], INDEXED_DIRECTORY),
};

const SLAB: ScanRead = {
  kind: "slab",
  label: readSlabLabel(["PSA", "2018 PANINI PRIZM #280", "LUKA DONCIC", "SILVER PRIZM", "GEM MT 10", "45678912"]),
};

describe("readKeyOf", () => {
  it("keys a raw read by player, year, set, number and parallel words", () => {
    assert.equal(readKeyOf(RAW), "raw|victor wembanyama|2023-24|panini prizm|136|silver");
  });

  it("keys a slab by its label, never the cert or grade", () => {
    const key = readKeyOf(SLAB);
    assert.equal(key, "slab|luka doncic|2018|panini prizm|280|silver prizm");
    assert.equal(key.includes("45678912"), false);
  });

  it("is empty without a player, so nothing is recorded", () => {
    assert.equal(readKeyOf({ kind: "raw", front: readRawCardText(["PRIZM"], INDEXED_DIRECTORY), back: null }), "");
  });
});

describe("fixFrom", () => {
  it("records a different row or a different parallel", () => {
    const before = match();
    assert.deepEqual(fixFrom("k", before, match({ setBrand: "Panini Select", cardNumber: "87" })), {
      readKey: "k",
      wrongIdentity: identityKeyOf(before),
      rightIdentity: identityKeyOf(match({ setBrand: "Panini Select", cardNumber: "87" })),
      rightParallel: "",
    });
    assert.equal(fixFrom("k", before, match({ parallel: "Silver" }))?.rightParallel, "Silver");
  });

  it("records nothing when the collector kept the pick, or without a read key", () => {
    assert.equal(fixFrom("k", match({ parallel: "Silver" }), match({ parallel: "Silver" })), null);
    assert.equal(fixFrom("", match(), match({ parallel: "Silver" })), null);
  });
});

describe("applyFixBoosts", () => {
  const select = match({ catalogId: "wemby-select", setBrand: "Panini Select", cardNumber: "87" });
  const result: ScanMatchResult = { matches: [match(), select], settled: false };

  function boost(partial: Partial<FixBoost>): FixBoost {
    return { readKey: "k", rightIdentity: identityKeyOf(select), rightParallel: "", collectors: 2, ...partial };
  }

  it("moves the card collectors chose to the top", () => {
    const boosted = applyFixBoosts(result, "k", [boost({})]);
    assert.equal(boosted.matches[0]?.catalogId, "wemby-select");
    assert.equal(boosted.settled, false, "a boost is never proof");
  });

  it("fills an open parallel they chose, as likely, only if the card offers it", () => {
    const boosted = applyFixBoosts(result, "k", [boost({ rightIdentity: identityKeyOf(match()), rightParallel: "Silver" })]);
    assert.equal(boosted.matches[0]?.parallel, "Silver");
    assert.equal(boosted.matches[0]?.sureness.parallel, "likely");
    const unknown = applyFixBoosts(result, "k", [boost({ rightIdentity: identityKeyOf(match()), rightParallel: "Lava" })]);
    assert.equal(unknown.matches[0]?.parallel, "");
  });

  it("never overrides a parallel the card itself showed", () => {
    const sure = { matches: [match({ parallel: "Base", sureness: { ...match().sureness, parallel: "sure" } })], settled: true };
    const boosted = applyFixBoosts(sure, "k", [boost({ rightIdentity: identityKeyOf(match()), rightParallel: "Silver" })]);
    assert.equal(boosted.matches[0]?.parallel, "Base");
    assert.equal(boosted.settled, true);
  });

  it("ignores boosts for other reads, under 2 collectors, or for cards not in the list", () => {
    assert.equal(applyFixBoosts(result, "k", [boost({ readKey: "other" })]), result);
    assert.equal(applyFixBoosts(result, "k", [boost({ collectors: 1 })]), result);
    assert.equal(applyFixBoosts(result, "k", [boost({ rightIdentity: "someone|2020|topps|1" })]), result);
  });
});

describe("scanFixesEnabled", () => {
  it("is off unless exactly 1", () => {
    assert.equal(scanFixesEnabled({ NEXT_PUBLIC_SCAN_FIXES: "1" }), true);
    assert.equal(scanFixesEnabled({}), false);
  });
});

describe("boostsFromRows", () => {
  it("keeps well-formed rows and drops the rest", async () => {
    const { boostsFromRows } = await import("./fix-store");
    assert.deepEqual(
      boostsFromRows([
        { read_key: "k", right_identity: "a|2023|prizm|136", right_parallel: "Silver", collectors: 3 },
        { read_key: "k", right_identity: 7, collectors: 2 },
        { read_key: "k", right_identity: "b", collectors: "x" },
      ]),
      [{ readKey: "k", rightIdentity: "a|2023|prizm|136", rightParallel: "Silver", collectors: 3 }],
    );
    assert.deepEqual(boostsFromRows(null), []);
  });
});

describe("the migration", () => {
  it("is unapplied, text only, private, and needs 2 collectors", async () => {
    const { readFileSync } = await import("node:fs");
    const sql = readFileSync("supabase/migrations/20261112120000_scan_fixes.sql", "utf8");
    assert.ok(sql.startsWith("-- UNAPPLIED. Needs review before running.\n"));
    assert.match(sql, /enable row level security/);
    assert.match(sql, /revoke all on public\.scan_fixes from anon, authenticated;/);
    assert.match(sql, /having count\(distinct f\.user_id\) >= 2/);
    const table = sql.slice(sql.indexOf("create table"), sql.indexOf(");", sql.indexOf("create table")));
    assert.doesNotMatch(table, /cert|photo|image|card_id/i, "text keys only");
    assert.doesNotMatch(sql, /\bdrop\b|\bdelete from\b|\bupdate public\.(?!scan_fixes)/i);
  });
});
