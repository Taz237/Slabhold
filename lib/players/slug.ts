import { collectSportBlocked } from "@/lib/social/collect-interests";
import { compactInterest, normInterest } from "@/lib/social/follow-rank";
import { blockedCustomName } from "@/lib/players/suggest";
import { AMBIGUOUS_PLAYER_KEYS } from "./canonical-path";
import { collapseInitials } from "./initials";

/** Sports a player link may append. Other values stay on the short slug. */
const LINK_SPORTS = new Set(["baseball", "basketball", "football", "hockey", "soccer"]);

const SPORT_LABELS: Record<string, string> = {
  baseball: "Baseball",
  basketball: "Basketball",
  football: "Football",
  hockey: "Hockey",
  soccer: "Soccer",
};

export type PlayerRef = {
  name: string;
  sport: string;
};

export type PlayerSlugResolution =
  | { status: "player"; player: PlayerRef; slug: string }
  | { status: "choices"; name: string; players: PlayerRef[] }
  | { status: "unknown" };

/**
 * Lowercase, unaccented, initials joined.
 * "C.J. Stroud", "CJ Stroud", and "c j stroud" share "cj stroud".
 */
export function playerNameKey(value: string): string {
  const norm = normInterest(value);
  if (!norm) return "";
  return collapseInitials(norm.split(" ")).join(" ");
}

/** "cj stroud" → "cj-stroud". Apostrophes and dots are not their own word. */
export function playerBaseSlug(name: string): string {
  const stripped = name.replace(/['’.]/g, "");
  return playerNameKey(stripped).replace(/ /g, "-");
}

export function sportSlug(sport: string): string {
  return normInterest(sport).replace(/ /g, "-");
}

export function sportLabel(sport: string): string {
  const slug = sportSlug(sport);
  if (SPORT_LABELS[slug]) return SPORT_LABELS[slug];
  return sport.trim().replace(/\s+/g, " ");
}

/**
 * One path segment. Dots are removed and case is folded so
 * "C.J. Stroud" and "cj-stroud" are the same slug.
 */
export function normalizeSlug(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 120) return "";
  let value = trimmed;
  try {
    value = decodeURIComponent(trimmed);
  } catch {
    return "";
  }
  value = value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\./g, "");
  value = value.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").replace(/-{2,}/g, "-");
  if (!value || value.length > 80) return "";
  return value;
}

/** Accented, unaccented, and punctuation-stripped copies of one display name. */
export function playerSpellings(name: string): string[] {
  const raw = name.trim().replace(/\s+/g, " ");
  if (!raw) return [];
  const folded = raw.normalize("NFD").replace(/\p{M}/gu, "");
  const flatten = (value: string) => value.replace(/['’.]/g, "").replace(/\s+/g, " ").trim();
  const seen = new Set<string>();
  const out: string[] = [];
  for (const variant of [raw, folded, flatten(raw), flatten(folded)]) {
    const cleaned = variant.replace(/\s+/g, " ").trim();
    const id = cleaned.toLocaleLowerCase();
    if (!cleaned || seen.has(id)) continue;
    seen.add(id);
    out.push(cleaned);
  }
  return out;
}

export function ambiguousPlayerKeys(): string[] {
  return [...AMBIGUOUS_PLAYER_KEYS].sort();
}

/** True when the bundled roster has this name in more than one sport. */
export function sharedPlayerName(name: string): boolean {
  return AMBIGUOUS_PLAYER_KEYS.has(compactInterest(name));
}

function hasMixedCase(value: string): boolean {
  let upper = false;
  let lower = false;
  for (const char of value) {
    if (/\p{Ll}/u.test(char)) lower = true;
    else if (/\p{Lu}/u.test(char)) upper = true;
    if (upper && lower) return true;
  }
  return false;
}

/** Dotted and accented spellings win over a flat ASCII copy of the same name. */
function spellingScore(name: string): number {
  let score = 0;
  if (name.includes(".")) score += 8;
  if (/[^\u0000-\u007f]/.test(name)) score += 4;
  if (hasMixedCase(name)) score += 2;
  return score;
}

function allowedPlayer(player: PlayerRef): boolean {
  const name = player.name.trim();
  const sport = player.sport.trim();
  if (!name || !sport) return false;
  if (blockedCustomName(name) || collectSportBlocked(sport)) return false;
  if (!compactInterest(name) || !sportSlug(sport)) return false;
  return true;
}

/** A deduped row and its compact name, the key the roster index groups by. */
type DedupeEntry = { player: PlayerRef; compact: string };

/** dedupePlayers' loop over players[from, to), into `map`. */
function dedupeInto(map: Map<string, DedupeEntry>, players: readonly PlayerRef[], from: number, to: number) {
  for (let i = from; i < to; i += 1) {
    const player = players[i];
    if (!allowedPlayer(player)) continue;
    const name = player.name.trim().replace(/\s+/g, " ");
    const sport = sportLabel(player.sport);
    const compact = compactInterest(name);
    const id = `${compact}|${sportSlug(sport)}`;
    const current = map.get(id);
    if (!current || spellingScore(name) > spellingScore(current.player.name)) {
      map.set(id, { player: { name, sport }, compact });
    }
  }
}

function sortedEntries(map: Map<string, DedupeEntry>): DedupeEntry[] {
  return [...map.values()].sort((a, b) => {
    const byName = a.player.name.localeCompare(b.player.name);
    if (byName !== 0) return byName;
    return a.player.sport.localeCompare(b.player.sport);
  });
}

/**
 * One row per compact name and sport. "Ja'Marr Chase" and "JaMarr Chase" collapse,
 * and "Luka Dončić" collapses with "Luka Doncic".
 * Will Smith in baseball stays separate from Will Smith in hockey.
 * Pokémon and TCG names are dropped.
 */
export function dedupePlayers(players: readonly PlayerRef[]): PlayerRef[] {
  const map = new Map<string, DedupeEntry>();
  dedupeInto(map, players, 0, players.length);
  return sortedEntries(map).map((entry) => entry.player);
}

type RosterIndex = {
  byCompact: Map<string, PlayerRef[]>;
  players: PlayerRef[];
};

/** One index per roster array. A stable roster is not deduped again on the next lookup. */
const rosterIndexes = new WeakMap<readonly PlayerRef[], RosterIndex>();

function indexFrom(entries: DedupeEntry[]): RosterIndex {
  const byCompact = new Map<string, PlayerRef[]>();
  for (const { player, compact } of entries) {
    if (!compact) continue;
    const list = byCompact.get(compact);
    if (list) list.push(player);
    else byCompact.set(compact, [player]);
  }
  return { byCompact, players: entries.map((entry) => entry.player) };
}

function rosterIndex(players: readonly PlayerRef[]): RosterIndex {
  const cached = rosterIndexes.get(players);
  if (cached) return cached;
  const map = new Map<string, DedupeEntry>();
  dedupeInto(map, players, 0, players.length);
  const index = indexFrom(sortedEntries(map));
  rosterIndexes.set(players, index);
  return index;
}

export type PrepareRosterOptions = {
  /** Main-thread time per slice before yielding. */
  budgetMs?: number;
  yieldToMain?: () => Promise<void>;
};

const SLICE_ROWS = 64;
const pendingIndexes = new WeakMap<readonly PlayerRef[], Promise<void>>();

function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Builds the same index the first lookup would, a few milliseconds at a time,
 * so a roster of thousands never blocks the page in one long task. Lookups
 * on this roster after it resolves reuse the index.
 */
export function prepareRosterIndex(
  players: readonly PlayerRef[],
  { budgetMs = 8, yieldToMain = yieldToBrowser }: PrepareRosterOptions = {},
): Promise<void> {
  if (rosterIndexes.has(players)) return Promise.resolve();
  const pending = pendingIndexes.get(players);
  if (pending) return pending;
  const task = (async () => {
    const map = new Map<string, DedupeEntry>();
    let next = 0;
    while (next < players.length) {
      const started = performance.now();
      do {
        const end = Math.min(next + SLICE_ROWS, players.length);
        dedupeInto(map, players, next, end);
        next = end;
      } while (next < players.length && performance.now() - started < budgetMs);
      if (next < players.length) await yieldToMain();
      // A lookup in the meantime built it in one go.
      if (rosterIndexes.has(players)) return;
    }
    rosterIndexes.set(players, indexFrom(sortedEntries(map)));
  })().finally(() => {
    pendingIndexes.delete(players);
  });
  pendingIndexes.set(players, task);
  return task;
}

function canonicalFromIndex(player: PlayerRef, index: RosterIndex): string {
  const base = playerBaseSlug(player.name);
  const sport = sportSlug(player.sport);
  if (!base) return "";
  const group = index.byCompact.get(compactInterest(player.name)) ?? [];
  if (group.length <= 1) return base;
  return sport ? `${base}-${sport}` : base;
}

/** Short slug when the name is one sport. Shared names append the sport. */
export function canonicalPlayerSlug(player: PlayerRef, peers: readonly PlayerRef[]): string {
  return canonicalFromIndex(player, rosterIndex(peers));
}

/** True when this roster has the name in more than one sport. */
export function playerNameIsShared(name: string, peers: readonly PlayerRef[]): boolean {
  const key = compactInterest(name);
  if (!key) return false;
  return (rosterIndex(peers).byCompact.get(key)?.length ?? 0) > 1;
}

function preferredName(players: readonly PlayerRef[]): string {
  let best = players[0]?.name ?? "";
  let bestScore = spellingScore(best);
  for (const player of players) {
    const score = spellingScore(player.name);
    if (score > bestScore) {
      best = player.name;
      bestScore = score;
    }
  }
  return best;
}

function sportSuffixes(players: readonly PlayerRef[]): string[] {
  const slugs = new Set<string>(LINK_SPORTS);
  for (const player of players) {
    const slug = sportSlug(player.sport);
    if (slug) slugs.add(slug);
  }
  return [...slugs].sort((a, b) => b.length - a.length || a.localeCompare(b));
}

function splitSport(slug: string, players: readonly PlayerRef[]): { key: string; sport: string } | null {
  for (const sport of sportSuffixes(players)) {
    const suffix = `-${sport}`;
    if (!slug.endsWith(suffix) || slug.length <= suffix.length) continue;
    const key = compactInterest(slug.slice(0, -suffix.length));
    if (!key) continue;
    return { key, sport };
  }
  return null;
}

/**
 * Resolve a /p/[player] segment.
 * Keys are the compact name, so "ja-marr-chase" and "jamarr-chase" match,
 * and "luka-doncic" matches "Luka Dončić".
 * The full name wins before a sport suffix. An unknown slug stays unknown.
 */
export function resolvePlayerSlug(
  rawSlug: string,
  players: readonly PlayerRef[],
): PlayerSlugResolution {
  const slug = normalizeSlug(rawSlug);
  if (!slug) return { status: "unknown" };
  const index = rosterIndex(players);
  const fullKey = compactInterest(slug);
  const full = fullKey ? (index.byCompact.get(fullKey) ?? []) : [];
  if (full.length === 1) {
    const player = full[0];
    if (!player) return { status: "unknown" };
    return { status: "player", player, slug: canonicalFromIndex(player, index) };
  }
  if (full.length > 1) {
    const choices = [...full].sort((a, b) => a.sport.localeCompare(b.sport));
    return { status: "choices", name: preferredName(choices), players: choices };
  }
  const split = splitSport(slug, index.players);
  if (!split) return { status: "unknown" };
  const match = (index.byCompact.get(split.key) ?? []).filter(
    (player) => sportSlug(player.sport) === split.sport,
  );
  if (match.length !== 1) return { status: "unknown" };
  const player = match[0];
  if (!player) return { status: "unknown" };
  return { status: "player", player, slug: canonicalFromIndex(player, index) };
}

/** Public player path. Null for a blank, Pokémon, or TCG name. */
export function playerHref(name: string, sport?: string | null): string | null {
  const trimmed = name.trim();
  if (!trimmed || playerNameKey(trimmed) === "card") return null;
  if (blockedCustomName(trimmed)) return null;
  if (sport && collectSportBlocked(sport)) return null;
  const base = playerBaseSlug(trimmed);
  if (!base) return null;
  const sportPart = sport ? sportSlug(sport) : "";
  if (!sportPart || !sharedPlayerName(trimmed) || !LINK_SPORTS.has(sportPart)) return `/p/${base}`;
  return `/p/${base}-${sportPart}`;
}

/**
 * /p link when this roster resolves the name. Unknown names stay unlinked.
 * The href is the canonical slug.
 */
export function resolvedPlayerHref(
  name: string,
  sport: string | null | undefined,
  roster: readonly PlayerRef[],
): string | null {
  const href = playerHref(name, sport);
  if (!href) return null;
  const resolved = resolvePlayerSlug(href.slice("/p/".length), roster);
  if (resolved.status === "unknown") return null;
  if (resolved.status === "player") return `/p/${resolved.slug}`;
  return href;
}

export function playerChoiceHref(player: PlayerRef, peers: readonly PlayerRef[]): string {
  const slug = canonicalPlayerSlug(player, peers);
  return slug ? `/p/${slug}` : "/p";
}
