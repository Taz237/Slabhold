/**
 * Writes lib/quick-comp/data/player-names.json: every player name in our checklists and both
 * player directories, once each. Quick Comp's player search suggests from it on the server.
 * Run after importing checklists: `npx tsx scripts/build-quick-comp-names.ts`.
 * A name our sources spell more than one way keeps the spelling lib/quick-comp/data/player-name-aliases.json
 * names; add a line there when a rebuild changes a spelling for the worse.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildPlayerNames } from "../lib/quick-comp/player-names";

const root = join(__dirname, "..");
const checklistDir = join(root, "lib/cards/data/checklists");
type Product = { yearLabel: string; sections: { cards: [string, string, number][] }[] };
const products = readdirSync(checklistDir)
  .filter((file) => file.endsWith(".json") && file !== "index.json")
  .map((file) => JSON.parse(readFileSync(join(checklistDir, file), "utf8")) as Product);
const startYear = (product: Product) => Number(product.yearLabel.slice(0, 4));
const newest = Math.max(...products.map(startYear));
const names: { name: string; recent?: boolean }[] = [];
for (const product of products) {
  const recent = startYear(product) >= newest - 1;
  for (const section of product.sections) for (const card of section.cards) names.push({ name: card[1], recent });
}
const roster = JSON.parse(readFileSync(join(root, "lib/players/directory.json"), "utf8")) as { name: string }[];
const more = JSON.parse(readFileSync(join(root, "lib/players/directory-more.json"), "utf8")) as Record<string, string[]>;
names.push(...roster.map((row) => ({ name: row.name })), ...Object.values(more).flat().map((name) => ({ name })));

const aliases = JSON.parse(readFileSync(join(root, "lib/quick-comp/data/player-name-aliases.json"), "utf8")) as Record<string, string[]>;
const out = buildPlayerNames(names, aliases);
writeFileSync(join(root, "lib/quick-comp/data/player-names.json"), `${JSON.stringify(out)}\n`);
console.log(`${out.length} names`);
