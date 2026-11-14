import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadChecklistsFor } from "@/lib/cards/checklist-load";
import type { ChecklistProduct } from "@/lib/cards/checklists";
import { loadProductData, type ProductRecord } from "@/lib/cards/product-data";
import { SCAN_DIRECTORY as INDEXED_DIRECTORY } from "@/lib/players/scan-directory";
import type { TrawlSoldResult } from "@/lib/comps/types";
import { BAKEOFF_CASES, type BakeoffCase } from "./bakeoff-fixtures";
import { WIDE_BAKEOFF_CASES } from "./bakeoff-fixtures-wide";
import { PLAYER_LIST_BAKEOFF_CASES } from "./bakeoff-fixtures-players";
import { LOOKUP_BAKEOFF_CASES } from "./bakeoff-fixtures-lookup";
import { BAKEOFF_BASELINE } from "./bakeoff-baseline";
import { lookupLiveSolds } from "./live-solds";
import { rankScanMatches, scanCardKey, type ScanMatch } from "./match";
import { withAlternates } from "./alternates";
import { scanReadFrom, type ScanCapture } from "./session";

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

/** The capture as the hub hands it on: the phone's alternates settled into plain lines first. */
function captureOf(scan: BakeoffCase): ScanCapture {
  return withAlternates(
    {
      lines: scan.front,
      backLines: scan.back,
      image: null,
      kind: scan.kind === undefined ? "card" : scan.kind,
      alternates: scan.alternates ?? null,
      backAlternates: scan.backAlternates ?? null,
      cert: scan.barcodeCert ?? null,
    },
    INDEXED_DIRECTORY,
  );
}

function read(scan: BakeoffCase) {
  return scanReadFrom(captureOf(scan), INDEXED_DIRECTORY);
}

function top(scan: BakeoffCase, products: readonly ProductRecord[] | null = null, checklists: readonly ChecklistProduct[] = scan.checklist ?? []): ScanMatch | undefined {
  return rankScanMatches(read(scan), scan.rows ?? [], { directory: INDEXED_DIRECTORY, products, soldTitles: scan.titles ?? [], checklists }).matches[0];
}

/** The store's own checklist files for the year and set this scan read, as production loads them, plus the case's own rows. */
async function storeChecklists(scan: BakeoffCase): Promise<ChecklistProduct[]> {
  const card = scanCardKey(read(scan), INDEXED_DIRECTORY);
  return [...(scan.checklist ?? []), ...(card ? await loadChecklistsFor(card) : [])];
}

const FIELDS = ["player", "year", "set", "number", "run", "parallel"] as const;
type Field = (typeof FIELDS)[number];
type Row = Record<Field, Mark> & { name: string; shown: string };

/** A base card reads right as "Base" (a slab label says so) or left open (a raw card can't tell). */
function markParallel(got: string, truth: string, also: readonly string[] = []): Mark {
  // The checklist's name and the sold titles' name for one parallel are both right.
  if (got.trim() && also.some((name) => norm(name) === norm(got))) return "right";
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
    // A trap with no player to read (truth.player ""): the player must stay open, and that is right.
    player: !scan.truth.player ? (!match?.playerName ? "right" : "wrong") : !match ? "open" : match.playerName === scan.truth.player ? "right" : "wrong",
    year: scan.truth.year ? mark(match?.yearLabel ?? "", scan.truth.year) : "right",
    set: mark(match?.setBrand ?? "", scan.truth.set),
    number: mark(match?.cardNumber ?? "", scan.truth.number),
    run: markRun(match?.serialRun, scan),
    parallel: markParallel(match?.parallel ?? "", scan.truth.parallel, scan.truth.parallelAlso),
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

const ALL_CASES: BakeoffCase[] = [...BAKEOFF_CASES, ...WIDE_BAKEOFF_CASES, ...PLAYER_LIST_BAKEOFF_CASES, ...LOOKUP_BAKEOFF_CASES];
/** Where the lookup set starts. */
const LOOKUP_START = BAKEOFF_CASES.length + WIDE_BAKEOFF_CASES.length + PLAYER_LIST_BAKEOFF_CASES.length;
/** The scans the scoreboard had before the wider player list: checked field by field against bakeoff-baseline.ts. */
const BASELINE_CASES = BAKEOFF_CASES.length + WIDE_BAKEOFF_CASES.length;
const LETTER: Record<Mark, string> = { right: "r", open: "o", wrong: "w" };

describe("the scanner bake-off", () => {
  const rows = ALL_CASES.map(score);
  const first = rows.slice(0, BAKEOFF_CASES.length);
  const wide = rows.slice(BAKEOFF_CASES.length, BASELINE_CASES);
  const playerList = rows.slice(BASELINE_CASES, LOOKUP_START);
  const lookup = rows.slice(LOOKUP_START);

  it("prints the scoreboard", () => {
    const lines = [
      "Scanner bake-off (player year set # /run parallel: ✓ right · open ✗ wrong)",
      ...rows.map((row) => `${FIELDS.map((field) => ICON[row[field]]).join(" ")}  ${row.name.padEnd(72)} ${row.shown}`),
      ...board("First set", first),
      ...board("Wide set", wide),
      ...board("Player-list set", playerList),
      ...board("Lookup set", lookup),
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

  it("against the scoreboard before the wider player list: nothing went from right or open to wrong, nothing right fell open", () => {
    assert.equal(BAKEOFF_BASELINE.length, BASELINE_CASES, "bakeoff-baseline.ts has a row for every first-set and wide-set scan");
    BAKEOFF_BASELINE.forEach(([name, before], index) => {
      assert.equal(ALL_CASES[index].name, name, "bakeoff-baseline.ts is in the scans' order");
      const row = rows[index];
      FIELDS.forEach((field, at) => {
        const now = LETTER[row[field]];
        if (before[at] !== "w") assert.notEqual(now, "w", `${name}: ${field} was ${before[at] === "r" ? "right" : "open"}, now wrong: ${row.shown}`);
        if (before[at] === "r") assert.equal(now, "r", `${name}: ${field} was right, now open: ${row.shown}`);
      });
    });
  });

  it("with the real checklist files loaded, as production loads them: the right player, and no field is wrong", async () => {
    const products = await loadProductData();
    const withList = await Promise.all(
      ALL_CASES.map(async (scan): Promise<Row> => {
        const match = top(scan, products, await storeChecklists(scan));
        // A case that has no checklist of its own can still be named by the store's real file:
        // then the right answer is the player its sold titles name too.
        const named = [scan.liveTruth?.player, scan.storeTruth?.player].find((player) => player && match?.playerName === player);
        return { name: scan.name, ...marks(match, named ? { ...scan, truth: { ...scan.truth, player: named } } : scan), shown: shownLine(match) };
      }),
    );
    const missed = withList.filter((row) => FIELDS.some((field) => row[field] === "wrong")).map((row) => `✗ ${FIELDS.filter((field) => row[field] === "wrong").join(", ")}: ${row.name}: ${row.shown}`);
    console.log([...board("All, with the checklist", withList), ...missed].join("\n"));
    withList.forEach((row, index) => {
      const known = ALL_CASES[index].knownWrong ?? [];
      for (const field of FIELDS) {
        if (known.includes(field)) continue;
        if (field === "player") assert.equal(row.player, "right", `${row.name}: ${row.shown}`);
        else assert.notEqual(row[field], "wrong", `${row.name}: ${field}: ${row.shown}`);
      }
    });
  });

  it("the player-list set: an unknown name stays open, a listed name is never read where it isn't the player", () => {
    assert.ok(PLAYER_LIST_BAKEOFF_CASES.length >= 12);
    assert.equal(tally(playerList).wrong, 0);
    for (const row of playerList) assert.equal(row.player, "right", `${row.name}: ${row.shown}`);
  });

  it("the lookup set: 20+ players our list doesn't have are named by the checklist or the card's sold titles, and every trap stays open", () => {
    const named = LOOKUP_BAKEOFF_CASES.filter((scan) => scan.truth.player || scan.liveTruth?.player);
    assert.ok(named.length >= 21, `${named.length} named cases`);
    assert.ok(LOOKUP_BAKEOFF_CASES.filter((scan) => !scan.truth.player && !scan.liveTruth?.player).length >= 6);
    assert.equal(tally(lookup).wrong, 0);
    LOOKUP_BAKEOFF_CASES.forEach((scan, index) => {
      const row = lookup[index];
      assert.equal(row.player, "right", `${row.name}: ${row.shown}`);
      const match = top(scan);
      // Where the name came from is what the case says: the checklist, the sold titles, or neither.
      assert.equal(match?.playerSource, scan.truth.playerSource, `${scan.name}: ${match?.playerSource ?? "no source"}`);
      // A looked-up player is never "sure" on the scan alone: the collector confirms it.
      if (match?.playerSource) assert.equal(match.sureness.player, "likely", scan.name);
    });
  });

  it("the Philon card: 2025-26 Panini Prizm #103 /175, the player named, never 'Player not read'", () => {
    const scan = LOOKUP_BAKEOFF_CASES[0];
    const match = top(scan);
    assert.ok(match);
    assert.equal(match.playerName, "Labaron Philon Jr.");
    assert.deepEqual([match.yearLabel, match.setBrand, match.cardNumber, match.serialRun, match.sport], ["2025-26", "Panini Prizm", "103", 175, "Basketball"]);
    // Without the checklist it is today's miss: open, never a guess.
    assert.equal(top({ ...scan, checklist: [] })?.playerName, "");
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

  it("no scan has a known miss: nothing is wrong on any field", () => {
    for (const scan of ALL_CASES) assert.deepEqual(scan.knownWrong ?? [], [], scan.name);
    assert.equal(tally(rows).wrong, 0);
  });

  it("the Miller card is never Topps, never a SKU, never FOR-4", () => {
    for (const scan of BAKEOFF_CASES.filter((item) => item.truth.player === "Aidan Miller")) {
      const shown = JSON.stringify(top(scan));
      assert.doesNotMatch(shown, /Topps|CMPO73107|FOR-4|SS-3B/i, scan.name);
    }
  });

  it("the flags a card prints are read: autograph, rookie, 1st Bowman, the subset, a player new to us", () => {
    let checked = 0;
    for (const scan of ALL_CASES) {
      const { auto, rookie, firstBowman, subset, playerNew, sapphirePick, setFromSales } = scan.truth;
      if (auto == null && rookie == null && firstBowman == null && subset == null && playerNew == null && sapphirePick == null && setFromSales == null) continue;
      checked += 1;
      const match = top(scan);
      assert.ok(match, scan.name);
      if (auto != null) assert.equal(match.isAuto, auto, `${scan.name}: auto`);
      if (rookie != null) assert.equal(match.isRookie, rookie, `${scan.name}: rookie`);
      if (firstBowman != null) assert.equal(Boolean(match.firstBowman), firstBowman, `${scan.name}: 1st Bowman`);
      if (subset != null) assert.equal(match.subset ?? "", subset, `${scan.name}: subset`);
      if (playerNew != null) assert.equal(Boolean(match.playerNew), playerNew, `${scan.name}: new player`);
      if (sapphirePick != null) assert.equal(Boolean(match.sapphireOption), sapphirePick, `${scan.name}: the Sapphire quick pick`);
      if (setFromSales != null) assert.equal(match.setSource === "sales", setFromSales, `${scan.name}: set from sales`);
      // Sapphire is the product, never the parallel.
      assert.doesNotMatch(match.parallel, /sapphire/i, scan.name);
      // An autograph, a variation and a numbered card are never Base, and never offered Base.
      if (match.isAuto || match.subset || match.serialRun != null) {
        assert.notEqual(match.parallel, "Base", scan.name);
        assert.ok(!match.parallelOptions.some((option) => option.name === "Base"), `${scan.name}: Base offered`);
      }
      // A SKU is never the card #.
      assert.doesNotMatch(match.cardNumber, /148134|CMP/i, scan.name);
    }
    assert.ok(checked >= 4);
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

type LiveRow = Row & { rung: string; solds: string; serialRun: number | null; calls: number; playerSource?: "checklist" | "sales" };

/** No checklist files: the scan reads the card and its sold titles alone. */
const NO_CHECKLIST = async (): Promise<readonly ProductRecord[]> => [];

async function scoreLive(scan: BakeoffCase, products: () => Promise<readonly ProductRecord[]> = NO_CHECKLIST): Promise<LiveRow> {
  let calls = 0;
  const queries: string[] = [];
  const result = await lookupLiveSolds(
    { capture: { lines: scan.front, backLines: scan.back, kind: scan.kind ?? "card" }, rows: scan.rows ?? [] },
    "bakeoff",
    {
      directory: INDEXED_DIRECTORY,
      products,
      checklists: async () => scan.checklist ?? [],
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
    // With live solds the titles can name a player the phone's first read left open.
    ...marks(match, scan.liveTruth ? { ...scan, truth: { ...scan.truth, player: scan.liveTruth.player } } : scan),
    calls,
    playerSource: match?.playerSource,
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

/** The live bake-off, once per checklist: none (the card and its sold titles alone), then the real files as production loads them. */
function liveBakeoff(suite: string, boardTitle: string, products: () => Promise<readonly ProductRecord[]>) {
  const live = (scan: BakeoffCase) => scoreLive(scan, products);
  describe(suite, () => {
  const cases = [...BAKEOFF_CASES, ...LOOKUP_BAKEOFF_CASES].filter((scan) => scan.live);

  it("prints the live scoreboard, and every case is right or open, never wrong", async () => {
    const rows = await Promise.all(cases.map(live));
    const total = (key: Field, value: Mark) => rows.filter((row) => row[key] === value).length;
    console.log(
      [
        `Scanner bake-off: ${boardTitle.toLowerCase()} (player set # parallel · rung · solds)`,
        ...rows.map(
          (row) =>
            `${ICON[row.player]} ${ICON[row.set]} ${ICON[row.number]} ${ICON[row.parallel]}  ${row.name.padEnd(56)} ${row.shown.padEnd(58)} ${row.rung.padEnd(36)} ${row.solds}`,
        ),
        ...board(boardTitle, rows),
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
      // The player the sold titles named, and how few searches it took.
      if (scan.liveTruth) {
        assert.equal(row.playerSource, scan.liveTruth.playerSource, `${row.name}: ${row.shown}`);
        if (scan.liveTruth.calls != null) assert.ok(row.calls <= scan.liveTruth.calls, `${row.name}: ${row.calls} searches`);
      }
      if (scan.live?.solds === "none") assert.equal(row.solds, "none (searched)", `${row.name}: searched, honestly none, never unavailable`);
      else assert.match(row.solds, /sold/, `${row.name}: the card sells, and we found it`);
      if (scan.truth.run) assert.equal(row.serialRun, scan.truth.run, `${row.name}: the print run`);
      if (scan.live?.pricedFrom) assert.match(row.solds, new RegExp(`sold \\(${scan.live.pricedFrom.replace("/", "\\/")}\\)$`), row.name);
      // A numbered card is never priced or labelled as Base.
      if (scan.truth.run) assert.doesNotMatch(row.solds, /\(Base\)/, row.name);
      // A price is always named by its sales' parallel: never Base for colored sales.
      if (scan.truth.parallel && row.solds.includes("sold")) {
        const names = [scan.truth.parallel, ...(scan.truth.parallelAlso ?? [])].map((name) => name.replace("/", "\\/")).join("|");
        assert.match(row.solds, new RegExp(`\\((?:${names})\\)$`), row.name);
      }
    }
  });

  it("Miller with live solds: 2024 Bowman #BP-27, Pink/Red /299, the Pink/Red sales only", async () => {
    for (const scan of cases.filter((item) => item.truth.player === "Aidan Miller" && item.truth.parallel === "Pink/Red")) {
      const row = await live(scan);
      assert.equal(row.set, "right", `${scan.name}: ${row.shown}`);
      assert.equal(row.number === "wrong", false, `${scan.name}: ${row.shown}`);
      assert.equal(row.parallel, "right", `${scan.name}: ${row.shown}`);
      assert.match(row.solds, /^3 sold \(Pink\/Red\)$/, `${scan.name}: ${row.solds}`);
    }
  });
});
}

liveBakeoff("the bake-off with live eBay solds (mocked Trawl, junk included)", "With live solds", NO_CHECKLIST);
liveBakeoff("the bake-off with live eBay solds and the real checklist files, as production loads them", "With live solds and the checklist", loadProductData);
