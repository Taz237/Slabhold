/**
 * Add a product's checklist (card #, player, team) to the store in lib/cards/data/checklists/.
 * The scanner looks the player up there once it has read the year, set and card #.
 *
 * One product:
 *   npx tsx scripts/import-checklist.ts --sport Football --year 2023 --product "Panini Prizm" \
 *     --from https://www.cardboardconnection.com/2023-panini-prizm-football-nfl-cards
 *
 * `--from` is a checklist page (URL, or a saved .html file) or the maker's own checklist CSV
 * (a .csv file, e.g. Panini's download). `--product` is the set name as Add card spells it.
 *
 * Every product in the list (scripts/checklist-sources.json: add a row, then run this):
 *   npx tsx scripts/import-checklist.ts --all            only the ones not in the store yet
 *   npx tsx scripts/import-checklist.ts --all --refresh  read every one again
 *
 * Each import writes <year>-<sport>-<product>.json and its row in index.json: the source and the
 * day it was read. That file is the log of where every checklist came from. Pages are fetched
 * one at a time with a pause between them. A page with no checklist on it is reported and skipped.
 *
 * Two rows with the same sport, year and product are one checklist in two parts (Topps Series 1
 * and Series 2 are both "Topps"): they are read into one file, and both sources are logged.
 * `--add` does the same for a single import: it adds to the file instead of replacing it.
 *
 * A page saved as a file (scripts/checklist-csv/): `--source <url>` logs the page it came from
 * in place of the file name, and `--read YYYY-MM-DD` the day that page was read.
 *
 * CHECKLIST_PAGE_CACHE=<dir>: a page already saved there as <last part of the URL>.html is read
 * from disk instead of fetched again. The URL is still what gets logged.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { checklistCardCount, checklistProductFrom, sectionsFromChecklistPage, sectionsFromMakerCsv, type ImportedSection } from "@/lib/cards/checklist-import";
import { checklistFileName, type ChecklistIndexEntry, type ChecklistProduct } from "@/lib/cards/checklists";
import { SCAN_DIRECTORY } from "@/lib/players/scan-directory";
import { nameKey } from "@/lib/scan/player-lookup";

/** `source`: the page a local file was saved from, logged in its place. `read`: the day that page was read. */
type Source = { sport: string; year: string; product: string; from: string; source?: string; read?: string };

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const storeDir = join(root, "lib", "cards", "data", "checklists");
const indexFile = join(storeDir, "index.json");
const sourcesFile = join(root, "scripts", "checklist-sources.json");
const PAUSE_MS = 6000;
/** Fewer cards than this is not a product's checklist: a preview page, or a layout we can't read. */
const MIN_CARDS = 20;

/** Our player list: tells "Chan Ho Park" (kept) from "Petco Park" (a ballpark card, left out). */
const people = new Set(SCAN_DIRECTORY.map((player) => nameKey(player.name)));
const knownPerson = (name: string) => people.has(nameKey(name));

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function readIndex(): ChecklistIndexEntry[] {
  return existsSync(indexFile) ? (JSON.parse(readFileSync(indexFile, "utf8")) as ChecklistIndexEntry[]) : [];
}

async function readSource(from: string): Promise<string> {
  if (!/^https?:\/\//i.test(from)) return readFileSync(from, "utf8");
  const saved = process.env.CHECKLIST_PAGE_CACHE ? join(process.env.CHECKLIST_PAGE_CACHE, `${from.replace(/\/+$/, "").split("/").pop()}.html`) : "";
  if (saved && existsSync(saved)) return readFileSync(saved, "utf8");
  for (let attempt = 1; ; attempt += 1) {
    const response = await fetch(from, { headers: { "User-Agent": "Mozilla/5.0 (checklist import)" }, redirect: "follow" });
    if (response.ok) return response.text();
    if (attempt >= 3 || ![429, 500, 502, 503, 504].includes(response.status)) throw new Error(`HTTP ${response.status}`);
    await sleep(PAUSE_MS * attempt * 2);
  }
}

/** A local file is logged by its name only, never a path on someone's machine. */
const sourceLabel = (part: Source) => part.source || (/^https?:\/\//i.test(part.from) ? part.from : part.from.split(/[\\/]/).pop()!);

/** One product, from one source or from its parts. `keep`: the file's cards so far, for --add. */
async function importOne(parts: Source[], keep = false): Promise<ChecklistIndexEntry | null> {
  const [first] = parts;
  const file = checklistFileName({ sport: first.sport, yearLabel: first.year, product: first.product });
  const path = join(storeDir, `${file}.json`);
  const before = keep && existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as ChecklistProduct) : null;
  const sections: ImportedSection[] = (before?.sections ?? []).map((section) => ({
    name: section.name,
    cards: section.cards.map(([number, player, team]) => ({ number, player, team: before!.teams[team] ?? "" })),
  }));
  const sources = before ? before.source.split(" + ") : [];
  for (const [at, part] of parts.entries()) {
    const text = await readSource(part.from);
    const found = /\.csv$/i.test(part.from) ? sectionsFromMakerCsv(text, knownPerson) : sectionsFromChecklistPage(text, knownPerson);
    if (found.reduce((sum, section) => sum + section.cards.length, 0) < MIN_CARDS) continue;
    for (const section of found) {
      const same = sections.find((item) => item.name === section.name);
      // The same card listed in two parts is kept once.
      const have = new Set((same?.cards ?? []).map((card) => `${card.number}|${card.player}`));
      const fresh = section.cards.filter((card) => !have.has(`${card.number}|${card.player}`));
      if (same) same.cards.push(...fresh);
      else sections.push({ name: section.name, cards: fresh });
    }
    if (!sources.includes(sourceLabel(part))) sources.push(sourceLabel(part));
    if (at < parts.length - 1 && /^https?:/i.test(part.from)) await sleep(PAUSE_MS);
  }
  if (sources.length === 0) return null;
  const meta = { sport: first.sport, yearLabel: first.year, product: first.product, source: sources.join(" + "), read: parts.find((part) => part.read)?.read ?? new Date().toISOString().slice(0, 10) };
  const product = checklistProductFrom(meta, sections);
  const cards = checklistCardCount(product);
  if (cards < MIN_CARDS) return null;
  writeFileSync(path, `${JSON.stringify(product)}\n`);
  const entry: ChecklistIndexEntry = { file, ...meta, cards };
  const index = readIndex().filter((item) => item.file !== file);
  index.push(entry);
  index.sort((a, b) => a.file.localeCompare(b.file));
  writeFileSync(indexFile, `${JSON.stringify(index, null, 1)}\n`);
  return entry;
}

function flag(name: string): string {
  const at = process.argv.indexOf(`--${name}`);
  return at >= 0 ? (process.argv[at + 1] ?? "") : "";
}

async function main() {
  const all = process.argv.includes("--all");
  const refresh = process.argv.includes("--refresh");
  let sources: Source[];
  if (all) {
    sources = JSON.parse(readFileSync(sourcesFile, "utf8")) as Source[];
    if (!refresh) {
      const have = new Set(readIndex().map((item) => item.file));
      sources = sources.filter((item) => !have.has(checklistFileName({ sport: item.sport, yearLabel: item.year, product: item.product })));
    }
  } else {
    const one: Source = { sport: flag("sport"), year: flag("year"), product: flag("product"), from: flag("from") };
    if (flag("source")) {
      if (!/^https?:\/\/\S+$/i.test(flag("source"))) {
        console.error("--source is the URL of the page the file was saved from.");
        process.exit(1);
      }
      one.source = flag("source");
    }
    if (flag("read")) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(flag("read"))) {
        console.error("--read is the day the page was read, as YYYY-MM-DD.");
        process.exit(1);
      }
      one.read = flag("read");
    }
    if (!one.sport || !one.year || !one.product || !one.from) {
      console.error('Usage: npx tsx scripts/import-checklist.ts --sport Football --year 2023 --product "Panini Prizm" --from <url | page.html | checklist.csv>\n       npx tsx scripts/import-checklist.ts --all [--refresh]');
      process.exit(1);
    }
    sources = [one];
  }
  // Rows for the same sport, year and product are one checklist in parts.
  const groups = new Map<string, Source[]>();
  for (const source of sources) {
    const file = checklistFileName({ sport: source.sport, yearLabel: source.year, product: source.product });
    groups.set(file, [...(groups.get(file) ?? []), source]);
  }
  let added = 0;
  let at = 0;
  for (const parts of groups.values()) {
    const label = `${parts[0].year} ${parts[0].product} (${parts[0].sport})`;
    const from = parts.map((part) => part.from).join(", ");
    try {
      const entry = await importOne(parts, !all && process.argv.includes("--add"));
      if (entry) {
        added += 1;
        console.log(`added   ${label}: ${entry.cards} cards from ${entry.source}`);
      } else console.log(`skipped ${label}: no checklist found at ${from}`);
    } catch (error) {
      console.log(`failed  ${label}: ${error instanceof Error ? error.message : "error"} (${from})`);
    }
    at += 1;
    if (at < groups.size && parts.some((part) => /^https?:/i.test(part.from)) && !process.env.CHECKLIST_PAGE_CACHE) await sleep(PAUSE_MS);
  }
  console.log(`${added} of ${groups.size} imported. Log: lib/cards/data/checklists/index.json`);
}

void main();
