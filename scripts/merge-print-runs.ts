/**
 * Fill the print runs in lib/cards/data/topps-parallels.json from the hobby-checklist parallel lists
 * already in the repo (scripts/checklist-csv/*.parallels.json). Not shipped: nothing imports it.
 * Nothing is fetched. The rules are in lib/cards/print-run-merge.ts (open beats wrong).
 *
 *   npx tsx scripts/merge-print-runs.ts            write the file and print what changed
 *   npx tsx scripts/merge-print-runs.ts --dry-run  print what would change, write nothing
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { hobbyListRecord, mergePrintRuns, withBowmanPrefixes, type RunSourceRow } from "@/lib/cards/print-run-merge";
import type { ProductRecord } from "@/lib/cards/product-data";

const ROOT = process.cwd();
const FILE = join(ROOT, "lib/cards/data/topps-parallels.json");
const dryRun = process.argv.includes("--dry-run");

const slug = (record: ProductRecord) => `${record.yearLabel}-${record.sport}-${record.product}`.toLowerCase().replace(/\s+/g, "-");

const records = JSON.parse(readFileSync(FILE, "utf8")) as ProductRecord[];
const merged = records.map((record) => {
  const path = join(ROOT, "scripts/checklist-csv", `${slug(record)}.parallels.json`);
  if (!existsSync(path)) {
    console.log(`${slug(record)}: no list with print runs in the repo, left as it is`);
    return record;
  }
  const source = JSON.parse(readFileSync(path, "utf8")) as { source?: string; parallels: RunSourceRow[] };
  const result = mergePrintRuns(withBowmanPrefixes(record), source);
  if (result.record === record && result.filled.length === 0) {
    console.log(`${slug(record)}: ${record.parallels.some((row) => row.serialRun != null) ? "already has print runs" : "nothing to fill"}, left as it is`);
    return record;
  }
  console.log(
    [
      `${slug(record)}: ${result.filled.length} filled, ${result.added.length} added, ${result.conflicts.length} left unknown (lists disagree), ${result.unmatched.length} not in the other list`,
      ...result.conflicts.map((line) => `    unknown: ${line}`),
      ...result.unmatched.map((line) => `    not found: ${line}`),
    ].join("\n"),
  );
  return result.record;
});

// Topps products with a hobby list in the repo and no list of ours: their base list, not official.
type HobbyFile = { sport: string; yearLabel: string; product: string; manufacturer: string; source?: string; parallels: RunSourceRow[] };
const have = new Set(merged.map(slug));
for (const file of readdirSync(join(ROOT, "scripts/checklist-csv")).filter((name) => name.endsWith(".parallels.json")).sort()) {
  const page = JSON.parse(readFileSync(join(ROOT, "scripts/checklist-csv", file), "utf8")) as HobbyFile;
  if (page.manufacturer !== "Topps") continue;
  const record = hobbyListRecord(page);
  if (!record || have.has(slug(record))) continue;
  have.add(slug(record));
  merged.push(record);
  const numbered = record.parallels.filter((row) => row.serialRun != null).length;
  console.log(`${slug(record)}: new list from the hobby page, ${record.parallels.length} parallels (${numbered} with a print run)`);
}

if (dryRun) {
  console.log("\nDry run: nothing written.");
} else {
  writeFileSync(FILE, `${JSON.stringify(merged, null, 2)}\n`);
  console.log(`\nWrote ${FILE.replace(`${ROOT}/`, "")}.`);
}
