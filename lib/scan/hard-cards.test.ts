import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadChecklistsFor } from "@/lib/cards/checklist-load";
import { loadProductData } from "@/lib/cards/product-data";
import type { TrawlSoldResult } from "@/lib/comps/types";
import { SCAN_DIRECTORY } from "@/lib/players/scan-directory";
import hardCards from "./hard-cards-v1.json";
import { HARD_FIELDS, hardCardBack, hardCardSet, markParallel, markPlayer, markRun, markSet, markText, type HardCard, type HardField, type Mark } from "./hard-cards";
import { lookupLiveSolds } from "./live-solds";
import { rankScanMatches, scanCardKey, type ScanMatch } from "./match";
import { scanReadFrom } from "./session";

/**
 * The hard-cards set through the same path the app takes, twice:
 *   1. the scan alone: the front and back text, the store's checklists and the parallel files;
 *   2. with sold titles: the same scan, and the card's real seller titles as the (mocked) search.
 * Each field is scored right, open or wrong, and reported on its own. Nothing is fetched.
 * Any wrong fails. Open beats wrong.
 */

const CARDS = (hardCards as { cards: HardCard[] }).cards;
const ICON: Record<Mark, string> = { right: "✓", open: "·", wrong: "✗" };

type Row = Record<HardField, Mark> & { id: string; label: string; shown: string };

function marks(match: ScanMatch | undefined, card: HardCard): Record<HardField, Mark> {
  return {
    player: markPlayer(match?.playerName ?? "", card.player, card.player_also),
    year: markText(match?.yearLabel ?? "", card.year),
    set: markSet(match?.setBrand ?? "", card),
    number: markText(match?.cardNumber ?? "", card.card_number),
    parallel: markParallel(match?.parallel ?? "", card),
    run: markRun(match?.serialRun, card.print_run),
  };
}

function shownLine(match: ScanMatch | undefined): string {
  if (!match) return "(no match)";
  return [match.playerName, match.yearLabel, match.setBrand, match.cardNumber ? `#${match.cardNumber}` : "", match.parallel, match.serialRun ? `/${match.serialRun}` : ""].filter(Boolean).join(" · ");
}

const label = (card: HardCard) => `${card.id} ${card.player}, ${card.year} ${hardCardSet(card.product)} #${card.card_number}${card.parallel ? ` ${card.parallel}` : ""}${card.print_run ? ` /${card.print_run}` : ""}`;
const row = (card: HardCard, match: ScanMatch | undefined): Row => ({ id: card.id, label: label(card), ...marks(match, card), shown: shownLine(match) });
const capture = (card: HardCard) => ({ lines: card.typical_ocr_front, backLines: hardCardBack(card), kind: "card" as const });

async function scanAlone(card: HardCard): Promise<Row> {
  const read = scanReadFrom({ ...capture(card), image: null, alternates: null, backAlternates: null, cert: null }, SCAN_DIRECTORY);
  const key = scanCardKey(read, SCAN_DIRECTORY);
  const checklists = key ? await loadChecklistsFor(key) : [];
  return row(card, rankScanMatches(read, [], { directory: SCAN_DIRECTORY, products: await loadProductData(), soldTitles: [], checklists }).matches[0]);
}

/** The card's real seller titles as a sold search's answer. Prices are not scored. */
function soldResults(card: HardCard): TrawlSoldResult[] {
  return card.listing_title_examples.map((title, index) => ({
    title,
    sale_price: 10,
    shipping_price: null,
    currency: "USD",
    condition: "Ungraded",
    condition_raw: null,
    date_sold: "2026-11-10T18:00:00.000Z",
    buying_format: "Auction",
    item_id: `${card.id}-${index}`,
    item_link: "",
    image_url: null,
    details: { grading: { graded: false, grader: null, grade: null, condition: null } },
  }));
}

async function withSoldTitles(card: HardCard): Promise<Row> {
  const result = await lookupLiveSolds({ capture: capture(card), rows: [] }, "hard-cards", {
    directory: SCAN_DIRECTORY,
    products: loadProductData,
    checklists: (key) => loadChecklistsFor(key),
    cachedTitles: async () => [],
    quickCompCache: async () => null,
    liveSearch: async () => ({ ok: true, results: soldResults(card), fetchedAt: "2026-11-12T20:00:00.000Z" }),
    storeQuickComp: async () => {},
  });
  return row(card, result.matches[0]);
}

function board(title: string, rows: readonly Row[]): string[] {
  const count = (field: HardField, value: Mark) => rows.filter((item) => item[field] === value).length;
  const all = (value: Mark) => HARD_FIELDS.reduce((sum, field) => sum + count(field, value), 0);
  return [
    `${title} (${rows.length} cards): ${all("right")} right, ${all("open")} open, ${all("wrong")} wrong`,
    ...HARD_FIELDS.map((field) => `  ${field.padEnd(8)} ${count(field, "right")} right · ${count(field, "open")} open · ${count(field, "wrong")} wrong`),
  ];
}

function report(title: string, rows: readonly Row[]): string {
  return [
    `${title} (${HARD_FIELDS.join(" ")}: ✓ right · open ✗ wrong)`,
    ...rows.map((item) => `${HARD_FIELDS.map((field) => ICON[item[field]]).join(" ")}  ${item.label.padEnd(84)} ${item.shown}`),
    ...board(title, rows),
  ].join("\n");
}

function assertNoWrong(rows: readonly Row[]) {
  for (const item of rows) for (const field of HARD_FIELDS) assert.notEqual(item[field], "wrong", `${item.label}: ${field}: ${item.shown}`);
}

describe("the hard-cards set", () => {
  it("the file is well formed: unique hc- ids, a front, and a truth for every field", () => {
    assert.ok(CARDS.length >= 73);
    assert.equal(new Set(CARDS.map((card) => card.id)).size, CARDS.length);
    for (const card of CARDS) {
      assert.match(card.id, /^hc-\d{3,}$/, card.id);
      assert.ok(card.player && card.year && card.product && card.card_number, card.id);
      assert.ok(Array.isArray(card.typical_ocr_front) && card.typical_ocr_front.length > 0, card.id);
      assert.ok(card.parallel === null || card.parallel.trim(), card.id);
      assert.ok(card.print_run === null || Number.isInteger(card.print_run), card.id);
      assert.ok(Array.isArray(card.listing_title_examples), card.id);
    }
  });

  it("the scan alone: no field is wrong on any card", async () => {
    const rows = await Promise.all(CARDS.map(scanAlone));
    console.log(report("Hard cards, the scan alone", rows));
    assertNoWrong(rows);
  });

  it("with the card's sold titles (mocked): no field is wrong on any card", async () => {
    const rows = await Promise.all(CARDS.map(withSoldTitles));
    console.log(report("Hard cards, with sold titles", rows));
    assertNoWrong(rows);
  });
});
