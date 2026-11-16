/**
 * Read a Checklist Insider page into the two files the earlier imports keep in scripts/checklist-csv/:
 * <year>-<sport>-<product>.csv (the card checklist) and .parallels.json (each section's parallels and
 * print runs, not official). Not shipped: nothing imports it. The parsing is in
 * lib/cards/checklist-insider.ts.
 *
 *   npx tsx scripts/checklist-insider-import.ts --sport Football --year 2025 --product "Topps Chrome" \
 *     --manufacturer Topps --title "2025 Topps Chrome Football" \
 *     --from https://www.checklistinsider.com/2025-topps-chrome-football
 *
 * --from can also be a saved .html file; --source then names the page it was saved from.
 * Then load them the usual way:
 *   npx tsx scripts/import-checklist.ts --sport Football --year 2025 --product "Topps Chrome" \
 *     --from scripts/checklist-csv/2025-football-topps-chrome.csv --source <page> --read <day>
 *   npx tsx scripts/merge-print-runs.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { insiderCsv, parseInsiderPage } from "@/lib/cards/checklist-insider";
import { checklistFileName } from "@/lib/cards/checklists";

function flag(name: string): string {
  const at = process.argv.indexOf(`--${name}`);
  const value = at >= 0 ? process.argv[at + 1] : undefined;
  if (!value || value.startsWith("--")) {
    console.error(`--${name} is needed. See the top of scripts/checklist-insider-import.ts.`);
    process.exit(1);
  }
  return value;
}

async function main() {
  const sport = flag("sport");
  const yearLabel = flag("year");
  const product = flag("product");
  const manufacturer = flag("manufacturer");
  const title = flag("title");
  const from = flag("from");
  const local = !/^https?:\/\//i.test(from);
  const source = local ? flag("source") : from;
  const html = local ? readFileSync(from, "utf8") : await (await fetch(from, { headers: { "User-Agent": "Mozilla/5.0 (checklist import)" } })).text();
  const page = parseInsiderPage(html, title);
  if (page.cards.length < 20) {
    console.error(`Only ${page.cards.length} cards read: not a checklist page this script can read. Nothing written.`);
    process.exit(1);
  }
  const slug = checklistFileName({ sport, yearLabel, product });
  const dir = join(process.cwd(), "scripts/checklist-csv");
  writeFileSync(join(dir, `${slug}.csv`), insiderCsv(page.cards));
  writeFileSync(
    join(dir, `${slug}.parallels.json`),
    `${JSON.stringify({ sport, yearLabel, product, manufacturer, source, official: false, parallels: page.parallels }, null, 1)}\n`,
  );
  const sets = new Set(page.cards.map((card) => card.set)).size;
  console.log(`${slug}: ${page.cards.length} cards in ${sets} sets, ${page.parallels.length} parallel rows. Wrote scripts/checklist-csv/${slug}.csv and .parallels.json.`);
}

void main();
