import "server-only";

import { cache } from "react";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { CARD_CATALOG } from "@/lib/card-catalog";
import { getPublicCardComps } from "@/lib/comps/public";
import { escapeIlike } from "@/lib/db/escape-ilike";
import { offersColumnMissing } from "@/lib/offers/open-to-offers";
import { INDEXED_DIRECTORY } from "@/lib/players/directory";
import { cleanImageUrl } from "@/lib/social/link-preview";
import { getSupabaseConfig } from "@/lib/supabase/client";
import { isUuid } from "@/lib/value/card-value-access";
import {
  dedupeSoldPrices,
  selectOfferOwners,
  selectPlayerCards,
  selectPlayerPosts,
  type HubCardInput,
  type HubMentionCard,
  type HubPostInput,
  type HubProfileInput,
  type HubSale,
} from "./hub";
import {
  dedupePlayers,
  normalizeSlug,
  playerChoiceHref,
  playerNameKey,
  resolvePlayerSlug,
  type PlayerRef,
  type PlayerSlugResolution,
} from "./slug";

export type PlayerChoice = {
  name: string;
  sport: string;
  href: string;
};

export type PlayerPageData = {
  name: string;
  sport: string;
  slug: string;
  posts: ReturnType<typeof selectPlayerPosts>;
  cards: ReturnType<typeof selectPlayerCards>;
  sales: HubSale[];
  owners: ReturnType<typeof selectOfferOwners>;
};

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

function searchToken(key: string): string {
  const words = key.split(" ").filter((word) => word.length >= 3);
  const pool = words.length > 0 ? words : key.split(" ").filter(Boolean);
  return [...pool].sort((a, b) => b.length - a.length)[0] ?? "";
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

async function readCards(
  client: SupabaseClient,
  token: string,
): Promise<{ ok: boolean; offersAvailable: boolean; cards: HubCardInput[] }> {
  const pattern = `%${escapeIlike(token)}%`;
  const first = await client
    .from("public_cards")
    .select(CARD_WITH_OFFERS)
    .ilike("player", pattern)
    .order("created_at", { ascending: false })
    .limit(80);
  let offersAvailable = true;
  let data = first.data as CardRow[] | null;
  let error = first.error;
  if (columnMissing(error)) {
    offersAvailable = false;
    const retry = await client
      .from("public_cards")
      .select(CARD_BASE)
      .ilike("player", pattern)
      .order("created_at", { ascending: false })
      .limit(80);
    data = retry.data as CardRow[] | null;
    error = retry.error;
  }
  if (error) return { ok: false, offersAvailable, cards: [] };
  const cards: HubCardInput[] = [];
  for (const row of data ?? []) {
    const mapped = mapCard(row, offersAvailable);
    if (mapped) cards.push(mapped);
  }
  return { ok: true, offersAvailable, cards };
}

async function readCatalogNames(client: SupabaseClient, token: string): Promise<PlayerRef[]> {
  const pattern = `%${escapeIlike(token)}%`;
  const { data, error } = await client
    .from("card_catalog")
    .select("player, sport")
    .ilike("player", pattern)
    .limit(40);
  if (error || !data) return [];
  const names: PlayerRef[] = [];
  for (const row of data as { player?: string | null; sport?: string | null }[]) {
    const name = asText(row.player).trim();
    const sport = asText(row.sport).trim();
    if (name && sport) names.push({ name, sport });
  }
  return names;
}

async function readPosts(client: SupabaseClient, token: string, cardIds: readonly string[]): Promise<HubPostInput[]> {
  const pattern = `%${escapeIlike(token)}%`;
  const content = await client
    .from("posts")
    .select(POST_COLUMNS)
    .or(`content.ilike.${pattern},card->>playerName.ilike.${pattern}`)
    .order("created_at", { ascending: false })
    .limit(40);
  let rows = (content.error ? [] : content.data ?? []) as {
    id?: string;
    user_id?: string;
    content?: string | null;
    card?: unknown;
    created_at?: string | null;
    meta?: unknown;
  }[];
  if (content.error) {
    const fallback = await client
      .from("posts")
      .select(POST_COLUMNS)
      .ilike("content", pattern)
      .order("created_at", { ascending: false })
      .limit(40);
    rows = (fallback.error ? [] : fallback.data ?? []) as typeof rows;
  }
  const ids = cardIds.filter((id) => isUuid(id)).slice(0, 40);
  if (ids.length > 0) {
    const links = await client.from("post_cards").select("post_id").in("card_id", ids).limit(40);
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
      if (!linked.error && linked.data) rows = rows.concat(linked.data as typeof rows);
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
  const unique = [...new Set(ids)].filter(Boolean).slice(0, 80);
  if (unique.length === 0) return { ok: true, profiles: [] };
  const first = await client.from("profiles").select(PROFILE_WITH_TEST).in("id", unique);
  let sawTest = true;
  let data = first.data as {
    id?: string;
    username?: string;
    display_name?: string;
    is_test?: boolean | null;
  }[] | null;
  let error = first.error;
  if (columnMissing(error)) {
    sawTest = false;
    const retry = await client.from("profiles").select(PROFILE_BASE).in("id", unique);
    data = retry.data as typeof data;
    error = retry.error;
  }
  if (error) return { ok: false, profiles: [] };
  const profiles: HubProfileInput[] = [];
  for (const row of data ?? []) {
    const mapped = mapProfile(row, sawTest);
    if (mapped) profiles.push(mapped);
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
  const key =
    preliminary.status === "player"
      ? playerNameKey(preliminary.player.name)
      : preliminary.status === "choices"
        ? playerNameKey(preliminary.name)
        : playerNameKey(normalizeSlug(rawSlug).replace(/-/g, " "));
  const token = searchToken(key);
  const client = createAnonReader();
  if (!client) {
    if (preliminary.status === "unknown") return { kind: "missing" };
    if (preliminary.status === "choices") return choiceResult(preliminary);
    return { kind: "player", page: emptyPage(preliminary.player, preliminary.slug) };
  }
  if (!token) {
    if (preliminary.status === "unknown") return { kind: "missing" };
    if (preliminary.status === "choices") return choiceResult(preliminary);
    return { kind: "player", page: emptyPage(preliminary.player, preliminary.slug) };
  }

  const cardsResult = await readCards(client, token);
  if (!cardsResult.ok && preliminary.status === "unknown") return { kind: "error" };
  const catalogNames = cardsResult.ok ? await readCatalogNames(client, token) : [];
  const liveNames = cardsResult.cards.map((card) => ({ name: card.playerName, sport: card.sport }));
  const resolved = resolvePlayerSlug(rawSlug, [...known, ...catalogNames, ...liveNames]);
  if (resolved.status === "unknown") return { kind: "missing" };
  if (resolved.status === "choices") return choiceResult(resolved);
  if (!cardsResult.ok) return { kind: "player", page: emptyPage(resolved.player, resolved.slug) };

  const cardIds = cardsResult.cards
    .filter((card) => playerNameKey(card.playerName) === playerNameKey(resolved.player.name))
    .map((card) => card.id);
  let posts: HubPostInput[] = [];
  try {
    posts = await readPosts(client, token, cardIds);
  } catch {
    posts = [];
  }
  const profileIds = [
    ...cardsResult.cards.map((card) => card.ownerId),
    ...posts.map((post) => post.authorId),
  ];
  const profilesResult = await readProfiles(client, profileIds);
  const profiles = profilesResult.ok ? profilesResult.profiles : [];
  const cards = profilesResult.ok
    ? selectPlayerCards(cardsResult.cards, resolved.player, profiles)
    : [];
  const shownPosts = profilesResult.ok ? selectPlayerPosts(posts, resolved.player, profiles) : [];
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

export const loadPlayerIdentity = cache(async (rawSlug: string) => {
  const result = await loadPlayerBodyCached(rawSlug);
  if (result.kind === "player") {
    return { found: true as const, name: result.page.name, sport: result.page.sport };
  }
  if (result.kind === "choices") {
    return {
      found: true as const,
      name: result.name,
      sport: result.choices.map((choice) => choice.sport).join(" · "),
    };
  }
  return { found: false as const, name: "", sport: "" };
});
