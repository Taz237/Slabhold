/**
 * Add a card the scanner missed to the hard-cards bake-off set, in one step.
 * Not shipped: nothing imports it. Nothing is fetched and nothing outside the repo is touched.
 *
 *   npx tsx scripts/add-hard-card.ts \
 *     --player "Jaxson Dart" --year 2025 --product "Topps Chrome Football" --number 306 \
 *     --parallel "X-Fractor" --slab --rookie \
 *     --front "2025 TOPPS CHROME #306|JAXSON DART|X-FRACTOR|GEM MT 10|PSA|98765432" \
 *     --why "Showed as #306 Base." \
 *     --title "2025 Topps Chrome Jaxson Dart X-Fractor #306 RC PSA 10"
 *
 * Needed: --player --year --product --number --front --why.
 *   --front / --back   the lines as the phone read them, split with |  (a slab's front is its label)
 *   --parallel         leave off, or "Base", for a base card
 *   --run 175          the print run, for a numbered card
 *   --slab             a graded slab        --rookie   a rookie card
 *   --title "…"        a sold title for the card, as sellers word it (repeat for more)
 *   --team --sport --manufacturer --category --player-also --parallel-also --source   optional
 *   --dry-run          show the card and its score, write nothing
 *
 * It appends the card to lib/scan/hard-cards-v1.json with the next hc- id, then runs the scanner
 * on it and prints each field as right, open or WRONG. A real miss prints WRONG: `npm test` then
 * fails on it until the scanner is fixed, which is the point. Open beats wrong.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildHardCard, hardCardReport, parseHardCardArgs, scoreHardCard } from "@/lib/scan/hard-card-add";
import type { HardCard } from "@/lib/scan/hard-cards";

const FILE = join(process.cwd(), "lib/scan/hard-cards-v1.json");

async function main() {
  const { input, dryRun, errors } = parseHardCardArgs(process.argv.slice(2));
  if (errors.length > 0) {
    console.error(["Can't add the card yet:", ...errors.map((line) => `  - ${line}`), "", "See the top of scripts/add-hard-card.ts for an example."].join("\n"));
    process.exitCode = 1;
    return;
  }
  const set = JSON.parse(readFileSync(FILE, "utf8")) as { cards: HardCard[] };
  const card = buildHardCard(input, set.cards);
  const score = await scoreHardCard(card);
  console.log(hardCardReport(card, score));
  if (dryRun) {
    console.log("\nDry run: nothing written.\n" + JSON.stringify(card, null, 1));
    return;
  }
  set.cards.push(card);
  writeFileSync(FILE, `${JSON.stringify(set, null, 1)}\n`);
  console.log(`\nAdded ${card.id} to lib/scan/hard-cards-v1.json. Run the set with:\n  npx tsx --test lib/scan/hard-cards.test.ts`);
}

void main();
