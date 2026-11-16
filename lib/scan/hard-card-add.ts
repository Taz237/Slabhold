import { loadChecklistsFor } from "@/lib/cards/checklist-load";
import { loadProductData } from "@/lib/cards/product-data";
import { SCAN_DIRECTORY } from "@/lib/players/scan-directory";
import { HARD_FIELDS, hardCardBack, markParallel, markPlayer, markRun, markSet, markText, type HardCard, type HardField, type Mark } from "./hard-cards";
import { rankScanMatches, scanChecklistKey, type ScanMatch } from "./match";
import { scanReadFrom } from "./session";

/**
 * Adding a reported miss to the hard-cards set in one step (scripts/add-hard-card.ts).
 * Pure pieces here so they are tested: read the flags, build the card, score it the way
 * hard-cards.test.ts does. Nothing is fetched.
 */

export type HardCardInput = {
  player: string;
  year: string;
  product: string;
  number: string;
  /** Empty or "Base": a base card. */
  parallel?: string;
  run?: number | null;
  slab?: boolean;
  /** The front (or the slab label) as read, one line each. */
  front: string[];
  /** The back as read. Left out: built from the card # and the product. */
  back?: string[];
  why: string;
  /** Sold titles for the card, as sellers word them. */
  titles?: string[];
  sport?: string;
  team?: string;
  category?: string;
  manufacturer?: string;
  rookie?: boolean;
  /** Other spellings of the player that count as right. */
  playerAlso?: string[];
  /** Other names for the same parallel that count as right. */
  parallelAlso?: string[];
  sources?: string[];
};

const MANUFACTURERS = ["Topps", "Panini", "Upper Deck", "Bowman", "Leaf", "Fleer", "Donruss", "Score", "Sage"];
const SPORTS = ["baseball", "basketball", "football", "hockey", "soccer"];

function clean(text: string | undefined): string {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

/** "hc-077" after "hc-076". Three digits at least. */
export function nextHardCardId(cards: readonly Pick<HardCard, "id">[]): string {
  const highest = cards.reduce((max, card) => Math.max(max, Number(/^hc-(\d+)$/.exec(card.id)?.[1] ?? 0)), 0);
  return `hc-${String(highest + 1).padStart(3, "0")}`;
}

/** What is wrong with the input, in plain words. Empty when it can be added. */
export function hardCardInputErrors(input: HardCardInput): string[] {
  const errors: string[] = [];
  if (!clean(input.player)) errors.push("--player is needed (the name the card prints)");
  if (!/^\d{4}(-\d{2})?$/.test(clean(input.year))) errors.push('--year is needed, like 2025 or 2025-26');
  if (!clean(input.product)) errors.push('--product is needed, like "Topps Chrome Football"');
  if (!clean(input.number)) errors.push("--number is needed (the card #)");
  if (input.front.map(clean).filter(Boolean).length === 0) errors.push('--front is needed: the lines as read, split with |, like "2025 TOPPS CHROME #306|JAXSON DART|GEM MT 10"');
  if (!clean(input.why)) errors.push("--why is needed: what the app showed and why it is hard");
  if (input.run != null && !(Number.isInteger(input.run) && input.run > 0)) errors.push("--run is a whole number, like 175");
  return errors;
}

/** The card as the set stores it. The id is the next free one. */
export function buildHardCard(input: HardCardInput, cards: readonly Pick<HardCard, "id">[]): HardCard {
  const product = clean(input.product);
  const parallel = clean(input.parallel);
  const base = !parallel || parallel.toLowerCase() === "base";
  const sport = clean(input.sport).toLowerCase() || SPORTS.find((name) => new RegExp(`\\b${name}\\b`, "i").test(product)) || "";
  const manufacturer = clean(input.manufacturer) || MANUFACTURERS.find((name) => product.toLowerCase().startsWith(name.toLowerCase())) || "";
  const back = (input.back ?? []).map(clean).filter(Boolean);
  const titles = (input.titles ?? []).map(clean).filter(Boolean);
  const playerAlso = (input.playerAlso ?? []).map(clean).filter(Boolean);
  const parallelAlso = (input.parallelAlso ?? []).map(clean).filter(Boolean);
  return {
    id: nextHardCardId(cards),
    category: clean(input.category) || "device_miss",
    year: clean(input.year),
    manufacturer,
    product,
    card_number: clean(input.number).replace(/^#/, ""),
    player: clean(input.player),
    ...(playerAlso.length ? { player_also: playerAlso } : {}),
    team: clean(input.team),
    parallel: base ? null : parallel,
    ...(parallelAlso.length ? { parallel_also: parallelAlso } : {}),
    print_run: input.run ?? null,
    sport,
    is_rookie: input.rookie === true,
    ...(input.slab ? { kind: "slab" as const } : {}),
    typical_ocr_front: input.front.map(clean).filter(Boolean),
    ...(back.length ? { typical_ocr_back: back } : {}),
    why_hard: clean(input.why),
    source_urls: (input.sources ?? []).map(clean).filter(Boolean),
    listing_title_examples: titles,
    // Typed in by hand from a report, so marked as modeled. Change it in the file if they were copied from real listings.
    ...(titles.length ? { listing_titles_modeled: true } : {}),
    confidence: "from the collector's report of the card; lines and titles typed in, not captured",
  };
}

const LIST_FLAGS = new Set(["front", "back", "title", "player-also", "parallel-also", "source"]);
const SWITCHES = new Set(["slab", "rookie", "dry-run"]);
const VALUE_FLAGS = new Set(["player", "year", "product", "number", "parallel", "run", "why", "sport", "team", "category", "manufacturer"]);

/**
 * The command's flags. --front and --back take lines split with "|". --title, --player-also,
 * --parallel-also and --source can repeat. Unknown flags are errors, never ignored.
 */
export function parseHardCardArgs(argv: readonly string[]): { input: HardCardInput; dryRun: boolean; errors: string[] } {
  const values = new Map<string, string>();
  const lists = new Map<string, string[]>();
  const switches = new Set<string>();
  const errors: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      errors.push(`"${arg}" is not a flag. Flags start with --, and a value with spaces needs quotes.`);
      continue;
    }
    const name = arg.slice(2);
    if (SWITCHES.has(name)) {
      switches.add(name);
      continue;
    }
    if (!VALUE_FLAGS.has(name) && !LIST_FLAGS.has(name)) {
      errors.push(`--${name} is not a flag this command knows`);
      continue;
    }
    const value = argv[index + 1];
    if (value == null || value.startsWith("--")) {
      errors.push(`--${name} needs a value`);
      continue;
    }
    index += 1;
    if (LIST_FLAGS.has(name)) {
      const parts = name === "front" || name === "back" ? value.split("|") : [value];
      lists.set(name, [...(lists.get(name) ?? []), ...parts]);
    } else {
      values.set(name, value);
    }
  }
  const runText = values.get("run");
  const run = runText == null ? null : Number(runText.replace(/^\//, ""));
  const input: HardCardInput = {
    player: values.get("player") ?? "",
    year: values.get("year") ?? "",
    product: values.get("product") ?? "",
    number: values.get("number") ?? "",
    parallel: values.get("parallel"),
    run: runText == null ? null : run,
    slab: switches.has("slab"),
    front: lists.get("front") ?? [],
    back: lists.get("back"),
    why: values.get("why") ?? "",
    titles: lists.get("title"),
    sport: values.get("sport"),
    team: values.get("team"),
    category: values.get("category"),
    manufacturer: values.get("manufacturer"),
    rookie: switches.has("rookie"),
    playerAlso: lists.get("player-also"),
    parallelAlso: lists.get("parallel-also"),
    sources: lists.get("source"),
  };
  return { input, dryRun: switches.has("dry-run"), errors: [...errors, ...hardCardInputErrors(input)] };
}

export type HardCardScore = { marks: Record<HardField, Mark>; shown: string; wrong: HardField[]; open: HardField[] };

function shownLine(match: ScanMatch | undefined): string {
  if (!match) return "(no match)";
  return [match.playerName, match.yearLabel, match.setBrand, match.cardNumber ? `#${match.cardNumber}` : "", match.parallel, match.serialRun ? `/${match.serialRun}` : ""].filter(Boolean).join(" · ");
}

/** The card through the scan alone, scored field by field: the same path and marks as hard-cards.test.ts. */
export async function scoreHardCard(card: HardCard): Promise<HardCardScore> {
  const read = scanReadFrom(
    { lines: card.typical_ocr_front, backLines: hardCardBack(card), kind: card.kind ?? ("card" as const), image: null, alternates: null, backAlternates: null, cert: null },
    SCAN_DIRECTORY,
  );
  const key = scanChecklistKey(read, SCAN_DIRECTORY);
  const checklists = key ? await loadChecklistsFor(key) : [];
  const match = rankScanMatches(read, [], { directory: SCAN_DIRECTORY, products: await loadProductData(), soldTitles: [], checklists }).matches[0];
  const marks: Record<HardField, Mark> = {
    player: markPlayer(match?.playerName ?? "", card.player, card.player_also),
    year: markText(match?.yearLabel ?? "", card.year),
    set: markSet(match?.setBrand ?? "", card),
    number: markText(match?.cardNumber ?? "", card.card_number),
    parallel: markParallel(match?.parallel ?? "", card),
    run: markRun(match?.serialRun, card.print_run),
  };
  return {
    marks,
    shown: shownLine(match),
    wrong: HARD_FIELDS.filter((field) => marks[field] === "wrong"),
    open: HARD_FIELDS.filter((field) => marks[field] === "open"),
  };
}

/** The report the command prints: what the scanner shows today, and each field's mark. */
export function hardCardReport(card: HardCard, score: HardCardScore): string {
  const icon: Record<Mark, string> = { right: "right", open: "open ", wrong: "WRONG" };
  const truth: Record<HardField, string> = {
    player: card.player,
    year: card.year,
    set: card.product,
    number: `#${card.card_number}`,
    parallel: card.parallel ?? "Base",
    run: card.print_run ? `/${card.print_run}` : "not numbered",
  };
  return [
    `${card.id}  ${card.player}, ${card.year} ${card.product} #${card.card_number}${card.parallel ? ` ${card.parallel}` : ""}${card.print_run ? ` /${card.print_run}` : ""}`,
    `The scanner shows: ${score.shown}`,
    ...HARD_FIELDS.map((field) => `  ${icon[score.marks[field]]}  ${field.padEnd(8)} ${truth[field]}`),
    score.wrong.length > 0
      ? `WRONG on ${score.wrong.join(", ")}. This is a real miss: the bake-off (npm test) fails until the scanner is fixed.`
      : score.open.length > 0
        ? `0 wrong. Open on ${score.open.join(", ")}: the scanner leaves it for the collector, which is allowed.`
        : "0 wrong, 0 open: the scanner gets this card right today.",
  ].join("\n");
}
