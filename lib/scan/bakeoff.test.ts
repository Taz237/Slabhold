import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { INDEXED_DIRECTORY } from "@/lib/players/directory";
import type { TrawlSoldResult } from "@/lib/comps/types";
import { BAKEOFF_CASES, type BakeoffCase } from "./bakeoff-fixtures";
import { lookupLiveSolds } from "./live-solds";
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

/** The mocked Trawl for a case: its sold titles at its rung, nothing on any other. */
function liveResults(scan: BakeoffCase): TrawlSoldResult[] {
  return (scan.live?.sold ?? []).map((sale, index) => ({
    title: sale.title,
    sale_price: sale.price,
    shipping_price: null,
    currency: "USD",
    condition: sale.graded ? "Graded" : "Ungraded",
    condition_raw: null,
    date_sold: `${sale.soldAt}T18:00:00.000Z`,
    buying_format: "Auction",
    item_id: `${scan.name}-${index}`,
    item_link: "",
    image_url: null,
    details: {
      grading: sale.graded
        ? { graded: true, grader: sale.graded.grader, grade: sale.graded.grade, condition: null }
        : { graded: false, grader: null, grade: null, condition: null },
    },
  }));
}

type LiveRow = Row & { rung: string; solds: string };

async function scoreLive(scan: BakeoffCase): Promise<LiveRow> {
  let calls = 0;
  const queries: string[] = [];
  const result = await lookupLiveSolds(
    { capture: { lines: scan.front, backLines: scan.back, kind: scan.kind ?? "card" }, rows: scan.rows ?? [] },
    "bakeoff",
    {
      directory: INDEXED_DIRECTORY,
      products: async () => [],
      cachedTitles: async () => scan.titles ?? [],
      quickCompCache: async () => null,
      liveSearch: async (query) => {
        queries.push(query);
        const rung = calls++;
        return { ok: true, results: rung === scan.live?.atRung ? liveResults(scan) : [], fetchedAt: "2026-11-12T20:00:00.000Z" };
      },
      storeQuickComp: async () => {},
    },
  );
  const match = result.matches[0];
  const base = score({ ...scan, rows: [] });
  const player: Mark = !match ? "open" : match.playerName === scan.truth.player ? "right" : "wrong";
  const used = result.query ? queries.indexOf(result.query) : -1;
  return {
    ...base,
    player,
    set: mark(match?.setBrand ?? "", scan.truth.set),
    number: mark(match?.cardNumber ?? "", scan.truth.number),
    parallel: scan.truth.parallel ? mark(match?.parallel ?? "", scan.truth.parallel) : match?.parallel ? "wrong" : "right",
    shown: match
      ? [match.playerName, match.yearLabel, match.setBrand, match.cardNumber ? `#${match.cardNumber}` : "", match.parallel, match.serialRun ? `/${match.serialRun}` : ""].filter(Boolean).join(" · ")
      : "(no match)",
    rung: used >= 0 ? `${"abcd"[used] ?? used}: ${result.query}` : "-",
    solds: result.comp.status === "ok" ? `${result.comp.nSales} sold${result.comp.parallel ? ` (${result.comp.parallel})` : ""}` : result.comp.status === "none" ? "none" : result.comp.status,
  };
}

describe("the bake-off with live eBay solds (mocked Trawl, junk included)", () => {
  const cases = BAKEOFF_CASES.filter((scan) => scan.live);

  it("prints the live scoreboard, and every case is right or open, never wrong", async () => {
    const rows = await Promise.all(cases.map(scoreLive));
    const total = (key: "player" | "set" | "number" | "parallel", value: Mark) => rows.filter((row) => row[key] === value).length;
    console.log(
      [
        "Scanner bake-off with live solds (player set # parallel · rung · solds)",
        ...rows.map(
          (row) =>
            `${ICON[row.player]} ${ICON[row.set]} ${ICON[row.number]} ${ICON[row.parallel]}  ${row.name.padEnd(56)} ${row.shown.padEnd(58)} ${row.rung.padEnd(36)} ${row.solds}`,
        ),
        `player ${total("player", "right")}/${rows.length} · set ${total("set", "right")} right ${total("set", "wrong")} wrong · # ${total("number", "right")} right ${total("number", "wrong")} wrong · parallel ${total("parallel", "right")} right ${total("parallel", "wrong")} wrong · solds found ${rows.filter((row) => row.solds.includes("sold")).length}/${rows.length}`,
      ].join("\n"),
    );
    for (const row of rows) {
      assert.equal(row.player, "right", `${row.name}: ${row.shown}`);
      assert.notEqual(row.set, "wrong", `${row.name}: ${row.shown}`);
      assert.notEqual(row.number, "wrong", `${row.name}: ${row.shown}`);
      assert.notEqual(row.parallel, "wrong", `${row.name}: ${row.shown}`);
      assert.match(row.solds, /sold/, `${row.name}: the card sells, and we found it`);
    }
  });

  it("Miller with live solds: 2024 Bowman #BP-27, Pink/Red /299, the Pink/Red sales only", async () => {
    for (const scan of cases.filter((item) => item.truth.player === "Aidan Miller")) {
      const row = await scoreLive(scan);
      assert.equal(row.set, "right", `${scan.name}: ${row.shown}`);
      assert.equal(row.number === "wrong", false, `${scan.name}: ${row.shown}`);
      assert.equal(row.parallel, "right", `${scan.name}: ${row.shown}`);
      assert.match(row.solds, /^3 sold \(Pink\/Red\)$/, `${scan.name}: ${row.solds}`);
    }
  });
});
