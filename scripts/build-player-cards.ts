/**
 * Builds lib/cards/data/player-cards/<sport>.json from the checklist store: for each player, the
 * base-set cards the checklists put them on. The scanner reads it only when a scan read a player
 * and nothing else (no year, set or card #), to offer that player's real cards to pick from
 * (lib/scan/closest.ts). Nothing is fetched: run it again after adding checklists.
 *
 *   npx tsx scripts/build-player-cards.ts
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isBaseSection, type ChecklistIndexEntry, type ChecklistProduct } from "@/lib/cards/checklists";
import { buildPlayerCards } from "@/lib/scan/closest";

const store = join(process.cwd(), "lib/cards/data/checklists");
const out = join(process.cwd(), "lib/cards/data/player-cards");
const index = JSON.parse(readFileSync(join(store, "index.json"), "utf8")) as ChecklistIndexEntry[];
mkdirSync(out, { recursive: true });

for (const sport of [...new Set(index.map((entry) => entry.sport))].sort()) {
  const products = index
    .filter((entry) => entry.sport === sport)
    .map((entry) => JSON.parse(readFileSync(join(store, `${entry.file}.json`), "utf8")) as ChecklistProduct);
  const built = buildPlayerCards(products, isBaseSection);
  const file = join(out, `${sport.toLowerCase()}.json`);
  writeFileSync(file, `${JSON.stringify(built)}\n`);
  console.log(`${sport}: ${built.products.length} products, ${Object.keys(built.players).length} players → ${file}`);
}
