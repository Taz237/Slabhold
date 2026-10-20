import "server-only";

import { cache } from "react";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "@/lib/supabase/client";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { wantLabel } from "@/lib/wants/label";
import { formatCardValueLabel, marketValueAmount } from "@/lib/value/format";
import { getCardValue, getCardValues } from "@/lib/value/getCardValue";
import { isUuid } from "@/lib/value/card-value-access";
import { mapPublicCard, PUBLIC_CARD_SELECT, type CardRow } from "./cards";
import {
  cardLinkPreview,
  postLinkPreview,
  postPreviewImage,
  profileLinkPreview,
  type LinkPreview,
} from "./link-preview";
import { normalizeUsername } from "./local-db";
import { cardShareImage, mailDayPhotoUrls, postShareImage } from "./share-image";
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

/** Logged-out readers only see public_cards, so a missing row stays generic. */
export const loadPublicCardPreview = cache(async (id: string): Promise<LinkPreview> => {
  const supabase = createAnonReader();
  if (!supabase || !isUuid(id)) return cardLinkPreview({ isPublic: false });

  const { data, error } = await supabase
    .from("public_cards")
    .select(PUBLIC_CARD_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return cardLinkPreview({ isPublic: false });

  const card = mapPublicCard(data);
  return cardLinkPreview({
    isPublic: true,
    name: wantLabel(card) || card.playerName,
    imageUrl: card.photoDataUrl,
    valueLabel: await previewValueLabel(card.id, card.createdAt),
  });
});

/** Share preview reads the persisted card_values row and nothing else. */
async function previewValueLabel(
  cardId: string,
  createdAt: string | undefined,
): Promise<string> {
  const stored = await getCardValue(cardId);
  return formatCardValueLabel(stored, { createdAt });
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
    .select("content, image_url, card")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return postLinkPreview({ found: false });

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

  return postLinkPreview({
    found: true,
    body: (data.content as string | null) ?? "",
    imageUrl: postPreviewImage({
      postImageUrl: (data.image_url as string | null) ?? null,
      cardImageUrl: cardImage,
      cardIsPublic,
    }),
  });
});

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

async function publicPrice(cardId: string): Promise<{ amount: string; sales: number }> {
  const stored = await getCardValue(cardId);
  const amount = marketValueAmount(stored) ?? "";
  return { amount, sales: amount && stored ? stored.nSales : 0 };
}

/** Card image. A private card keeps its photo and name, and never a value. */
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
      const price = await publicPrice(mapped.id);
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
  const mapped = mappedSafe(id, row);
  const isPublic = Boolean(row.is_public);
  const price = isPublic ? await publicPrice(id) : { amount: "", sales: 0 };
  return cardShareImage({
    found: true,
    isPublic,
    pricePublic: isPublic && Boolean(price.amount),
    player: mapped.playerName,
    year: mapped.year,
    yearLabel: mapped.yearLabel,
    setBrand: mapped.setBrand,
    grade: mapped.grade,
    imageUrl: mapped.photoDataUrl,
    valueAmount: isPublic ? price.amount : null,
    salesCount: isPublic ? price.sales : 0,
  });
});

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

  let authorName: string | null = null;
  let authorHandle: string | null = null;
  const userId = typeof data.user_id === "string" ? data.user_id : "";
  if (isUuid(userId)) {
    const profile = await supabase
      .from("profiles")
      .select("username, display_name")
      .eq("id", userId)
      .maybeSingle();
    if (profile.data) {
      authorName = (profile.data.display_name as string | null) ?? null;
      authorHandle = (profile.data.username as string | null) ?? null;
    }
  }

  const cardIds = linkedCardIds(data.card, data.meta);
  const cards: {
    isPublic: boolean;
    name: string;
    valueLabel: string | null;
    imageUrl: string | null;
  }[] = [];
  if (cardIds.length) {
    const { data: rows } = await supabase
      .from("public_cards")
      .select(PUBLIC_CARD_SELECT)
      .in("id", cardIds);
    const byId = new Map(
      ((rows ?? []) as { id: string }[]).map((row) => [row.id, row]),
    );
    const values = byId.size ? await getCardValues([...byId.keys()]) : new Map();
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
        valueLabel: marketValueAmount(values.get(cardId)),
        imageUrl: mapped.photoDataUrl,
      });
    }
  }

  const postType = data.post_type === "mail_day" ? "mail_day" : "post";
  const imageUrl = (data.image_url as string | null) ?? null;
  return postShareImage({
    found: true,
    body: (data.content as string | null) ?? "",
    authorName,
    authorHandle,
    imageUrl,
    postType,
    mailDayPhotos: postType === "mail_day" ? mailDayPhotoUrls(data.meta, imageUrl) : [],
    cards,
  });
});
