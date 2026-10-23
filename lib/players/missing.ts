import { CARD_CATALOG } from "@/lib/card-catalog";
import { escapeIlike } from "@/lib/db/escape-ilike";
import { INDEXED_DIRECTORY } from "@/lib/players/directory";
import {
  dedupePlayers,
  resolvePlayerSlug,
  type PlayerRef,
} from "./slug";

let bundledCache: PlayerRef[] | null = null;

function bundledPlayers(): PlayerRef[] {
  if (bundledCache) return bundledCache;
  bundledCache = dedupePlayers([
    ...INDEXED_DIRECTORY.map((player) => ({ name: player.name, sport: player.sport })),
    ...CARD_CATALOG.map((card) => ({ name: card.playerName, sport: card.sport })),
  ]);
  return bundledCache;
}

/** `/p/:player` only. Share images and nested paths stay on their own routes. */
export function playerSlugFromPath(pathname: string): string | null {
  const cut = pathname.split("?")[0]?.split("#")[0] ?? "";
  const parts = cut.split("/").filter(Boolean).map((part) => {
    try {
      return decodeURIComponent(part);
    } catch {
      return part;
    }
  });
  if (parts.length !== 2 || parts[0] !== "p" || !parts[1]) return null;
  return parts[1];
}

function searchToken(key: string): string {
  const words = key.split(" ").filter((word) => word.length >= 3);
  const pool = words.length > 0 ? words : key.split(" ").filter(Boolean);
  return [...pool].sort((a, b) => b.length - a.length)[0] ?? "";
}

type NameRow = { player?: string | null; sport?: string | null };

async function readNames(
  supabaseUrl: string,
  anonKey: string,
  table: "public_cards" | "card_catalog",
  token: string,
  fetchImpl: typeof fetch,
): Promise<PlayerRef[] | null> {
  const pattern = `*${escapeIlike(token)}*`;
  const path =
    `${table}?player=ilike.${encodeURIComponent(pattern)}&select=player,sport&limit=40`;
  try {
    const response = await fetchImpl(`${supabaseUrl.replace(/\/$/, "")}/rest/v1/${path}`, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        Accept: "application/json",
      },
    });
    if (!response.ok) return null;
    const body = (await response.json()) as unknown;
    if (!Array.isArray(body)) return null;
    const names: PlayerRef[] = [];
    for (const row of body as NameRow[]) {
      const name = typeof row.player === "string" ? row.player.trim() : "";
      const sport = typeof row.sport === "string" ? row.sport.trim() : "";
      if (name && sport) names.push({ name, sport });
    }
    return names;
  } catch {
    return null;
  }
}

/**
 * True when this /p URL is not a known player.
 * A lookup error stays on the page. The anon key only reads public tables.
 */
export async function playerPathIsMissing(input: {
  pathname: string;
  supabaseUrl: string | undefined;
  anonKey: string | undefined;
  players?: readonly PlayerRef[];
  fetchImpl?: typeof fetch;
}): Promise<boolean> {
  const slug = playerSlugFromPath(input.pathname);
  if (!slug) return false;
  const known = input.players ? dedupePlayers(input.players) : bundledPlayers();
  const preliminary = resolvePlayerSlug(slug, known);
  if (preliminary.status !== "unknown") return false;
  const url = input.supabaseUrl?.trim();
  const key = input.anonKey?.trim();
  if (!url || !key) return true;
  const token = searchToken(slug.replace(/-/g, " "));
  if (!token) return true;
  const fetchImpl = input.fetchImpl ?? fetch;
  const [cards, catalog] = await Promise.all([
    readNames(url, key, "public_cards", token, fetchImpl),
    readNames(url, key, "card_catalog", token, fetchImpl),
  ]);
  if (!cards || !catalog) return false;
  const resolved = resolvePlayerSlug(slug, [...known, ...cards, ...catalog]);
  return resolved.status === "unknown";
}
