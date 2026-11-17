import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadChecklistsFor } from "@/lib/cards/checklist-load";
import { loadProductData } from "@/lib/cards/product-data";
import { SCAN_DIRECTORY } from "@/lib/players/scan-directory";
import hardCards from "./hard-cards-v1.json";
import { hardCardBack, markParallel, type HardCard } from "./hard-cards";
import { rankScanMatches, scanChecklistKey, type ScanMatch } from "./match";
import type { PhotoLook } from "./photo-look";
import { scanReadFrom } from "./session";

/**
 * "Which version?" before and after the photo's look, on the hard cards that carry one (and the
 * ones whose photo was unclear). Scored per card:
 *   - is the real parallel among the chips, and where;
 *   - how many chips there are.
 * Wrong, any of: the look picked a parallel (the field changed), dropped the real parallel or
 * Base off the chips, or changed anything at all for an unclear photo. Any wrong fails.
 */

const CARDS = (hardCards as { cards: HardCard[] }).cards.filter((card) => card.photo_look || card.category === "photo_look_unclear");

async function top(card: HardCard, look: PhotoLook | null): Promise<ScanMatch | undefined> {
  const read = scanReadFrom(
    { lines: card.typical_ocr_front, backLines: hardCardBack(card), kind: card.kind ?? "card", image: null, look },
    SCAN_DIRECTORY,
  );
  const key = scanChecklistKey(read, SCAN_DIRECTORY);
  const checklists = key ? await loadChecklistsFor(key) : [];
  return rankScanMatches(read, [], { directory: SCAN_DIRECTORY, products: await loadProductData(), soldTitles: [], checklists }).matches[0];
}

type Side = { at: number | null; chips: number; names: string[]; parallel: string };

function side(match: ScanMatch | undefined, card: HardCard): Side {
  const names = match?.parallelOptions.map((option) => option.name) ?? [];
  // The plain "Refractor" is the card's own name: markParallel compares give or take "Refractor".
  const same = (name: string) => name.toLowerCase() === (card.parallel ?? "").toLowerCase() || markParallel(name, card) === "right";
  const index = names.findIndex(same);
  return { at: index < 0 ? null : index + 1, chips: names.length, names, parallel: match?.parallel ?? "" };
}

function wrongs(card: HardCard, before: Side, after: Side): string[] {
  const out: string[] = [];
  if (after.parallel !== before.parallel) out.push(`the parallel changed: "${before.parallel}" to "${after.parallel}"`);
  if (before.at != null && after.at == null) out.push("the real parallel dropped off the chips");
  if (before.names.includes("Base") && !after.names.includes("Base")) out.push("Base dropped off the chips");
  if (!card.photo_look && before.names.join("|") !== after.names.join("|")) out.push("an unclear photo changed the chips");
  return out;
}

const place = (at: number | null) => (at == null ? "not shown" : `#${at}`);

describe("Which version? ranked by the photo's look", () => {
  it("before and after, on the hard cards with a look: never a pick, never a drop, 0 wrong", async () => {
    assert.ok(CARDS.length >= 10, `${CARDS.length} cards`);
    const rows: { card: HardCard; before: Side; after: Side; wrong: string[] }[] = [];
    for (const card of CARDS) {
      const before = side(await top(card, null), card);
      const after = side(await top(card, card.photo_look ?? null), card);
      rows.push({ card, before, after, wrong: wrongs(card, before, after) });
    }
    const sum = (pick: (row: (typeof rows)[number]) => number) => rows.reduce((total, row) => total + pick(row), 0);
    const named = rows.filter((row) => row.card.parallel);
    const shown = (key: "before" | "after") => named.filter((row) => row[key].at != null).length;
    const first3 = (key: "before" | "after") => named.filter((row) => row[key].at != null && row[key].at! <= 3).length;
    const firstOne = (key: "before" | "after") => named.filter((row) => row[key].at === 1).length;
    const report = [
      "Which version? before → after the photo's look",
      ...rows.map(
        ({ card, before, after, wrong }) =>
          `${card.id} ${(card.parallel ?? "Base").padEnd(18)} ${place(before.at).padStart(9)} of ${before.chips} → ${place(after.at).padStart(9)} of ${after.chips}${wrong.length ? `  WRONG: ${wrong.join("; ")}` : ""}`,
      ),
      `Real parallel on the chips: ${shown("before")}/${named.length} → ${shown("after")}/${named.length}`,
      `Real parallel in the first 3: ${first3("before")}/${named.length} → ${first3("after")}/${named.length}`,
      `Real parallel first: ${firstOne("before")}/${named.length} → ${firstOne("after")}/${named.length}`,
      `Chips shown: ${sum((row) => row.before.chips)} → ${sum((row) => row.after.chips)}`,
      `Wrong: ${sum((row) => row.wrong.length)}`,
    ].join("\n");
    console.log(report);
    for (const row of rows) assert.deepEqual(row.wrong, [], `${row.card.id}: ${row.wrong.join("; ")}`);
    // The look has to earn its place: more real parallels up front than before.
    assert.ok(first3("after") > first3("before"), report);
  });
});
