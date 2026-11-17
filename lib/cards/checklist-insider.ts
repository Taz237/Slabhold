import { decodeHtml } from "./checklist-import";

/**
 * A Checklist Insider page (checklistinsider.com/<year>-<product>) read into the two files the
 * earlier imports keep in scripts/checklist-csv/: the card checklist as CSV, and each section's
 * parallels with their print runs. Pure text in, rows out (scripts/checklist-insider-import.ts reads
 * and writes). Nothing is guessed: a line that is neither a parallel nor "number name - team" is
 * left out.
 *
 * The page lays each section out as:
 *   Base Rookies Checklist
 *   100 cards.
 *   Parallels:
 *   Teal Refractor /299 (1:117 Hobby; ...)
 *   SuperFractor 1/1 (...)
 *   301 Cam Ward - Tennessee Titans RC
 */

export type InsiderCard = { set: string; number: string; player: string; team: string; rookie: boolean };
export type InsiderParallel = { subset: string; name: string; serialRun: number | null; unsure?: true };
export type InsiderPage = { cards: InsiderCard[]; parallels: InsiderParallel[] };

/** Spelling slips on the page, fixed so the name reads the way the card and sellers spell it. */
const NAME_FIXES: [RegExp, string][] = [[/\bLva\b/g, "Lava"]];

/** The page's text, one line per block. */
export function pageLines(html: string): string[] {
  const text = html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>|<\/(?:p|li|h\d|tr|div)>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  return text
    .split("\n")
    .map((line) => decodeHtml(line))
    .filter(Boolean);
}

const SECTION = /^(.+?) Checklist$/;
const CARD = /^((?=[A-Z0-9-]*\d|[A-Z]{1,6}-[A-Z]{1,6}\b)[A-Z0-9]{1,8}(?:-[A-Z0-9]{1,8}){0,2}) (.+?) - (.+?)$/;

/** "Teal Refractor /299 (odds)", "SuperFractor 1/1 (odds)", "FrozenFractor /-5 (odds)", "Refractor (odds)". */
export function parseParallelLine(line: string): { name: string; serialRun: number | null; unsure?: true } | null {
  const clean = line.replace(/\s*\(.*$/, "").trim();
  if (!clean || /[:]|\bcards?\b\.|^buy on/i.test(clean)) return null;
  const match = /^(.*?)\s*(?:(\d+)\s*\/\s*(\d+)|\/\s*(-?\d+))?$/.exec(clean);
  if (!match || !/[a-z]/i.test(match[1])) return null;
  let name = match[1].trim();
  for (const [from, to] of NAME_FIXES) name = name.replace(from, to);
  if (match[3]) return { name, serialRun: Number(match[3]) };
  if (match[4] != null) {
    const run = Number(match[4]);
    return run > 0 ? { name, serialRun: run } : { name, serialRun: null, unsure: true };
  }
  return { name, serialRun: null };
}

/**
 * Known slips on a page, fixed by hand after review: a name the page misspells, and a row that
 * contradicts the base checklist. Only names a person checked are here; nothing is guessed, and a
 * card is never dropped for its spelling. Keyed by the page's product title.
 */
export type PageCorrections = {
  /** The page's spelling → the player's name. */
  names?: Readonly<Record<string, string>>;
  /** Rows the page lists that aren't real cards. */
  drop?: readonly { set: string; number: string; player: string }[];
};

export const PAGE_CORRECTIONS: Readonly<Record<string, PageCorrections>> = {
  "2025 Topps Chrome Football": {
    names: {
      "Kale! Mullings": "Kaleb Mullings",
      "Kurds Rourke": "Kurtis Rourke",
      "Jandae Barron": "Jahdae Barron",
      // The page's apostrophe came through as "T".
      "JaTMarr Chase": "Ja'Marr Chase",
    },
    // Base Rookies #313 is Pat Bryant; the etch list's "Antwane Wells Jr." at #313 is a leftover.
    drop: [{ set: "Base Rookies Chrome Etch Variations", number: "313", player: "Antwane Wells Jr." }],
  },
  // Game Graphs spells two players the way no other section of the page does.
  "2025-26 Bowman University Best Basketball": {
    names: { "Tarris Reed JR.": "Tarris Reed Jr.", "Zakiyah Johnson": "ZaKiyah Johnson" },
  },
};

/** The page's cards with its known slips fixed. Reports each correction that matched nothing. */
export function applyCorrections(cards: readonly InsiderCard[], corrections: PageCorrections | undefined): { cards: InsiderCard[]; unused: string[] } {
  if (!corrections) return { cards: [...cards], unused: [] };
  const names = corrections.names ?? {};
  const drops = corrections.drop ?? [];
  const usedNames = new Set<string>();
  const usedDrops = new Set<number>();
  const out: InsiderCard[] = [];
  for (const card of cards) {
    const dropAt = drops.findIndex((row) => row.set === card.set && row.number === card.number && row.player === card.player);
    if (dropAt >= 0) {
      usedDrops.add(dropAt);
      continue;
    }
    const fixed = names[card.player];
    if (fixed) usedNames.add(card.player);
    out.push(fixed ? { ...card, player: fixed } : card);
  }
  const unused = [
    ...Object.keys(names).filter((name) => !usedNames.has(name)).map((name) => `name "${name}"`),
    ...drops.filter((_row, index) => !usedDrops.has(index)).map((row) => `drop ${row.set} #${row.number} ${row.player}`),
  ];
  return { cards: out, unused };
}

export function parseInsiderPage(html: string, productTitle: string): InsiderPage {
  const lines = pageLines(html);
  const cards: InsiderCard[] = [];
  const parallels: InsiderParallel[] = [];
  let section = "";
  let inParallels = false;
  for (const line of lines) {
    if (/Team Set Checklist$/.test(line)) break;
    const heading = SECTION.exec(line);
    if (heading && heading[1].trim() !== productTitle) {
      section = heading[1].trim();
      inParallels = false;
      continue;
    }
    if (!section) continue;
    if (/^Parallels\s*:$/i.test(line)) {
      inParallels = true;
      continue;
    }
    const card = CARD.exec(line);
    if (card) {
      inParallels = false;
      const rest = card[3]
        .replace(/\s*\(eBay\)$/i, "")
        // A note after the team: "/5 (no base)" (an autograph with no base card), "RD" (rookie debut).
        .replace(/\s*\/\s*\d+\s*\([^)]*\)$/, "")
        .replace(/\s+RD$/, "")
        .trim();
      const rookie = /\sRC$/.test(rest);
      cards.push({ set: section, number: card[1], player: card[2].trim(), team: rest.replace(/\s+RC$/, "").trim(), rookie });
      continue;
    }
    if (inParallels) {
      const parallel = parseParallelLine(line);
      if (parallel) parallels.push({ subset: section, ...parallel });
    }
  }
  return { cards, parallels };
}

const csvCell = (value: string) => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);

/** The card checklist in the CSV shape the earlier imports used. */
export function insiderCsv(cards: readonly InsiderCard[]): string {
  const rows = cards.map((card) => [card.set, card.number, card.player, card.team, card.rookie ? "RC" : ""].map(csvCell).join(","));
  return ["CARD SET,CARD NUMBER,ATHLETE,TEAM,RC", ...rows].join("\n") + "\n";
}
