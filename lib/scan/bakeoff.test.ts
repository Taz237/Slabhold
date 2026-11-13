import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { INDEXED_DIRECTORY } from "@/lib/players/directory";
import type { TrawlSoldResult } from "@/lib/comps/types";
import { BAKEOFF_CASES, type BakeoffCase } from "./bakeoff-fixtures";
import { WIDE_BAKEOFF_CASES } from "./bakeoff-fixtures-wide";
import { lookupLiveSolds } from "./live-solds";
import { rankScanMatches, type ScanMatch } from "./match";
import { scanReadFrom } from "./session";

/**
 * The bake-off: every real-world scan through the same path the app takes
 * (scanReadFrom → rankScanMatches), scored right, open or wrong on six fields:
 * player, year, set, card #, print run and parallel. The player must be right
 * every time. A wrong field never ships; open beats wrong.
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

function read(scan: BakeoffCase) {
  return scanReadFrom({ lines: scan.front, backLines: scan.back, image: null, kind: scan.kind === undefined ? "card" : scan.kind }, INDEXED_DIRECTORY);
}

function top(scan: BakeoffCase): ScanMatch | undefined {
  return rankScanMatches(read(scan), scan.rows ?? [], { directory: INDEXED_DIRECTORY, products: null, soldTitles: scan.titles ?? [] }).matches[0];
}

const FIELDS = ["player", "year", "set", "number", "run", "parallel"] as const;
type Field = (typeof FIELDS)[number];
type Row = Record<Field, Mark> & { name: string; shown: string };

/** A base card reads right as "Base" (a slab label says so) or left open (a raw card can't tell). */
function markParallel(got: string, truth: string): Mark {
  if (!truth || norm(truth) === "base") return !got || norm(got) === "base" ? "right" : "wrong";
  return mark(got, truth);
}

/** An unnumbered card must show no run. A numbered one: its run, or open. */
function markRun(got: number | null | undefined, scan: BakeoffCase): Mark {
  const truth = scan.truth.run ?? null;
  if (truth == null) return got == null ? "right" : "wrong";
  if (got == null) return "open";
  if (got === truth) return "right";
  return scan.misreadRun != null && got === scan.misreadRun ? "open" : "wrong";
}

function marks(match: ScanMatch | undefined, scan: BakeoffCase): Record<Field, Mark> {
  return {
    player: !match ? "open" : match.playerName === scan.truth.player ? "right" : "wrong",
    year: scan.truth.year ? mark(match?.yearLabel ?? "", scan.truth.year) : "right",
    set: mark(match?.setBrand ?? "", scan.truth.set),
    number: mark(match?.cardNumber ?? "", scan.truth.number),
    run: markRun(match?.serialRun, scan),
    parallel: markParallel(match?.parallel ?? "", scan.truth.parallel),
  };
}

function shownLine(match: ScanMatch | undefined): string {
  if (!match) return "(no match)";
  return [
    match.playerName,
    match.yearLabel,
    match.setBrand,
    match.cardNumber ? `#${match.cardNumber}` : "",
    match.parallel,
    match.serialRun ? `/${match.serialRun}` : "",
    match.grade?.company ? `${match.grade.company} ${match.grade.number}`.trim() : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

function score(scan: BakeoffCase): Row {
  const match = top(scan);
  return { name: scan.name, ...marks(match, scan), shown: shownLine(match) };
}

const ICON: Record<Mark, string> = { right: "✓", open: "·", wrong: "✗" };

function tally(rows: readonly Record<Field, Mark>[]) {
  const count = (field: Field, value: Mark) => rows.filter((row) => row[field] === value).length;
  const all = (value: Mark) => FIELDS.reduce((sum, field) => sum + count(field, value), 0);
  const perField = FIELDS.map((field) => `${field === "number" ? "#" : field === "run" ? "/run" : field} ${count(field, "right")}·${count(field, "open")}·${count(field, "wrong")}`).join("  ");
  return { right: all("right"), open: all("open"), wrong: all("wrong"), total: rows.length * FIELDS.length, perField };
}

function board(title: string, rows: readonly Row[]): string[] {
  const sum = tally(rows);
  return [
    `${title}: ${sum.right} of ${sum.total} right, ${sum.open} open, ${sum.wrong} wrong`,
    `  per field (right·open·wrong): ${sum.perField}`,
  ];
}

const ALL_CASES: BakeoffCase[] = [...BAKEOFF_CASES, ...WIDE_BAKEOFF_CASES];

describe("the scanner bake-off", () => {
  const rows = ALL_CASES.map(score);
  const first = rows.slice(0, BAKEOFF_CASES.length);
  const wide = rows.slice(BAKEOFF_CASES.length);

  it("prints the scoreboard", () => {
    const lines = [
      "Scanner bake-off (player year set # /run parallel: ✓ right · open ✗ wrong)",
      ...rows.map((row) => `${FIELDS.map((field) => ICON[row[field]]).join(" ")}  ${row.name.padEnd(72)} ${row.shown}`),
      ...board("First set", first),
      ...board("Wide set", wide),
      ...board("All", rows),
      `Known misses marked: ${ALL_CASES.reduce((sum, scan) => sum + (scan.knownWrong?.length ?? 0), 0)}`,
    ];
    console.log(lines.join("\n"));
    assert.equal(rows.length, ALL_CASES.length);
    assert.ok(WIDE_BAKEOFF_CASES.length >= 40);
  });

  rows.forEach((row, index) => {
    const known = ALL_CASES[index].knownWrong ?? [];
    it(`${row.name}: the right player, never a wrong year, set, #, run or parallel`, () => {
      for (const field of FIELDS) {
        // A marked miss must still be a miss: fixing one means unmarking it.
        if (known.includes(field)) assert.equal(row[field], "wrong", `${field} is marked as a known miss but isn't one: ${row.shown}`);
        else if (field === "player") assert.equal(row.player, "right", row.shown);
        else assert.notEqual(row[field], "wrong", `${field}: ${row.shown}`);
      }
    });
  });

  it("slab labels are gold: every slab reads its year, set, player and parallel off the label, with no miss", () => {
    ALL_CASES.forEach((scan, index) => {
      if (!scan.truth.cert) return;
      assert.deepEqual(scan.knownWrong ?? [], [], scan.name);
      const row = rows[index];
      for (const field of ["player", "year", "set", "parallel", "run"] as const) assert.equal(row[field], "right", `${scan.name}: ${field}: ${row.shown}`);
      assert.notEqual(row.number, "wrong", scan.name);
    });
  });

  it("the first set has no known misses", () => {
    for (const scan of BAKEOFF_CASES) assert.deepEqual(scan.knownWrong ?? [], [], scan.name);
  });

  it("the Miller card is never Topps, never a SKU, never FOR-4", () => {
    for (const scan of BAKEOFF_CASES.filter((item) => item.truth.player === "Aidan Miller")) {
      const shown = JSON.stringify(top(scan));
      assert.doesNotMatch(shown, /Topps|CMPO73107|FOR-4|SS-3B/i, scan.name);
    }
  });

  it("a slab's cert number is never the card #, and its grade is the label's", () => {
    for (const scan of ALL_CASES.filter((item) => item.truth.cert)) {
      const match = top(scan);
      assert.ok(match, scan.name);
      assert.notEqual(match.cardNumber.replace(/\D/g, ""), scan.truth.cert!.replace(/\D/g, ""), `${scan.name}: the cert as the card #`);
      assert.ok(!match.cardNumber.includes(scan.truth.cert!), scan.name);
      if (scan.truth.grade) {
        // The grader and the grade are the label's, every time.
        assert.equal(`${match.grade?.company ?? ""} ${match.grade?.number ?? ""}`.trim(), scan.truth.grade, scan.name);
      }
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

type LiveRow = Row & { rung: string; solds: string; serialRun: number | null };

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
        if (scan.live?.failAt?.includes(rung)) return { ok: false, reason: "unavailable" };
        return { ok: true, results: rung === scan.live?.atRung ? liveResults(scan) : [], fetchedAt: "2026-11-12T20:00:00.000Z" };
      },
      storeQuickComp: async () => {},
    },
  );
  const match = result.matches[0];
  const used = result.query ? queries.indexOf(result.query) : -1;
  return {
    name: scan.name,
    ...marks(match, scan),
    shown: match
      ? [match.playerName, match.yearLabel, match.setBrand, match.cardNumber ? `#${match.cardNumber}` : "", match.parallel, match.serialRun ? `/${match.serialRun}` : ""].filter(Boolean).join(" · ")
      : "(no match)",
    rung: used >= 0 ? `${"abcd"[used] ?? used}: ${result.query}` : "-",
    solds:
      result.comp.status === "ok"
        ? `${result.comp.nSales} sold${result.comp.parallel ? ` (${result.comp.parallel})` : ""}`
        : result.comp.status === "none"
          ? result.comp.searched
            ? "none (searched)"
            : "none"
          : result.comp.status,
    serialRun: match?.serialRun ?? null,
  };
}

describe("the bake-off with live eBay solds (mocked Trawl, junk included)", () => {
  const cases = BAKEOFF_CASES.filter((scan) => scan.live);

  it("prints the live scoreboard, and every case is right or open, never wrong", async () => {
    const rows = await Promise.all(cases.map(scoreLive));
    const total = (key: Field, value: Mark) => rows.filter((row) => row[key] === value).length;
    console.log(
      [
        "Scanner bake-off with live solds (player set # parallel · rung · solds)",
        ...rows.map(
          (row) =>
            `${ICON[row.player]} ${ICON[row.set]} ${ICON[row.number]} ${ICON[row.parallel]}  ${row.name.padEnd(56)} ${row.shown.padEnd(58)} ${row.rung.padEnd(36)} ${row.solds}`,
        ),
        ...board("With live solds", rows),
        `player ${total("player", "right")}/${rows.length} · set ${total("set", "right")} right ${total("set", "wrong")} wrong · # ${total("number", "right")} right ${total("number", "wrong")} wrong · parallel ${total("parallel", "right")} right ${total("parallel", "wrong")} wrong · solds found ${rows.filter((row) => row.solds.includes("sold")).length}/${rows.filter((row) => cases.find((item) => item.name === row.name)?.live?.solds !== "none").length}`,
      ].join("\n"),
    );
    for (const row of rows) {
      assert.equal(row.player, "right", `${row.name}: ${row.shown}`);
      assert.notEqual(row.set, "wrong", `${row.name}: ${row.shown}`);
      assert.notEqual(row.number, "wrong", `${row.name}: ${row.shown}`);
      assert.notEqual(row.parallel, "wrong", `${row.name}: ${row.shown}`);
      assert.notEqual(row.year, "wrong", `${row.name}: ${row.shown}`);
      assert.notEqual(row.run, "wrong", `${row.name}: ${row.shown}`);
      const scan = cases.find((item) => item.name === row.name)!;
      if (scan.live?.solds === "none") assert.equal(row.solds, "none (searched)", `${row.name}: searched, honestly none, never unavailable`);
      else assert.match(row.solds, /sold/, `${row.name}: the card sells, and we found it`);
      if (scan.truth.run) assert.equal(row.serialRun, scan.truth.run, `${row.name}: the print run`);
      if (scan.live?.pricedFrom) assert.match(row.solds, new RegExp(`sold \\(${scan.live.pricedFrom.replace("/", "\\/")}\\)$`), row.name);
      // A numbered card is never priced or labelled as Base.
      if (scan.truth.run) assert.doesNotMatch(row.solds, /\(Base\)/, row.name);
      // A price is always named by its sales' parallel: never Base for colored sales.
      if (scan.truth.parallel && row.solds.includes("sold")) assert.match(row.solds, new RegExp(`\\(${scan.truth.parallel.replace("/", "\\/")}\\)$`), row.name);
    }
  });

  it("Miller with live solds: 2024 Bowman #BP-27, Pink/Red /299, the Pink/Red sales only", async () => {
    for (const scan of cases.filter((item) => item.truth.player === "Aidan Miller" && item.truth.parallel === "Pink/Red")) {
      const row = await scoreLive(scan);
      assert.equal(row.set, "right", `${scan.name}: ${row.shown}`);
      assert.equal(row.number === "wrong", false, `${scan.name}: ${row.shown}`);
      assert.equal(row.parallel, "right", `${scan.name}: ${row.shown}`);
      assert.match(row.solds, /^3 sold \(Pink\/Red\)$/, `${scan.name}: ${row.solds}`);
    }
  });
});
