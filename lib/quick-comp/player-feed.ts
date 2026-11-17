import { GRADE_NUMBERS, RAW_GRADE } from "@/lib/card-options";

/**
 * Player mode: one player's recent sold sales, any card. Every fact here is read
 * from the sold title (or eBay's grading field), never guessed: no parallel the
 * title doesn't name, no year it doesn't print. Unknown stays null.
 */
export type GradeCompany = "raw" | "PSA" | "BGS" | "SGC" | "other";

export type PlayerSale = {
  id: string;
  title: string;
  price: number;
  soldAt: string;
  /** eBay's image host only, or null for the placeholder. */
  photo: string | null;
  /** "Raw", "PSA 10", "BGS 9.5", "CGC 9". */
  grade: string;
  company: GradeCompany;
  /** "2023" or "2023-24", as the title prints it. */
  year: string | null;
  set: string | null;
  number: string | null;
  auto: boolean;
  /** The print run the title names ("/99"). */
  run: number | null;
  /** Only a parallel the title names. Null means "not named", never "Base". */
  parallel: string | null;
};

export type PlayerFeedBody = {
  player: string;
  sales: PlayerSale[];
  fetchedAt: string | null;
};

export type FeedSort = "newest" | "highest" | "lowest";
export const FEED_SORTS: readonly { value: FeedSort; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "highest", label: "Highest" },
  { value: "lowest", label: "Lowest" },
];

export type FeedFilters = {
  year: string | null;
  set: string | null;
  grade: GradeCompany | null;
  auto: boolean;
  numbered: boolean;
  parallel: boolean;
};

export const NO_FILTERS: FeedFilters = { year: null, set: null, grade: null, auto: false, numbered: false, parallel: false };

export function activeFilterCount(filters: FeedFilters): number {
  return [filters.year, filters.set, filters.grade].filter(Boolean).length + [filters.auto, filters.numbered, filters.parallel].filter(Boolean).length;
}

export function filterSales(sales: readonly PlayerSale[], filters: FeedFilters): PlayerSale[] {
  return sales.filter(
    (sale) =>
      (!filters.year || sale.year === filters.year) &&
      (!filters.set || sale.set === filters.set) &&
      (!filters.grade || sale.company === filters.grade) &&
      (!filters.auto || sale.auto) &&
      (!filters.numbered || sale.run != null) &&
      (!filters.parallel || sale.parallel != null),
  );
}

function time(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function sortSales(sales: readonly PlayerSale[], sort: FeedSort): PlayerSale[] {
  const out = [...sales];
  if (sort === "highest") out.sort((a, b) => b.price - a.price || time(b.soldAt) - time(a.soldAt));
  else if (sort === "lowest") out.sort((a, b) => a.price - b.price || time(b.soldAt) - time(a.soldAt));
  else out.sort((a, b) => time(b.soldAt) - time(a.soldAt));
  return out;
}

export type FeedChip =
  | { kind: "grade"; value: GradeCompany; label: string }
  | { kind: "year"; value: string; label: string }
  | { kind: "set"; value: string; label: string }
  | { kind: "auto" | "numbered" | "parallel"; label: string };

const GRADE_CHIPS: readonly { value: GradeCompany; label: string }[] = [
  { value: "raw", label: "Raw" },
  { value: "PSA", label: "PSA" },
  { value: "BGS", label: "BGS" },
  { value: "SGC", label: "SGC" },
];
const MAX_VALUE_CHIPS = 6;

function topValues(values: readonly (string | null)[], order: (a: [string, number], b: [string, number]) => number): string[] {
  const counts = new Map<string, number>();
  for (const value of values) if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].sort(order).slice(0, MAX_VALUE_CHIPS).map(([value]) => value);
}

/** Only chips that would find something in these sales. */
export function feedChips(sales: readonly PlayerSale[]): FeedChip[] {
  const chips: FeedChip[] = [];
  for (const grade of GRADE_CHIPS) if (sales.some((sale) => sale.company === grade.value)) chips.push({ kind: "grade", ...grade });
  if (sales.some((sale) => sale.auto)) chips.push({ kind: "auto", label: "Auto" });
  if (sales.some((sale) => sale.run != null)) chips.push({ kind: "numbered", label: "Numbered" });
  if (sales.some((sale) => sale.parallel != null)) chips.push({ kind: "parallel", label: "Parallel" });
  // Years newest first, sets by how many sold.
  const years = topValues(
    sales.map((sale) => sale.year),
    (a, b) => b[0].localeCompare(a[0]),
  );
  for (const year of years) chips.push({ kind: "year", value: year, label: year });
  const sets = topValues(
    sales.map((sale) => sale.set),
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  );
  for (const set of sets) chips.push({ kind: "set", value: set, label: set });
  return chips;
}

export function chipOn(chip: FeedChip, filters: FeedFilters): boolean {
  if (chip.kind === "grade") return filters.grade === chip.value;
  if (chip.kind === "year") return filters.year === chip.value;
  if (chip.kind === "set") return filters.set === chip.value;
  return filters[chip.kind];
}

/** One chip per kind for year, set and grade: tapping another swaps it, tapping the same clears it. */
export function toggleChip(chip: FeedChip, filters: FeedFilters): FeedFilters {
  const on = chipOn(chip, filters);
  if (chip.kind === "grade") return { ...filters, grade: on ? null : chip.value };
  if (chip.kind === "year") return { ...filters, year: on ? null : chip.value };
  if (chip.kind === "set") return { ...filters, set: on ? null : chip.value };
  return { ...filters, [chip.kind]: !on };
}

/** The sale's grade as Quick Comp's grade control knows it, or null when it isn't on a scale we comp. */
export function quickGradeOf(sale: Pick<PlayerSale, "grade" | "company">): string | null {
  if (sale.company === "raw") return RAW_GRADE;
  const match = /^([A-Z]+)\s+(\d+(?:\.\d+)?)$/.exec(sale.grade);
  if (!match) return null;
  const [, company, number] = match;
  const normal = String(Number(number));
  return GRADE_NUMBERS[company]?.includes(normal) && company !== "Other" ? `${company} ${normal}` : null;
}

/** What "Comp this card" fills in: only facts the title printed. A missing year opens the form. */
export type SaleFill = {
  player: string;
  year: string;
  set: string;
  number: string;
  parallel: string;
  serialRun: number | null;
  grade: string | null;
};

export function fillFromSale(player: string, sale: PlayerSale): SaleFill {
  return {
    player,
    year: sale.year ?? "",
    set: sale.set ?? "",
    number: sale.number ?? "",
    parallel: sale.parallel ?? "Base",
    serialRun: sale.run,
    grade: quickGradeOf(sale),
  };
}

export const PLAYER_FEED_API = "/api/quick-comp/player";
export const PLAYER_SUGGEST_API = "/api/quick-comp/suggest";

export function playerFeedUrl(player: string): string {
  return `${PLAYER_FEED_API}?${new URLSearchParams({ q: player.trim() }).toString()}`;
}

export function playerSuggestUrl(text: string): string {
  return `${PLAYER_SUGGEST_API}?${new URLSearchParams({ q: text.trim() }).toString()}`;
}

/** A name suggestion. With a filter, it opens the player's sales with that chip already on. */
export type PlayerSuggestion = {
  label: string;
  player: string;
  filter?: Partial<Pick<FeedFilters, "auto" | "set">>;
};

/** Typing a name with no digits asks for player suggestions; "2023 prizm 136" is a card search. */
export function wantsPlayerSuggestions(text: string): boolean {
  const q = text.trim();
  return Array.from(q).length >= 2 && !/\d/.test(q);
}

export type PlayerFeedOutcome =
  | { status: "ready"; body: PlayerFeedBody }
  | { status: "limited"; reason: "daily" | "hourly" | "safety"; resetAt: string | null }
  | { status: "error" }
  | { status: "offline" };

function validSale(value: unknown): value is PlayerSale {
  const row = value as PlayerSale | null;
  return Boolean(row && typeof row.id === "string" && typeof row.title === "string" && typeof row.price === "number" && typeof row.soldAt === "string");
}

/** One GET for a player's sales, read into an outcome. Never throws. */
export async function fetchPlayerFeed(
  player: string,
  fetcher: (url: string) => Promise<Response>,
  online: () => boolean = () => (typeof navigator === "undefined" ? true : navigator.onLine !== false),
): Promise<PlayerFeedOutcome> {
  if (!online()) return { status: "offline" };
  let response: Response;
  try {
    response = await fetcher(playerFeedUrl(player));
  } catch {
    return online() ? { status: "error" } : { status: "offline" };
  }
  const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (response.ok && body && Array.isArray(body.sales)) {
    return {
      status: "ready",
      body: {
        player: typeof body.player === "string" && body.player ? body.player : player,
        sales: body.sales.filter(validSale),
        fetchedAt: typeof body.fetchedAt === "string" ? body.fetchedAt : null,
      },
    };
  }
  if (response.status === 429) {
    const reason = body?.reason === "daily" || body?.reason === "safety" ? body.reason : "hourly";
    return { status: "limited", reason, resetAt: typeof body?.resetAt === "string" ? body.resetAt : null };
  }
  return { status: "error" };
}

/** Suggestions off the wire: label and player strings, a filter of auto or a set only. */
export function readPlayerSuggestions(body: unknown): PlayerSuggestion[] {
  const rows = (body as { suggestions?: unknown } | null)?.suggestions;
  if (!Array.isArray(rows)) return [];
  const out: PlayerSuggestion[] = [];
  for (const row of rows) {
    if (!row || typeof row.label !== "string" || typeof row.player !== "string" || !row.label || !row.player) continue;
    const filter: PlayerSuggestion["filter"] = {};
    if (row.filter?.auto === true) filter.auto = true;
    if (typeof row.filter?.set === "string" && row.filter.set) filter.set = row.filter.set;
    out.push(Object.keys(filter).length ? { label: row.label, player: row.player, filter } : { label: row.label, player: row.player });
  }
  return out.slice(0, 8);
}

/**
 * The suggestions to show for what's typed now: only the ones fetched for this exact
 * text. Anything older is never shown, so a tap or Enter can't open another player.
 */
export function currentPlayerItems(players: { query: string; items: readonly PlayerSuggestion[] }, typed: string): PlayerSuggestion[] {
  const q = typed.trim();
  if (!wantsPlayerSuggestions(q) || players.query !== q) return [];
  return [...players.items];
}

/** Two picks open the same view only with the same player and the same chip. */
export function sameFilter(a: Partial<FeedFilters> | undefined, b: Partial<FeedFilters> | undefined): boolean {
  return (a?.auto === true) === (b?.auto === true) && (a?.set ?? null) === (b?.set ?? null);
}
