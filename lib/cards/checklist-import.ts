import type { ChecklistProduct, ChecklistRow, ChecklistSection } from "./checklists";

/**
 * Turns a checklist source into the store's shape. Pure text in, rows out: the script
 * (scripts/import-checklist.ts) does the reading and writing. Two sources are read:
 *
 *   1. A hobby checklist page (Cardboard Connection): a heading per section, then lines of
 *      "339 C.J. Stroud - Houston Texans".
 *   2. The maker's own checklist CSV (Panini: SPORT, YEAR, BRAND, PROGRAM, CARD SET, ATHLETE,
 *      TEAM, POSITION, CARD NUMBER, SEQUENCE). Every parallel repeats the card, so a card is
 *      kept once.
 *
 * Nothing is guessed: a line that isn't "number, player, team" is left out.
 */

export type ImportedSection = { name: string; cards: { number: string; player: string; team: string }[] };

const ENTITIES: Record<string, string> = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " ", ndash: "-", mdash: "-", rsquo: "'", lsquo: "'" };

export function decodeHtml(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_all, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_all, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&([a-z]+);/gi, (all, name: string) => ENTITIES[name.toLowerCase()] ?? all)
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

/** A card number as checklists print it: "339", "BCP-52", "RA-CS", "US1", "T87-12". Never a sentence. */
const CARD_NUMBER = /^(?=[A-Z0-9-]*\d|[A-Z]{1,6}-[A-Z]{1,6}$)[A-Z0-9]{1,8}(?:-[A-Z0-9]{1,8}){0,2}$/i;

/** Cards that are in a checklist and are no one player. */
const NOT_A_PLAYER =
  /\b(?:team\s+card|checklist|league\s+leaders?|leaders|combo(?:\s+card)?|no\s+card|does\s+not\s+exist|highlights?|world\s+series|all-star\s+game|home\s+run\s+derby|mascot|stadium|ballpark|coliseum|logo|(?:major|national|american)\s+league)\b|\b(?:TC|CL|CC)$/i;
/** A ballpark card ("Petco Park", "Coors Field"). Kept only when the caller knows the name as a person (Chan Ho Park). */
const BALLPARK = /\b(?:park|field|centre|yards)\b/i;

/** Notes after the team: "RC", "(SP)", "#/99", "- Rookie". */
function withoutNotes(text: string): string {
  return text
    .replace(/\([^)]*\)/g, " ")
    .replace(/#?\s*\/\s*\d+\b/g, " ")
    .replace(/\b(?:RC|SP|SSP|RD)\b\.?/g, " ")
    .replace(/\s1st\b/gi, " ")
    .replace(/\s+/g, " ")
    .replace(/[\s,;:*-]+$/, "")
    .trim();
}

/** "339 C.J. Stroud - Houston Texans" → the card. Null when the line isn't one card with one player. */
export function parseChecklistLine(
  line: string,
  /** Says a name is a person we know, for the few names that also read as a place ("Chan Ho Park"). */
  knownPerson: (name: string) => boolean = () => false,
): { number: string; player: string; team: string } | null {
  const text = decodeHtml(line.replace(/<[^>]+>/g, " "));
  const match = /^(\S+)\s+(.+)$/.exec(text);
  if (!match || !CARD_NUMBER.test(match[1])) return null;
  const rest = match[2];
  // "Player - Team", and the page's occasional "Player- Team". A hyphen inside a name has no space after it.
  const dash = /\s+-\s+|-\s+/.exec(rest);
  const player = withoutNotes(dash ? rest.slice(0, dash.index) : rest);
  const team = dash ? withoutNotes(rest.slice(dash.index + dash[0].length)) : "";
  // A team card, a checklist card, a leaders card, a ballpark or an empty slot is nobody.
  if (NOT_A_PLAYER.test(player) || NOT_A_PLAYER.test(team) || /[*:!?]/.test(player)) return null;
  if (BALLPARK.test(player) && !knownPerson(player)) return null;
  // Two players on one card name nobody on their own. A name is letters, not a sentence.
  if (!player || /[/&]| and |,/.test(player) || /\d/.test(player)) return null;
  const words = player.split(" ");
  if (words.length < 2 || words.length > 4 || player.length > 40) return null;
  return { number: match[1].toUpperCase() === match[1] ? match[1] : match[1].toUpperCase(), player, team };
}

/** "Base Rookies Set Checklist" is "Base Rookies". A heading with nothing else in it is "Base". */
function sectionName(heading: string): string {
  const name = decodeHtml(heading.replace(/<[^>]+>/g, " "))
    .replace(/\b(?:set\s+)?checklist\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return name || "Base";
}

/** A hobby checklist page: each "hot-title" heading, then its "tablechecklist" blocks. */
export function sectionsFromChecklistPage(html: string, knownPerson?: (name: string) => boolean): ImportedSection[] {
  const sections: ImportedSection[] = [];
  const parts = html.split(/<h3[^>]*class="[^"]*hot-title[^"]*"[^>]*>/i).slice(1);
  for (const part of parts) {
    const end = part.search(/<\/h3>/i);
    if (end < 0) continue;
    const name = sectionName(part.slice(0, end));
    const cards: ImportedSection["cards"] = [];
    const blocks = part.slice(end).matchAll(/<div[^>]*class="[^"]*tablechecklist[^"]*"[^>]*>([\s\S]*?)<\/div>/gi);
    for (const block of blocks) {
      for (const line of block[1].split(/<br\s*\/?>|\n/i)) {
        const card = parseChecklistLine(line, knownPerson);
        if (card) cards.push(card);
      }
    }
    if (cards.length === 0) continue;
    const same = sections.find((section) => section.name === name);
    if (same) same.cards.push(...cards);
    else sections.push({ name, cards });
  }
  return sections;
}

/** One CSV line into cells: quoted cells keep their commas, "" is a quote. */
export function csvCells(line: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (quoted) {
      if (char === '"' && line[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      cells.push(cell.trim());
      cell = "";
    } else cell += char;
  }
  cells.push(cell.trim());
  return cells;
}

/** The maker's CSV: one card per (card set, number, athlete), however many parallels repeat it. */
export function sectionsFromMakerCsv(csv: string, knownPerson?: (name: string) => boolean): ImportedSection[] {
  const lines = csv.replace(/^﻿/, "").split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];
  const header = csvCells(lines[0]).map((cell) => cell.toLowerCase().replace(/[^a-z#]+/g, " ").trim());
  // The first pattern that matches a column wins: "card set" before "program".
  const column = (...names: RegExp[]) => {
    for (const name of names) {
      const at = header.findIndex((cell) => name.test(cell));
      if (at >= 0) return at;
    }
    return -1;
  };
  const athlete = column(/^athlete$/, /^player$/, /athlete|player/);
  const number = column(/^card number$/, /^card #$/, /^#$/, /^number$/, /card n/);
  const team = column(/^team$/, /team/);
  const set = column(/^card set$/, /^set$/, /^subset$/, /card set|program/);
  if (athlete < 0 || number < 0) return [];
  const sections: ImportedSection[] = [];
  const seen = new Set<string>();
  for (const line of lines.slice(1)) {
    const cells = csvCells(line);
    const card = parseChecklistLine(`${cells[number] ?? ""} ${cells[athlete] ?? ""}${team >= 0 && cells[team] ? ` - ${cells[team]}` : ""}`, knownPerson);
    if (!card) continue;
    // A parallel row ("Base Prizms Silver") is the same card as its "Base" row.
    const key = `${card.number.toLowerCase()}|${card.player.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const name = (set >= 0 ? cells[set] : "") || "Base";
    const section = sections.find((item) => item.name === name);
    if (section) section.cards.push(card);
    else sections.push({ name, cards: [card] });
  }
  return sections;
}

/** The store's file for one product: teams listed once, each card a small row. */
export function checklistProductFrom(
  meta: { sport: string; yearLabel: string; product: string; source: string; read: string },
  imported: readonly ImportedSection[],
): ChecklistProduct {
  const teams: string[] = [];
  const teamIndex = (name: string) => {
    if (!name) return -1;
    const at = teams.indexOf(name);
    if (at >= 0) return at;
    teams.push(name);
    return teams.length - 1;
  };
  // A "player" that is one of the product's own teams is a team card.
  const teamNames = new Set(imported.flatMap((section) => section.cards.map((card) => card.team.toLowerCase())).filter(Boolean));
  const sections: ChecklistSection[] = imported
    .map((section) => ({
      name: section.name,
      cards: section.cards.filter((card) => !teamNames.has(card.player.toLowerCase())).map((card): ChecklistRow => [card.number, card.player, teamIndex(card.team)]),
    }))
    .filter((section) => section.cards.length > 0);
  return { ...meta, teams, sections };
}

export function checklistCardCount(product: ChecklistProduct): number {
  return product.sections.reduce((sum, section) => sum + section.cards.length, 0);
}
