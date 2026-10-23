import { collectSportBlocked } from "@/lib/social/collect-interests";
import { normInterest } from "@/lib/social/follow-rank";
import { blockedCustomName } from "@/lib/players/suggest";
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

/** "cj stroud" → "cj-stroud". Empty when the name has no letters. */
export function playerBaseSlug(name: string): string {
  return playerNameKey(name).replace(/ /g, "-");
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
  if (!playerNameKey(name) || !sportSlug(sport)) return false;
  return true;
}

/**
 * One row per name-key and sport. "C.J. Stroud" and "CJ Stroud" collapse.
 * Will Smith in baseball stays separate from Will Smith in hockey.
 * Pokémon and TCG names are dropped.
 */
export function dedupePlayers(players: readonly PlayerRef[]): PlayerRef[] {
  const map = new Map<string, PlayerRef>();
  for (const player of players) {
    if (!allowedPlayer(player)) continue;
    const name = player.name.trim().replace(/\s+/g, " ");
    const sport = sportLabel(player.sport);
    const id = `${playerNameKey(name)}|${sportSlug(sport)}`;
    const current = map.get(id);
    if (!current || spellingScore(name) > spellingScore(current.name)) {
      map.set(id, { name, sport });
    }
  }
  return [...map.values()].sort((a, b) => {
    const byName = a.name.localeCompare(b.name);
    if (byName !== 0) return byName;
    return a.sport.localeCompare(b.sport);
  });
}

function sameName(players: readonly PlayerRef[], name: string): PlayerRef[] {
  const key = playerNameKey(name);
  return players.filter((player) => playerNameKey(player.name) === key);
}

/** Short slug when the name is one sport. Shared names append the sport. */
export function canonicalPlayerSlug(player: PlayerRef, peers: readonly PlayerRef[]): string {
  const base = playerBaseSlug(player.name);
  const sport = sportSlug(player.sport);
  if (!base) return "";
  if (sameName(peers, player.name).length <= 1) return base;
  return sport ? `${base}-${sport}` : base;
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
    const key = playerNameKey(slug.slice(0, -suffix.length).replace(/-/g, " "));
    if (!key) continue;
    return { key, sport };
  }
  return null;
}

/**
 * Resolve a /p/[player] segment.
 * The full name wins before a sport suffix, so a player whose name ends in
 * a sport is not split. An unknown slug stays unknown.
 */
export function resolvePlayerSlug(
  rawSlug: string,
  players: readonly PlayerRef[],
): PlayerSlugResolution {
  const slug = normalizeSlug(rawSlug);
  if (!slug) return { status: "unknown" };
  const deduped = dedupePlayers(players);
  const fullKey = playerNameKey(slug.replace(/-/g, " "));
  const full = fullKey ? deduped.filter((player) => playerNameKey(player.name) === fullKey) : [];
  if (full.length === 1) {
    const player = full[0];
    if (!player) return { status: "unknown" };
    return { status: "player", player, slug: canonicalPlayerSlug(player, deduped) };
  }
  if (full.length > 1) {
    const choices = [...full].sort((a, b) => a.sport.localeCompare(b.sport));
    return { status: "choices", name: preferredName(choices), players: choices };
  }
  const split = splitSport(slug, deduped);
  if (!split) return { status: "unknown" };
  const match = deduped.filter(
    (player) => playerNameKey(player.name) === split.key && sportSlug(player.sport) === split.sport,
  );
  if (match.length !== 1) return { status: "unknown" };
  const player = match[0];
  if (!player) return { status: "unknown" };
  return { status: "player", player, slug: canonicalPlayerSlug(player, deduped) };
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
  if (!sportPart || !LINK_SPORTS.has(sportPart)) return `/p/${base}`;
  return `/p/${base}-${sportPart}`;
}

export function playerChoiceHref(player: PlayerRef, peers: readonly PlayerRef[]): string {
  const slug = canonicalPlayerSlug(player, peers);
  return slug ? `/p/${slug}` : "/p";
}
