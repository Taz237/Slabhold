import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { INDEXED_DIRECTORY } from "@/lib/players/directory";
import { BAKEOFF_CASES, type BakeoffCase } from "./bakeoff-fixtures";
import { rankScanMatches, type ScanMatch } from "./match";
import { scanReadFrom } from "./session";

/**
 * The bake-off: every real-world scan through the same path the app takes
 * (scanReadFrom → rankScanMatches), scored right, open or wrong. The player
 * must be right every time. A wrong set or card # never ships; open beats wrong.
 */

type Mark = "right" | "open" | "wrong";

const norm = (value: string) =>
  value
    .toLowerCase()
    .replace(/^panini\s+/, "")
    .split(/[^a-z0-9]+/)
    .filter((word) => word && word !== "paper")
    .sort()
    .join(" ");

function mark(got: string, truth: string): Mark {
  if (!got.trim()) return "open";
  return norm(got) === norm(truth) ? "right" : "wrong";
}

function top(scan: BakeoffCase): ScanMatch | undefined {
  const read = scanReadFrom({ lines: scan.front, backLines: scan.back, image: null, kind: scan.kind ?? "card" }, INDEXED_DIRECTORY);
  return rankScanMatches(read, scan.rows ?? [], { directory: INDEXED_DIRECTORY, products: null, soldTitles: scan.titles ?? [] }).matches[0];
}

type Row = { name: string; player: Mark; set: Mark; number: Mark; parallel: Mark; shown: string };

function score(scan: BakeoffCase): Row {
  const match = top(scan);
  const player: Mark = !match ? "open" : match.playerName === scan.truth.player ? "right" : "wrong";
  return {
    name: scan.name,
    player,
    set: mark(match?.setBrand ?? "", scan.truth.set),
    number: mark(match?.cardNumber ?? "", scan.truth.number),
    // A card with no parallel to pick (Topps Now base) is right when we leave it open.
    parallel: scan.truth.parallel ? mark(match?.parallel ?? "", scan.truth.parallel) : match?.parallel ? "wrong" : "right",
    shown: match ? [match.playerName, match.yearLabel, match.setBrand, match.cardNumber ? `#${match.cardNumber}` : "", match.parallel].filter(Boolean).join(" · ") : "(no match)",
  };
}

const ICON: Record<Mark, string> = { right: "✓", open: "·", wrong: "✗" };

describe("the scanner bake-off", () => {
  const rows = BAKEOFF_CASES.map(score);

  it("prints the scoreboard", () => {
    const total = (key: keyof Omit<Row, "name" | "shown">, value: Mark) => rows.filter((row) => row[key] === value).length;
    const lines = [
      "Scanner bake-off (✓ right · open ✗ wrong)",
      ...rows.map((row) => `${ICON[row.player]} ${ICON[row.set]} ${ICON[row.number]} ${ICON[row.parallel]}  ${row.name.padEnd(56)} ${row.shown}`),
      `player ${total("player", "right")}/${rows.length} · set ${total("set", "right")} right ${total("set", "open")} open ${total("set", "wrong")} wrong · # ${total("number", "right")} right ${total("number", "open")} open ${total("number", "wrong")} wrong · parallel ${total("parallel", "right")} right ${total("parallel", "open")} open ${total("parallel", "wrong")} wrong`,
    ];
    console.log(lines.join("\n"));
    assert.equal(rows.length, BAKEOFF_CASES.length);
  });

  for (const row of rows) {
    it(`${row.name}: the right player, never a wrong set, # or parallel`, () => {
      assert.equal(row.player, "right", row.shown);
      assert.notEqual(row.set, "wrong", row.shown);
      assert.notEqual(row.number, "wrong", row.shown);
      assert.notEqual(row.parallel, "wrong", row.shown);
    });
  }

  it("the Miller card is never Topps, never a SKU, never FOR-4", () => {
    for (const scan of BAKEOFF_CASES.filter((item) => item.truth.player === "Aidan Miller")) {
      const shown = JSON.stringify(top(scan));
      assert.doesNotMatch(shown, /Topps|CMPO73107|FOR-4|SS-3B/i, scan.name);
    }
  });
});
