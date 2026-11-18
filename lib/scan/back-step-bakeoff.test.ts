import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadChecklistsFor } from "@/lib/cards/checklist-load";
import type { ChecklistProduct } from "@/lib/cards/checklists";
import { loadProductData } from "@/lib/cards/product-data";
import { SCAN_DIRECTORY } from "@/lib/players/scan-directory";
import { withAlternates } from "./alternates";
import { needsBackStep } from "./back-step";
import { BAKEOFF_CASES, type BakeoffCase } from "./bakeoff-fixtures";
import { ERA_BAKEOFF_CASES } from "./bakeoff-fixtures-era";
import { LOOKUP_BAKEOFF_CASES } from "./bakeoff-fixtures-lookup";
import { PLAYER_LIST_BAKEOFF_CASES } from "./bakeoff-fixtures-players";
import { WIDE_BAKEOFF_CASES } from "./bakeoff-fixtures-wide";
import hardCards from "./hard-cards-v1.json";
import { hardCardBack, markParallel as markHardParallel, markPlayer, markRun as markHardRun, markSet, markText, type HardCard } from "./hard-cards";
import { rankScanMatches, scanChecklistKey, type ScanMatch, type ScanMatchResult } from "./match";
import { scanReadFrom, type ScanCapture } from "./session";

/**
 * "Flip it over", before and after, on every raw card in the bake-off that has a back and every raw
 * hard card. Before: the front alone (a library photo, or the back skipped). After: the new flow:
 * the front alone when it already pins the year, set and card #, else the front and the back.
 * Scored right, open or wrong per field as the bake-offs score them. Any wrong after fails
 * (bar a bake-off scan's own known misses, which the full bake-off already holds).
 */

type Mark = "right" | "open" | "wrong";
const FIELDS = ["player", "year", "set", "number", "run", "parallel"] as const;
type Field = (typeof FIELDS)[number];
type Marks = Record<Field, Mark>;

type Subject = {
  name: string;
  front: ScanCapture;
  back: string[];
  known: readonly Field[];
  rows: BakeoffCase["rows"];
  titles: BakeoffCase["titles"];
  checklist: ChecklistProduct[];
  /** Read as its own bake-off reads it: the bake-off's "All" board uses no product lists and only the scan's own checklist. */
  store: boolean;
  marks: (match: ScanMatch | undefined) => Marks;
};

// The bake-off's own scoring (lib/scan/bakeoff.test.ts).
const norm = (value: string) =>
  value
    .toLowerCase()
    .replace(/^panini\s+/, "")
    .split(/[^a-z0-9]+/)
    .filter((word) => word && word !== "paper")
    .sort()
    .join(" ");
const mark = (got: string, truth: string): Mark => (!got.trim() ? "open" : norm(got) === norm(truth) ? "right" : "wrong");

function bakeoffMarks(scan: BakeoffCase) {
  return (match: ScanMatch | undefined): Marks => {
    const truthRun = scan.truth.run ?? null;
    const got = match?.serialRun;
    const run: Mark = truthRun == null ? (got == null ? "right" : "wrong") : got == null ? "open" : got === truthRun ? "right" : scan.misreadRun != null && got === scan.misreadRun ? "open" : "wrong";
    const shown = match?.parallel ?? "";
    const parallel: Mark =
      shown.trim() && (scan.truth.parallelAlso ?? []).some((name) => norm(name) === norm(shown))
        ? "right"
        : !scan.truth.parallel || norm(scan.truth.parallel) === "base"
          ? !shown || norm(shown) === "base"
            ? "right"
            : "wrong"
          : mark(shown, scan.truth.parallel);
    return {
      // A blank player is open here (the full bake-off needs the player every time, front and back read).
      player: !scan.truth.player ? (!match?.playerName ? "right" : "wrong") : !match?.playerName ? "open" : match.playerName === scan.truth.player ? "right" : "wrong",
      year: scan.truth.year ? mark(match?.yearLabel ?? "", scan.truth.year) : "right",
      set: mark(match?.setBrand ?? "", scan.truth.set),
      number: mark(match?.cardNumber ?? "", scan.truth.number),
      run,
      parallel,
    };
  };
}

function hardMarks(card: HardCard) {
  return (match: ScanMatch | undefined): Marks => ({
    player: markPlayer(match?.playerName ?? "", card.player, card.player_also),
    year: markText(match?.yearLabel ?? "", card.year),
    set: markSet(match?.setBrand ?? "", card),
    number: markText(match?.cardNumber ?? "", card.card_number),
    run: markHardRun(match?.serialRun, card.print_run),
    parallel: markHardParallel(match?.parallel ?? "", card),
  });
}

const ALL: BakeoffCase[] = [...BAKEOFF_CASES, ...WIDE_BAKEOFF_CASES, ...PLAYER_LIST_BAKEOFF_CASES, ...LOOKUP_BAKEOFF_CASES, ...ERA_BAKEOFF_CASES];
const BAKEOFF: Subject[] = ALL
  .filter((scan) => (scan.kind ?? "card") === "card" && scan.back?.length)
  .map((scan) => ({
    name: scan.name,
    front: { lines: scan.front, backLines: null, image: null, kind: "card" as const, alternates: scan.alternates ?? null },
    back: scan.back!,
    known: scan.knownWrong ?? [],
    rows: scan.rows,
    titles: scan.titles,
    checklist: scan.checklist ?? [],
    store: false,
    marks: bakeoffMarks(scan),
  }));

const HARD: Subject[] = (hardCards as { cards: HardCard[] }).cards
  // A card scanned with no back (front_only) has no Flip step to score.
  .filter((card) => card.kind !== "slab" && !card.front_only)
  .map((card) => ({
    name: `${card.id} ${card.player}`,
    front: { lines: card.typical_ocr_front, backLines: null, image: null, kind: "card" as const },
    back: hardCardBack(card) ?? [],
    known: [],
    rows: [],
    titles: [],
    checklist: [],
    store: true,
    marks: hardMarks(card),
  }));

async function run(subject: Subject, capture: ScanCapture): Promise<ScanMatchResult> {
  const settled = withAlternates(capture, SCAN_DIRECTORY);
  const read = scanReadFrom(settled, SCAN_DIRECTORY);
  if (!subject.store) return rankScanMatches(read, subject.rows ?? [], { directory: SCAN_DIRECTORY, products: null, soldTitles: subject.titles ?? [], checklists: subject.checklist });
  const key = scanChecklistKey(read, SCAN_DIRECTORY);
  const checklists = key ? await loadChecklistsFor(key) : [];
  return rankScanMatches(read, [], { directory: SCAN_DIRECTORY, products: await loadProductData(), soldTitles: [], checklists });
}

type Row = { subject: Subject; asked: boolean; before: Marks; after: Marks };

async function score(subject: Subject): Promise<Row> {
  const front = await run(subject, subject.front);
  const asked = needsBackStep(subject.front, front, "library");
  const after = asked ? await run(subject, { ...subject.front, backLines: subject.back }) : front;
  return { subject, asked, before: subject.marks(front.matches[0]), after: subject.marks(after.matches[0]) };
}

function board(title: string, rows: readonly Row[], key: "before" | "after"): string {
  const count = (value: Mark) => rows.reduce((sum, row) => sum + FIELDS.filter((field) => row[key][field] === value && !(value === "wrong" && row.subject.known.includes(field))).length, 0);
  const pinned = rows.filter((row) => (["year", "set", "number"] as const).every((field) => row[key][field] === "right")).length;
  return `${title} ${key === "before" ? "front only " : "with Flip "}(${rows.length} cards): ${count("right")} right, ${count("open")} open, ${count("wrong")} wrong · year, set and # all right on ${pinned}`;
}

function wrongs(row: Row): string[] {
  return FIELDS.filter((field) => row.after[field] === "wrong" && !row.subject.known.includes(field)).map((field) => `${row.subject.name}: ${field}`);
}

describe("Flip it over, before and after", () => {
  it("the bake-off's raw scans with a back, and the raw hard cards: more pinned, 0 wrong", async () => {
    const bakeoff = await Promise.all(BAKEOFF.map(score));
    // A slab never asks: its label prints the year, set and card #.
    const slabs = ALL.filter((scan) => scan.kind === "slab");
    const slabAsks = slabs.filter((scan) =>
      needsBackStep({ lines: scan.front, backLines: null, image: null, kind: "slab" }, { matches: [], settled: false }, "library"),
    ).length;
    const hard = await Promise.all(HARD.map(score));
    const lines = [
      board("Bake-off", bakeoff, "before"),
      board("Bake-off", bakeoff, "after"),
      `  asked for the back on ${bakeoff.filter((row) => row.asked).length} of ${bakeoff.length}; the front was enough on ${bakeoff.filter((row) => !row.asked).length}`,
      `  slabs: asked on ${slabAsks} of ${slabs.length} (the label has it)`,
      board("Hard cards", hard, "before"),
      board("Hard cards", hard, "after"),
      `  asked for the back on ${hard.filter((row) => row.asked).length} of ${hard.length}; the front was enough on ${hard.filter((row) => !row.asked).length}`,
    ];
    console.log(lines.join("\n"));
    assert.ok(BAKEOFF.length >= 20 && HARD.length >= 70, `${BAKEOFF.length} bake-off, ${HARD.length} hard`);
    assert.equal(slabAsks, 0);
    assert.deepEqual([...bakeoff, ...hard].flatMap(wrongs), []);
  });
});
