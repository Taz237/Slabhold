import "server-only";

import { cache } from "react";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "@/lib/supabase/client";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { wantLabel } from "@/lib/wants/label";
import { feedChipPrice, resolvePriceRead, type PriceRead } from "@/lib/value/price-fallback";
import { attachPriceContext, knownPriceCard } from "@/lib/value/price-context";
import { getCardValue, getCardValues } from "@/lib/value/getCardValue";
import { isUuid } from "@/lib/value/card-value-access";
import type { CardValueResult } from "@/lib/value/types";
import { mapPublicCard, PUBLIC_CARD_SELECT, type CardRow } from "./cards";
import {
  cardLinkPreview,
  postLinkPreview,
  postPreviewImage,
  profileLinkPreview,
  type LinkPreview,
} from "./link-preview";
import { normalizeUsername } from "./local-db";
import { mailDayOgTitle } from "./mail-day-copy";
import {
  cardShareImage,
  mailDayPhotoUrls,
  postOgCopy,
  postShareImage,
  profileShareImage,
  type ShareBadge,
  type ShareImage,
} from "./share-image";
import { badgeShareView, earnedOnLabel, type BadgeShareView } from "@/lib/badges/share";
import { profilePins } from "@/lib/badges/pins";
import { readVisiblePins } from "@/lib/badges/visible-pins";
import { isBadgeCategory, isBadgeTier } from "@/lib/badges/config";
import { createSupabaseServer, getAuthUserId } from "@/lib/supabase/server";

/** Share images are cached on a public CDN, so this client never reads cookies. */
function createAnonReader(): SupabaseClient | null {
  const { url, anonKey, configured } = getSupabaseConfig();
  if (!configured) return null;
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function publicCardCount(
  userId: string,
): Promise<number | null> {
  const supabase = createAnonReader();
  if (!supabase) return null;
  const { count, error } = await supabase
    .from("public_cards")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (error || count == null) return null;
  return count;
}

export type PublicCardPreview = LinkPreview & { updatedAt: string | null };

function cardPreview(preview: LinkPreview, updatedAt: string | null = null): PublicCardPreview {
  return { ...preview, updatedAt };
}

/** Logged-out readers only see public_cards, so a missing row stays generic. */
export const loadPublicCardPreview = cache(async (id: string): Promise<PublicCardPreview> => {
  const supabase = createAnonReader();
  if (!supabase || !isUuid(id)) return cardPreview(cardLinkPreview({ isPublic: false }));

  const { data, error } = await supabase
    .from("public_cards")
    .select(`${PUBLIC_CARD_SELECT}, updated_at`)
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return cardPreview(cardLinkPreview({ isPublic: false }));

  const card = mapPublicCard(data);
  const updatedAt = typeof data.updated_at === "string" ? data.updated_at : null;
  return cardPreview(
    cardLinkPreview({
      isPublic: true,
      name: wantLabel(card) || card.playerName,
      imageUrl: card.photoDataUrl,
      valueLabel: await previewValueLabel(card.id, card.createdAt, data),
    }),
    updatedAt,
  );
});

/**
 * Public share text. Attach the same sales the card page uses, with no viewer,
 * so a 1–2 sale card is not labeled from the stored p25–p75 band.
 * Only call this for a card already known to be public.
 */
async function previewValueLabel(
  cardId: string,
  createdAt: string | undefined,
  row: Parameters<typeof knownPriceCard>[0],
): Promise<string> {
  const value = await publicCardValue(cardId, row);
  return sharePriceText(value, createdAt);
}

/**
 * Stored row plus exact sales. The public card row already loaded is reused,
 * so this does not read the cards table again. A failed attach leaves sales unset.
 */
async function publicCardValue(
  cardId: string,
  row: Parameters<typeof knownPriceCard>[0],
): Promise<CardValueResult | null> {
  const stored = await getCardValue(cardId);
  if (!stored) return null;
  const values = new Map([[cardId, stored]]);
  const known = knownPriceCard({ ...row, id: row.id || cardId });
  const attached = await attachPriceContext([cardId], values, null, known ? [known] : undefined);
  return attached.get(cardId) ?? stored;
}

/**
 * Label for a public card. When the sale list did not load, a 2-sale card
 * says "~$median from 2 sales" instead of the stored p25–p75 band.
 */
export function sharePriceText(
  value: CardValueResult | null | undefined,
  createdAt?: string | null,
): string {
  return feedChipPrice(sharePriceRead(value, createdAt)).text;
}

function sharePriceRead(
  value: CardValueResult | null | undefined,
  createdAt?: string | null,
): PriceRead {
  const loaded = Boolean(value && value.sales !== undefined);
  return resolvePriceRead({
    value: loaded ? value : unloadedSaleValue(value),
    createdAt,
    exactSales: loaded && value ? value.sales : undefined,
  });
}

/** Collapse an unloaded 2-sale band onto the median so p25–p75 never ships. */
function unloadedSaleValue(
  value: CardValueResult | null | undefined,
): CardValueResult | null | undefined {
  if (!value || value.status !== "ok" || value.nSales !== 2) return value;
  const mid = value.median;
  if (typeof mid !== "number" || !Number.isFinite(mid) || mid < 0.01) return value;
  return { ...value, low: mid, high: mid };
}

export const loadProfilePreview = cache(async (username: string): Promise<LinkPreview> => {
  const supabase = createAnonReader();
  const normalized = normalizeUsername(username);
  if (!supabase || !normalized) return profileLinkPreview({ found: false });

  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url")
    .eq("username", normalized)
    .maybeSingle();
  if (error || !data) return profileLinkPreview({ found: false });

  return profileLinkPreview({
    found: true,
    username: data.username as string,
    displayName: data.display_name as string,
    avatarUrl: (data.avatar_url as string | null) ?? null,
    publicCardCount: await publicCardCount(data.id as string),
  });
});

/** The signed-in collector, counted from public cards only. */
export const loadOwnProfilePreview = cache(async (): Promise<LinkPreview> => {
  const userId = await getAuthUserId();
  if (!userId) return profileLinkPreview({ found: false });
  const supabase = await createSupabaseServer();
  if (!supabase) return profileLinkPreview({ found: false });

  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url")
    .eq("id", userId)
    .maybeSingle();
  if (error || !data) return profileLinkPreview({ found: false });

  return profileLinkPreview({
    found: true,
    username: data.username as string,
    displayName: data.display_name as string,
    avatarUrl: (data.avatar_url as string | null) ?? null,
    publicCardCount: await publicCardCount(userId),
  });
});

function snapshotCardId(card: unknown): string | null {
  if (!card || typeof card !== "object") return null;
  const id = (card as { id?: unknown }).id;
  return typeof id === "string" ? id : null;
}

export const loadPostPreview = cache(async (id: string): Promise<LinkPreview> => {
  const supabase = createAnonReader();
  if (!supabase || !isUuid(id)) return postLinkPreview({ found: false });

  const { data, error } = await supabase
    .from("posts")
    .select("content, image_url, card, post_type, meta, user_id")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return postLinkPreview({ found: false });
  const author = await postAuthor(supabase, data.user_id);

  const cardId = snapshotCardId(data.card);
  let cardImage: string | null = null;
  let cardIsPublic = false;
  if (cardId && isUuid(cardId)) {
    const pub = await supabase
      .from("public_cards")
      .select("image_url")
      .eq("id", cardId)
      .maybeSingle();
    cardIsPublic = Boolean(pub.data);
    cardImage = cardIsPublic ? ((pub.data?.image_url as string | null) ?? null) : null;
  }

  let mailDayTitle: string | null = null;
  if (data.post_type === "mail_day") {
    const ids = linkedCardIds(data.card, data.meta);
    if (ids.length) {
      const { data: rows } = await supabase
        .from("public_cards")
        .select(PUBLIC_CARD_SELECT)
        .in("id", ids);
      const byId = new Map(
        ((rows ?? []) as { id: string }[]).map((row) => [row.id, row]),
      );
      for (const cardId of ids) {
        const row = byId.get(cardId);
        if (!row) continue;
        const mapped = mapPublicCard(row as Parameters<typeof mapPublicCard>[0]);
        const title = mailDayOgTitle(mapped);
        if (title) {
          mailDayTitle = title;
          break;
        }
      }
    }
  }

  const preview = postLinkPreview({
    found: true,
    body: (data.content as string | null) ?? "",
    mailDayTitle,
    imageUrl: postPreviewImage({
      postImageUrl: (data.image_url as string | null) ?? null,
      cardImageUrl: cardImage,
      cardIsPublic,
    }),
  });
  // The caption under the image names the author and carries the post, so it doesn't repeat the image.
  const copy = postOgCopy({
    authorName: author.name,
    authorHandle: author.handle,
    body: mailDayTitle ? preview.description : ((data.content as string | null) ?? ""),
  });
  return copy ? { ...preview, ...copy } : preview;
});

type PostAuthor = { name: string | null; handle: string | null; avatarUrl: string | null };

async function postAuthor(supabase: SupabaseClient, userId: unknown): Promise<PostAuthor> {
  const id = typeof userId === "string" ? userId : "";
  if (!isUuid(id)) return { name: null, handle: null, avatarUrl: null };
  const profile = await supabase
    .from("profiles")
    .select("username, display_name, avatar_url")
    .eq("id", id)
    .maybeSingle();
  if (!profile.data) return { name: null, handle: null, avatarUrl: null };
  return {
    name: (profile.data.display_name as string | null) ?? null,
    handle: (profile.data.username as string | null) ?? null,
    avatarUrl: (profile.data.avatar_url as string | null) ?? null,
  };
}

/** Name and photo only. Price, notes, cert, and email columns stay off this select. */
const PRIVATE_CARD_SELECT =
  "player, year, year_label, set, set_name, grade, grader, parallel, condition_type, image_url, card_number, sport, is_public";

type SafeCardRow = Pick<
  CardRow,
  | "player"
  | "year"
  | "year_label"
  | "set"
  | "set_name"
  | "grade"
  | "grader"
  | "parallel"
  | "condition_type"
  | "image_url"
  | "card_number"
  | "sport"
> & { is_public?: boolean | null };

function mappedSafe(id: string, row: SafeCardRow) {
  return mapPublicCard({
    id,
    user_id: "owner",
    player: row.player ?? "",
    year: Number(row.year) || 0,
    set: row.set ?? "",
    grade: row.grade,
    parallel: row.parallel,
    estimated_value: 0,
    image_url: row.image_url,
    card_number: row.card_number,
    sport: row.sport,
    accent: "#7c5cff",
    year_label: row.year_label,
    set_name: row.set_name,
    grader: row.grader,
    condition_type: row.condition_type,
  });
}

async function publicPrice(
  cardId: string,
  row: Parameters<typeof knownPriceCard>[0],
): Promise<{ amount: string; sales: number }> {
  const value = await publicCardValue(cardId, row);
  const read = sharePriceRead(value);
  if (read.kind === "estimate") return { amount: read.text, sales: value?.nSales ?? 0 };
  if (read.kind === "last_sale" || read.kind === "range") return { amount: read.text, sales: 0 };
  return { amount: "", sales: 0 };
}

/** Card image. A private or deleted card is a generic Slabhold image: no name, photo, or price. */
export const loadCardShareImage = cache(async (id: string) => {
  if (!isUuid(id)) return cardShareImage({ found: false });
  const supabase = createAnonReader();
  if (supabase) {
    const { data, error } = await supabase
      .from("public_cards")
      .select(PUBLIC_CARD_SELECT)
      .eq("id", id)
      .maybeSingle();
    if (!error && data) {
      const mapped = mapPublicCard(data);
      const [price, owner] = await Promise.all([
        publicPrice(mapped.id, data),
        postAuthor(supabase, mapped.ownerId),
      ]);
      return cardShareImage({
        found: true,
        isPublic: true,
        pricePublic: Boolean(price.amount),
        player: mapped.playerName,
        year: mapped.year,
        yearLabel: mapped.yearLabel,
        setBrand: mapped.setBrand,
        grade: mapped.grade,
        imageUrl: mapped.photoDataUrl,
        valueAmount: price.amount,
        salesCount: price.sales,
        parallel: mapped.parallel,
        grader: mapped.grader,
        conditionType: mapped.conditionType,
        ownerHandle: owner.handle,
      });
    }
  }

  const admin = createSupabaseAdmin();
  if (!admin) return cardShareImage({ found: false });
  const { data, error } = await admin
    .from("cards")
    .select(PRIVATE_CARD_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return cardShareImage({ found: false });
  const row = data as SafeCardRow;
  if (!row.is_public) return cardShareImage({ found: false });
  const mapped = mappedSafe(id, row);
  const price = await publicPrice(id, { ...row, id });
  return cardShareImage({
    found: true,
    isPublic: true,
    pricePublic: Boolean(price.amount),
    player: mapped.playerName,
    year: mapped.year,
    yearLabel: mapped.yearLabel,
    setBrand: mapped.setBrand,
    grade: mapped.grade,
    imageUrl: mapped.photoDataUrl,
    valueAmount: price.amount,
    salesCount: price.sales,
    parallel: mapped.parallel,
    grader: mapped.grader,
    conditionType: mapped.conditionType,
  });
});

/** The post's own extra photos (meta.images). */
function metaImages(meta: unknown): string[] {
  if (!meta || typeof meta !== "object") return [];
  const images = (meta as { images?: unknown }).images;
  return Array.isArray(images) ? images.filter((url): url is string => typeof url === "string").slice(0, 3) : [];
}

/**
 * Photos saved on the post's card snapshot, by card id. Only read for cards
 * already confirmed public, as a fallback when the card row has no photo.
 */
function snapshotPhotos(card: unknown, meta: unknown): Map<string, string> {
  const found = new Map<string, string>();
  const take = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    const { id, photoDataUrl } = value as { id?: unknown; photoDataUrl?: unknown };
    if (typeof id === "string" && typeof photoDataUrl === "string" && !found.has(id)) found.set(id, photoDataUrl);
  };
  take(card);
  if (meta && typeof meta === "object") {
    const cards = (meta as { cards?: unknown }).cards;
    if (Array.isArray(cards)) cards.forEach(take);
  }
  return found;
}

function linkedCardIds(card: unknown, meta: unknown): string[] {
  const ids: string[] = [];
  const push = (value: unknown) => {
    if (typeof value !== "string" || !isUuid(value) || ids.includes(value)) return;
    ids.push(value);
  };
  if (card && typeof card === "object") push((card as { id?: unknown }).id);
  if (meta && typeof meta === "object") {
    const cards = (meta as { cards?: unknown }).cards;
    if (Array.isArray(cards)) {
      for (const item of cards) {
        if (item && typeof item === "object") push((item as { id?: unknown }).id);
      }
    }
  }
  return ids.slice(0, 3);
}

/** Post image. Card name and Slabhold value are included only when that card is public. */
export const loadPostShareImage = cache(async (id: string) => {
  const supabase = createAnonReader();
  if (!supabase || !isUuid(id)) return postShareImage({ found: false });

  const { data, error } = await supabase
    .from("posts")
    .select("content, image_url, card, user_id, post_type, meta")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return postShareImage({ found: false });

  const author = await postAuthor(supabase, data.user_id);

  const cardIds = linkedCardIds(data.card, data.meta);
  const cards: NonNullable<Parameters<typeof postShareImage>[0]["cards"]>[number][] = [];
  const snapshots = snapshotPhotos(data.card, data.meta);
  if (cardIds.length) {
    const { data: rows } = await supabase
      .from("public_cards")
      .select(PUBLIC_CARD_SELECT)
      .in("id", cardIds);
    const byId = new Map(
      ((rows ?? []) as { id: string }[]).map((row) => [row.id, row]),
    );
    const publicIds = [...byId.keys()];
    const storedValues = publicIds.length ? await getCardValues(publicIds) : new Map();
    const known = ((rows ?? []) as Parameters<typeof knownPriceCard>[0][]).flatMap((row) => {
      const card = knownPriceCard(row);
      return card ? [card] : [];
    });
    const values = publicIds.length
      ? await attachPriceContext(publicIds, storedValues, null, known)
      : storedValues;
    for (const cardId of cardIds) {
      const row = byId.get(cardId);
      if (!row) {
        cards.push({ isPublic: false, name: "", valueLabel: null, imageUrl: null });
        continue;
      }
      const mapped = mapPublicCard(row as Parameters<typeof mapPublicCard>[0]);
      cards.push({
        isPublic: true,
        name: wantLabel(mapped) || mapped.playerName,
        valueLabel: sharePriceText(values.get(cardId) ?? null, mapped.createdAt),
        imageUrl: mapped.photoDataUrl,
        snapshotImageUrl: snapshots.get(cardId) ?? null,
        player: mapped.playerName,
        year: mapped.year,
        yearLabel: mapped.yearLabel,
        setBrand: mapped.setBrand,
        parallel: mapped.parallel,
        grade: mapped.grade,
        grader: mapped.grader,
        conditionType: mapped.conditionType,
      });
    }
  }

  const postType = data.post_type === "mail_day" ? "mail_day" : "post";
  const imageUrl = (data.image_url as string | null) ?? null;
  return postShareImage({
    found: true,
    body: (data.content as string | null) ?? "",
    authorName: author.name,
    authorHandle: author.handle,
    avatarUrl: author.avatarUrl,
    imageUrl,
    postPhotos: postType === "mail_day" ? [] : metaImages(data.meta),
    postType,
    mailDayPhotos: postType === "mail_day" ? mailDayPhotoUrls(data.meta, imageUrl) : [],
    cards,
  });
});

const PROFILE_CARD_PHOTOS = 6;

/**
 * Profile image: avatar, name, handle, public card count, up to 3 public
 * card photos, and pinned badges only when show_badges is on.
 */
export const loadProfileShareImage = cache(async (username: string): Promise<ShareImage> => {
  const generic = profileShareImage(profileLinkPreview({ found: false }), "COLLECTOR");
  const supabase = createAnonReader();
  const normalized = normalizeUsername(username);
  if (!supabase || !normalized) return generic;

  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url, show_badges")
    .eq("username", normalized)
    .maybeSingle();
  if (error || !data) return generic;
  const userId = data.id as string;

  const [count, cardRows, badgeRows, pinned] = await Promise.all([
    publicCardCount(userId),
    supabase
      .from("public_cards")
      .select(PUBLIC_CARD_SELECT)
      .eq("user_id", userId)
      .not("image_url", "is", null)
      .order("created_at", { ascending: false })
      .limit(PROFILE_CARD_PHOTOS),
    data.show_badges === false
      ? Promise.resolve({ data: [] as unknown[] })
      : supabase.from("user_badges").select("category, tier").eq("user_id", userId),
    data.show_badges === false ? Promise.resolve([] as string[]) : readVisiblePins(supabase, userId),
  ]);

  const earned: ShareBadge[] = ((badgeRows.data ?? []) as { category?: unknown; tier?: unknown }[]).flatMap((row) =>
    isBadgeCategory(row.category) && isBadgeTier(row.tier) ? [{ category: row.category, tier: row.tier }] : [],
  );
  const badges = data.show_badges === false ? [] : profilePins(pinned, earned);

  const cards = ((cardRows.data ?? []) as Parameters<typeof mapPublicCard>[0][]).map((row) => {
    const card = mapPublicCard(row);
    return {
      imageUrl: card.photoDataUrl,
      player: card.playerName,
      year: card.year,
      yearLabel: card.yearLabel,
      setBrand: card.setBrand,
      parallel: card.parallel,
      grade: card.grade,
      grader: card.grader,
      conditionType: card.conditionType,
    };
  });

  return profileShareImage(
    profileLinkPreview({
      found: true,
      username: data.username as string,
      displayName: data.display_name as string,
      avatarUrl: (data.avatar_url as string | null) ?? null,
      publicCardCount: count,
    }),
    "COLLECTOR",
    { username: data.username as string, badges, cards },
  );
});

/**
 * One earned badge on a public profile, read with the anon client so RLS
 * also hides badges when show_badges is off. Null means 404.
 */
export const loadBadgeShare = cache(
  async (username: string, category: string, tier: string): Promise<BadgeShareView | null> => {
    const supabase = createAnonReader();
    const normalized = normalizeUsername(username);
    if (!supabase || !normalized || !isBadgeCategory(category) || !isBadgeTier(tier)) return null;
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url, show_badges")
      .eq("username", normalized)
      .maybeSingle();
    if (error || !profile) return null;
    if (profile.show_badges === false) return null;
    const { data: rows, error: badgeError } = await supabase
      .from("user_badges")
      .select("category, tier, earned_at")
      .eq("user_id", profile.id as string)
      .eq("category", category)
      .eq("tier", tier);
    if (badgeError) return null;
    return badgeShareView({
      profile: {
        username: (profile.username as string) ?? "",
        displayName: (profile.display_name as string | null) ?? "",
        avatarUrl: (profile.avatar_url as string | null) ?? null,
        showBadges: profile.show_badges !== false,
      },
      earned: ((rows ?? []) as { category?: unknown; tier?: unknown; earned_at?: unknown }[]).map((row) => ({
        category: String(row.category ?? ""),
        tier: String(row.tier ?? ""),
        earnedAt: String(row.earned_at ?? ""),
      })),
      category,
      tier,
    });
  },
);

export { earnedOnLabel };
