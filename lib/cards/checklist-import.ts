import { isBaseSection, type ChecklistProduct, type ChecklistRow, type ChecklistSection } from "./checklists";

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
    .trim()
    // A tier letter some pages put after the name ("Alex Rodriguez A", "Alexander Ovechkin C"). Never
    // I, V or X: a suffix (Will Fuller V).
    .replace(/^(\S+(?:\s+\S+)+)\s+[A-HJ-UWYZ]$/, "$1");
}

/** One letter of a nameplate per card (2009 Topps' In the Name Letter Relics, KY5): no card for a player as such. */
const LETTER_SECTION = /\bletters?\b.*\b(?:relics?|patch(?:es)?)\b/i;

/**
 * A one-word name is a real person only when it is one capitalized word ("Ludacris", "Ichiro",
 * "MIYAVI") with the team after it on the line. These words are the page's own furniture (headings,
 * set names, section words), never a person.
 */
const ONE_WORD_NAME = /^\p{Lu}\p{L}{2,}$/u;
const NOT_A_ONE_WORD_NAME = new Set(
  [
    "base", "set", "sets", "card", "cards", "checklist", "checklists", "team", "teams", "mascot", "mascots", "rookie", "rookies",
    "parallel", "parallels", "insert", "inserts", "autograph", "autographs", "auto", "autos", "relic", "relics", "memorabilia",
    "patch", "patches", "variation", "variations", "variant", "variants", "short", "print", "prints", "odds", "hobby", "retail",
    "blaster", "jumbo", "hanger", "mega", "fat", "pack", "packs", "box", "boxes", "case", "breaks", "legends", "legend",
    "veterans", "prospects", "prospect", "draft", "update", "series", "chrome", "refractor", "refractors", "prizm", "prizms",
    "topps", "bowman", "panini", "donruss", "optic", "select", "mosaic", "leaf", "upper", "deck", "fleer", "score", "hoops",
    "contenders", "certified", "absolute", "phoenix", "finest", "sapphire", "resurgence", "baseball", "football", "basketball",
    "hockey", "soccer", "music", "musician", "celebrity", "gold", "silver", "black", "red", "blue", "green", "orange", "purple",
    "pink", "white", "none", "tbd", "unknown", "various", "multiple", "dual", "triple", "quad", "combo",
  ],
);
/** Sections of mascot, cartoon and sticker cards: a one-word name there ("Paws", "Goofy", "Gator") is a character, not a player. */
const CHARACTER_SECTION = /\bmascots?\b|\bmickey\b|\bdisney\b|\blooney\b|\bmuppets?\b|\bsesame\b|\bzoo'?s\s+who\b|\bstick-?ons?\b/i;

function isOneWordPerson(player: string, team: string, section: string): boolean {
  if (!team || !ONE_WORD_NAME.test(player) || NOT_A_ONE_WORD_NAME.has(player.toLowerCase())) return false;
  // "TBA", "ACE": a short all-caps word is a placeholder or a mascot's tag, not a name ("MIYAVI" is).
  if (player.length <= 4 && player === player.toUpperCase()) return false;
  if (CHARACTER_SECTION.test(section)) return false;
  // "Angels - Los Angeles Angels" is the team by its nickname, and "Tiger - Detroit Tigers" too.
  const word = player.toLowerCase();
  return !team.toLowerCase().split(/\s+/).some((teamWord) => teamWord === word || teamWord === `${word}s` || teamWord === `${word}es`);
}

/**
 * A plain-text checklist page is noisy: "Thrills", "Wins", moons, landmarks and mascots all read as
 * one word and a team. There a one-word name loads only for these athletes, who are known by one.
 * The maker's and Checklist Insider's CSVs are tidy rows, so the rules above are enough there.
 */
const ONE_WORD_ATHLETES = new Set(["ichiro", "nene", "pele"]);
const plainName = (name: string) => name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** A card off a plain-text page: one-word names only for the known one-word athletes. */
function pageCard(card: { number: string; player: string; team: string } | null) {
  return card && (card.player.includes(" ") || ONE_WORD_ATHLETES.has(plainName(card.player))) ? card : null;
}

/** "339 C.J. Stroud - Houston Texans" → the card. Null when the line isn't one card with one player. */
export function parseChecklistLine(
  line: string,
  /** Says a name is a person we know, for the few names that also read as a place ("Chan Ho Park"). */
  knownPerson: (name: string) => boolean = () => false,
  /** The section the line is in: a one-word name in a mascot or cartoon section is a character. */
  section = "",
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
  if (words.length > 4 || player.length > 40) return null;
  if (words.length === 1 && !isOneWordPerson(player, team, section)) return null;
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
    if (LETTER_SECTION.test(name)) continue;
    const cards: ImportedSection["cards"] = [];
    const blocks = part.slice(end).matchAll(/<div[^>]*class="[^"]*tablechecklist[^"]*"[^>]*>([\s\S]*?)<\/div>/gi);
    for (const block of blocks) {
      for (const line of block[1].split(/<br\s*\/?>|\n/i)) {
        const card = pageCard(parseChecklistLine(line, knownPerson, name));
        if (card) cards.push(card);
      }
    }
    if (cards.length === 0) continue;
    const same = sections.find((section) => section.name === name);
    if (same) same.cards.push(...cards);
    else sections.push({ name, cards });
  }
  return sections.length > 0 ? sections : sectionsWithoutHotTitles(html, knownPerson);
}

/**
 * Older pages (1960 Topps) head the checklist with a plain "Set Checklist" heading and no section
 * headings. Each run of checklist blocks under one h2 or h3 is a section: the first is the base
 * set, a later one keeps its heading's name ("Stickers").
 */
function sectionsWithoutHotTitles(html: string, knownPerson?: (name: string) => boolean): ImportedSection[] {
  const sections: ImportedSection[] = [];
  const pieces = html.split(/(<h[23][^>]*>[\s\S]*?<\/h[23]>)/i);
  let heading = "";
  for (const piece of pieces) {
    if (/^<h[23]/i.test(piece)) {
      heading = piece;
      continue;
    }
    const cards: ImportedSection["cards"] = [];
    const headed = sectionName(heading);
    for (const block of piece.matchAll(/<div[^>]*class="[^"]*tablechecklist[^"]*"[^>]*>([\s\S]*?)<\/div>/gi)) {
      for (const line of block[1].split(/<br\s*\/?>|\n/i)) {
        const card = pageCard(parseChecklistLine(line, knownPerson, sections.length === 0 ? "Base" : headed));
        if (card) cards.push(card);
      }
    }
    if (cards.length === 0) continue;
    const name = sections.length === 0 ? "Base" : sectionName(heading);
    if (LETTER_SECTION.test(name)) continue;
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
    const name = (set >= 0 ? cells[set] : "") || "Base";
    const card = parseChecklistLine(`${cells[number] ?? ""} ${cells[athlete] ?? ""}${team >= 0 && cells[team] ? ` - ${cells[team]}` : ""}`, knownPerson, name);
    if (!card) continue;
    // A parallel row ("Base Prizms Silver") is the same card as its "Base" row.
    const key = `${card.number.toLowerCase()}|${card.player.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const section = sections.find((item) => item.name === name);
    if (section) section.cards.push(card);
    else sections.push({ name, cards: [card] });
  }
  return sections;
}

/** The base sections' players at each card number (lower case). */
export function basePlayersByNumber(sections: readonly ImportedSection[]): Map<string, Set<string>> {
  const at = new Map<string, Set<string>>();
  for (const section of sections) {
    if (!isBaseSection(section.name)) continue;
    for (const card of section.cards) at.set(card.number.toLowerCase(), (at.get(card.number.toLowerCase()) ?? new Set()).add(card.player.toLowerCase()));
  }
  return at;
}

/**
 * A one-word name on a variation of someone else's base card ("Screech" on 2022 Topps Update #150,
 * Josiah Gray's number) is a photo variation, a mascot most often: no player of its own.
 */
export function isPhotoVariation(section: string, card: { number: string; player: string }, basePlayers: Map<string, Set<string>>): boolean {
  if (!/\bvariations?\b/i.test(section)) return false;
  const base = basePlayers.get(card.number.toLowerCase());
  return Boolean(base && !base.has(card.player.toLowerCase()));
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
  // A one-word "player" that is the first or last name of another player in the product is a cut-off name.
  const nameEnds = new Set(
    imported.flatMap((section) => section.cards.map((card) => card.player.toLowerCase().split(" "))).flatMap((words) => (words.length > 1 ? [words[0], words[words.length - 1]] : [])),
  );
  const basePlayers = basePlayersByNumber(imported);
  const keep = (section: string, card: ImportedSection["cards"][number]) =>
    !teamNames.has(card.player.toLowerCase()) &&
    !(!card.player.includes(" ") && (nameEnds.has(card.player.toLowerCase()) || isPhotoVariation(section, card, basePlayers)));
  const sections: ChecklistSection[] = imported
    .map((section) => ({
      name: section.name,
      cards: section.cards.filter((card) => keep(section.name, card)).map((card): ChecklistRow => [card.number, card.player, teamIndex(card.team)]),
    }))
    .filter((section) => section.cards.length > 0);
  return { ...meta, teams, sections };
}

export function checklistCardCount(product: ChecklistProduct): number {
  return product.sections.reduce((sum, section) => sum + section.cards.length, 0);
}
