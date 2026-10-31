import "server-only";

import { cache } from "react";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { CARD_CATALOG } from "@/lib/card-catalog";
import { getPublicCardComps } from "@/lib/comps/public";
import { offersColumnMissing } from "@/lib/offers/open-to-offers";
import { INDEXED_DIRECTORY } from "@/lib/players/directory";
import { compactInterest } from "@/lib/social/follow-rank";
import { cleanImageUrl } from "@/lib/social/link-preview";
import { getSupabaseConfig } from "@/lib/supabase/client";
import { isUuid } from "@/lib/value/card-value-access";
import { playerIlikeOr } from "./ilike";
import {
  dedupeSoldPrices,
  PLAYER_POST_LIMIT,
  selectOfferOwners,
  selectPlayerCards,
  selectPlayerPosts,
  type HubCardInput,
  type HubMentionCard,
  type HubPostInput,
  type HubProfileInput,
  type HubSale,
  type PlayerHubChoice,
  type PlayerHubPage,
} from "./hub";
import {
  dedupePlayers,
  playerChoiceHref,
  playerNameIsShared,
  playerSpellings,
  resolvePlayerSlug,
  type PlayerRef,
  type PlayerSlugResolution,
} from "./slug";

export type PlayerChoice = PlayerHubChoice;

export type PlayerPageData = PlayerHubPage;

export type PlayerHubResult =
  | { kind: "missing" }
  | { kind: "error" }
  | { kind: "choices"; name: string; choices: PlayerChoice[] }
  | { kind: "player"; page: PlayerPageData };

const CARD_WITH_OFFERS =
  "id, user_id, player, sport, year, year_label, set, set_name, grade, grader, parallel, image_url, accent, created_at, open_to_offers";
const CARD_BASE =
  "id, user_id, player, sport, year, year_label, set, set_name, grade, grader, parallel, image_url, accent, created_at";
const POST_COLUMNS = "id, user_id, content, card, created_at, meta";
const PROFILE_WITH_TEST = "id, username, display_name, is_test";
const PROFILE_BASE = "id, username, display_name";

/** Two pages, so a common surname is not cut off at the first limit. */
const CARD_PAGE = 200;
const POST_PAGE = 120;
const CATALOG_PAGE = 80;
const PROFILE_CHUNK = 100;

let bundledCache: PlayerRef[] | null = null;

function bundledPlayers(): PlayerRef[] {
  if (bundledCache) return bundledCache;
  bundledCache = dedupePlayers([
    ...INDEXED_DIRECTORY.map((player) => ({ name: player.name, sport: player.sport })),
    ...CARD_CATALOG.map((card) => ({ name: card.playerName, sport: card.sport })),
  ]);
  return bundledCache;
}

/** Logged-out reader. RLS hides private cards and hidden posts. */
function createAnonReader(): SupabaseClient | null {
  const { url, anonKey, configured } = getSupabaseConfig();
  if (!configured) return null;
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function searchSpellings(rawSlug: string, preliminary: PlayerSlugResolution): string[] {
  const fromResolved =
    preliminary.status === "player"
      ? playerSpellings(preliminary.player.name)
      : preliminary.status === "choices"
        ? preliminary.players.flatMap((player) => playerSpellings(player.name))
        : [];
  let decoded = rawSlug.trim();
  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    decoded = rawSlug.trim();
  }
  const fromSlug = playerSpellings(decoded.replace(/[-_]+/g, " "));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const spelling of [...fromResolved, ...fromSlug]) {
    const id = spelling.toLocaleLowerCase();
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(spelling);
  }
  return out.slice(0, 8);
}

type QueryError = { code?: string; message?: string } | null;

function columnMissing(error: QueryError): boolean {
  return offersColumnMissing(error);
}

type CardRow = {
  id?: string;
  user_id?: string;
  player?: string | null;
  sport?: string | null;
  year?: number | string | null;
  year_label?: string | null;
  set?: string | null;
  set_name?: string | null;
  grade?: string | null;
  grader?: string | null;
  parallel?: string | null;
  image_url?: string | null;
  accent?: string | null;
  created_at?: string | null;
  open_to_offers?: boolean | null;
};

function asText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function mentionFrom(value: unknown): HubMentionCard | null {
  if (!value || typeof value !== "object") return null;
  const row = value as { playerName?: unknown; sport?: unknown };
  const playerName = asText(row.playerName).trim();
  if (!playerName) return null;
  return { playerName, sport: asText(row.sport) };
}

function metaMentions(meta: unknown): HubMentionCard[] {
  if (!meta || typeof meta !== "object") return [];
  const cards = (meta as { cards?: unknown }).cards;
  if (!Array.isArray(cards)) return [];
  const mentions: HubMentionCard[] = [];
  for (const card of cards) {
    const mention = mentionFrom(card);
    if (mention) mentions.push(mention);
  }
  return mentions;
}

function mapCard(row: CardRow, offersAvailable: boolean): HubCardInput | null {
  const id = asText(row.id);
  const ownerId = asText(row.user_id);
  const playerName = asText(row.player).trim();
  if (!id || !ownerId || !playerName) return null;
  const yearLabel = asText(row.year_label).trim() || (row.year != null && row.year !== "" ? String(row.year) : "");
  const setName = asText(row.set_name).trim() || asText(row.set).trim();
  const grader = asText(row.grader).trim();
  const gradeText = asText(row.grade).trim();
  return {
    id,
    playerName,
    sport: asText(row.sport),
    yearLabel,
    setName,
    grade: [grader, gradeText].filter(Boolean).join(" "),
    parallel: asText(row.parallel),
    imageUrl: cleanImageUrl(asText(row.image_url) || null),
    accent: asText(row.accent),
    ownerId,
    createdAt: asText(row.created_at),
    openToOffers: offersAvailable ? row.open_to_offers === true : null,
    isPublic: true,
  };
}

function mapProfile(row: {
  id?: string;
  username?: string;
  display_name?: string;
  is_test?: boolean | null;
}, sawTest: boolean): HubProfileInput | null {
  const id = asText(row.id);
  const username = asText(row.username).trim();
  if (!id || !username) return null;
  return {
    id,
    username,
    displayName: asText(row.display_name),
    ...(sawTest && row.is_test === true ? { isTest: true } : {}),
  };
}

type PostRow = {
  id?: string;
  user_id?: string;
  content?: string | null;
  card?: unknown;
  created_at?: string | null;
  meta?: unknown;
};

async function readCards(
  client: SupabaseClient,
  spellings: readonly string[],
): Promise<{ ok: boolean; offersAvailable: boolean; cards: HubCardInput[] }> {
  const filter = playerIlikeOr("player", spellings);
  let offersAvailable = true;
  let columns = CARD_WITH_OFFERS;
  const rows: CardRow[] = [];
  for (let page = 0; page < 2; page += 1) {
    const from = page * CARD_PAGE;
    let result = await client
      .from("public_cards")
      .select(columns)
      .or(filter)
      .order("created_at", { ascending: false })
      .range(from, from + CARD_PAGE - 1);
    if (page === 0 && columnMissing(result.error)) {
      offersAvailable = false;
      columns = CARD_BASE;
      result = await client
        .from("public_cards")
        .select(columns)
        .or(filter)
        .order("created_at", { ascending: false })
        .range(from, from + CARD_PAGE - 1);
    }
    if (result.error) return { ok: false, offersAvailable, cards: [] };
    const batch = (result.data ?? []) as CardRow[];
    rows.push(...batch);
    if (batch.length < CARD_PAGE) break;
  }
  const cards: HubCardInput[] = [];
  for (const row of rows) {
    const mapped = mapCard(row, offersAvailable);
    if (mapped) cards.push(mapped);
  }
  return { ok: true, offersAvailable, cards };
}

async function readCatalogNames(client: SupabaseClient, spellings: readonly string[]): Promise<PlayerRef[]> {
  const filter = playerIlikeOr("player", spellings);
  const rows: { player?: string | null; sport?: string | null }[] = [];
  for (let page = 0; page < 2; page += 1) {
    const from = page * CATALOG_PAGE;
    const result = await client
      .from("card_catalog")
      .select("player, sport")
      .or(filter)
      .range(from, from + CATALOG_PAGE - 1);
    if (result.error || !result.data) break;
    const batch = result.data as { player?: string | null; sport?: string | null }[];
    rows.push(...batch);
    if (batch.length < CATALOG_PAGE) break;
  }
  const names: PlayerRef[] = [];
  for (const row of rows) {
    const name = asText(row.player).trim();
    const sport = asText(row.sport).trim();
    if (name && sport) names.push({ name, sport });
  }
  return names;
}

async function readPosts(
  client: SupabaseClient,
  spellings: readonly string[],
  cardIds: readonly string[],
): Promise<HubPostInput[]> {
  const contentFilter = [
    playerIlikeOr("content", spellings),
    playerIlikeOr("card->>playerName", spellings),
  ].join(",");
  let rows: PostRow[] = [];
  let filter = contentFilter;
  for (let page = 0; page < 2; page += 1) {
    const from = page * POST_PAGE;
    let result = await client
      .from("posts")
      .select(POST_COLUMNS)
      .or(filter)
      .order("created_at", { ascending: false })
      .range(from, from + POST_PAGE - 1);
    if (page === 0 && result.error) {
      filter = playerIlikeOr("content", spellings);
      result = await client
        .from("posts")
        .select(POST_COLUMNS)
        .or(filter)
        .order("created_at", { ascending: false })
        .range(from, from + POST_PAGE - 1);
    }
    if (result.error) break;
    const batch = (result.data ?? []) as PostRow[];
    rows = rows.concat(batch);
    if (batch.length < POST_PAGE) break;
  }
  const ids = cardIds.filter((id) => isUuid(id)).slice(0, CARD_PAGE);
  if (ids.length > 0) {
    const links = await client.from("post_cards").select("post_id").in("card_id", ids).limit(POST_PAGE);
    const postIds = [
      ...new Set(
        ((links.data ?? []) as { post_id?: string }[])
          .map((row) => asText(row.post_id))
          .filter((id) => isUuid(id) && !rows.some((post) => post.id === id)),
      ),
    ];
    if (postIds.length > 0) {
      const linked = await client
        .from("posts")
        .select(POST_COLUMNS)
        .in("id", postIds)
        .order("created_at", { ascending: false });
      if (!linked.error && linked.data) rows = rows.concat(linked.data as PostRow[]);
    }
  }
  const posts: HubPostInput[] = [];
  for (const row of rows) {
    const id = asText(row.id);
    const authorId = asText(row.user_id);
    if (!id || !authorId) continue;
    posts.push({
      id,
      authorId,
      body: asText(row.content),
      createdAt: asText(row.created_at),
      attached: mentionFrom(row.card),
      metaCards: metaMentions(row.meta),
    });
  }
  return posts;
}

async function readProfiles(client: SupabaseClient, ids: readonly string[]): Promise<{ ok: boolean; profiles: HubProfileInput[] }> {
  const unique = [...new Set(ids)].filter(Boolean);
  if (unique.length === 0) return { ok: true, profiles: [] };
  const profiles: HubProfileInput[] = [];
  let sawTest = true;
  let columns = PROFILE_WITH_TEST;
  for (let start = 0; start < unique.length; start += PROFILE_CHUNK) {
    const chunk = unique.slice(start, start + PROFILE_CHUNK);
    let result = await client.from("profiles").select(columns).in("id", chunk);
    if (start === 0 && columnMissing(result.error)) {
      sawTest = false;
      columns = PROFILE_BASE;
      result = await client.from("profiles").select(columns).in("id", chunk);
    }
    if (result.error) return { ok: false, profiles: [] };
    for (const row of (result.data ?? []) as {
      id?: string;
      username?: string;
      display_name?: string;
      is_test?: boolean | null;
    }[]) {
      const mapped = mapProfile(row, sawTest);
      if (mapped) profiles.push(mapped);
    }
    if (chunk.length < PROFILE_CHUNK) break;
  }
  return { ok: true, profiles };
}

async function readSales(cardIds: readonly string[]): Promise<HubSale[]> {
  const ids = cardIds.filter((id) => isUuid(id)).slice(0, 6);
  const groups = await Promise.all(
    ids.map(async (id) => {
      try {
        const comps = await getPublicCardComps(id);
        return comps.sales.map((sale) => ({
          priceCents: sale.priceCents,
          soldAt: sale.soldAt,
          grade: sale.grade,
        }));
      } catch {
        return [];
      }
    }),
  );
  return dedupeSoldPrices(groups.flat());
}

function choiceResult(resolved: Extract<PlayerSlugResolution, { status: "choices" }>): PlayerHubResult {
  return {
    kind: "choices",
    name: resolved.name,
    choices: resolved.players.map((player) => ({
      name: player.name,
      sport: player.sport,
      href: playerChoiceHref(player, resolved.players),
    })),
  };
}

function emptyPage(player: PlayerRef, slug: string): PlayerPageData {
  return {
    name: player.name,
    sport: player.sport,
    slug,
    posts: [],
    cards: [],
    sales: [],
    owners: null,
  };
}

async function loadPlayerBody(rawSlug: string): Promise<PlayerHubResult> {
  const known = bundledPlayers();
  const preliminary = resolvePlayerSlug(rawSlug, known);
  const spellings = searchSpellings(rawSlug, preliminary);
  const client = createAnonReader();
  if (!client || spellings.length === 0) {
    if (preliminary.status === "unknown") return { kind: "missing" };
    if (preliminary.status === "choices") return choiceResult(preliminary);
    if (preliminary.status === "player") return { kind: "player", page: emptyPage(preliminary.player, preliminary.slug) };
    return { kind: "missing" };
  }

  const cardsResult = await readCards(client, spellings);
  if (!cardsResult.ok && preliminary.status === "unknown") return { kind: "error" };
  const catalogNames = cardsResult.ok ? await readCatalogNames(client, spellings) : [];
  const liveNames = cardsResult.cards.map((card) => ({ name: card.playerName, sport: card.sport }));
  const roster = [...known, ...catalogNames, ...liveNames];
  const resolved = resolvePlayerSlug(rawSlug, roster);
  if (resolved.status === "unknown") return { kind: "missing" };
  if (resolved.status === "choices") return choiceResult(resolved);
  if (!cardsResult.ok) return { kind: "player", page: emptyPage(resolved.player, resolved.slug) };

  const nameKey = compactInterest(resolved.player.name);
  const cardIds = cardsResult.cards
    .filter((card) => compactInterest(card.playerName) === nameKey)
    .map((card) => card.id);
  let posts: HubPostInput[] = [];
  try {
    posts = await readPosts(client, spellings, cardIds);
  } catch {
    posts = [];
  }
  const profileIds = [
    ...cardsResult.cards.map((card) => card.ownerId),
    ...posts.map((post) => post.authorId),
  ];
  const profilesResult = await readProfiles(client, profileIds);
  const profiles = profilesResult.ok ? profilesResult.profiles : [];
  const ambiguous = playerNameIsShared(resolved.player.name, roster);
  const cards = profilesResult.ok
    ? selectPlayerCards(cardsResult.cards, resolved.player, profiles)
    : [];
  const shownPosts = profilesResult.ok
    ? selectPlayerPosts(posts, resolved.player, profiles, PLAYER_POST_LIMIT, { ambiguous })
    : [];
  const owners = profilesResult.ok
    ? selectOfferOwners(cardsResult.cards, resolved.player, profiles)
    : null;
  return {
    kind: "player",
    page: {
      name: resolved.player.name,
      sport: resolved.player.sport,
      slug: resolved.slug,
      posts: shownPosts,
      cards,
      sales: [],
      owners,
    },
  };
}

const loadPlayerBodyCached = cache(loadPlayerBody);

export const loadPlayerHub = cache(async (rawSlug: string): Promise<PlayerHubResult> => {
  const result = await loadPlayerBodyCached(rawSlug);
  if (result.kind !== "player" || result.page.cards.length === 0) return result;
  let sales: HubSale[] = [];
  try {
    sales = await readSales(result.page.cards.map((card) => card.id));
  } catch {
    sales = [];
  }
  return { kind: "player", page: { ...result.page, sales } };
});

/** Directory and catalog only. Share images do not query the database. */
export function loadPlayerIdentity(rawSlug: string) {
  const resolved = resolvePlayerSlug(rawSlug, bundledPlayers());
  if (resolved.status === "player") {
    return { found: true as const, name: resolved.player.name, sport: resolved.player.sport };
  }
  if (resolved.status === "choices") {
    return {
      found: true as const,
      name: resolved.name,
      sport: resolved.players.map((player) => player.sport).join(" · "),
    };
  }
  return { found: false as const, name: "", sport: "" };
}
