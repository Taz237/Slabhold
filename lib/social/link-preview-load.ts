import "server-only";

import { cache } from "react";
import { readLatestSoldCompsBatch } from "@/lib/comps/cache";
import { loadSoldCompCard } from "@/lib/comps/load-card";
import type { MatchCard } from "@/lib/comps/match";
import { previewValueLabelFromSources } from "@/lib/comps/preview-value";
import { buildQueryKey } from "@/lib/comps/query-key";
import type { SoldCompCard } from "@/lib/comps/types";
import { wantLabel } from "@/lib/wants/label";
import { formatCardValueLabel } from "@/lib/value/format";
import { getCardValue } from "@/lib/value/getCardValue";
import { isUuid } from "@/lib/value/card-value-access";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { mapPublicCard, PUBLIC_CARD_SELECT } from "./cards";
import {
  cardLinkPreview,
  postLinkPreview,
  postPreviewImage,
  profileLinkPreview,
  type LinkPreview,
} from "./link-preview";
import { normalizeUsername } from "./local-db";
import { createSupabaseServer, getAuthUserId } from "@/lib/supabase/server";

async function publicCardCount(
  userId: string,
): Promise<number | null> {
  const supabase = await createSupabaseServer();
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
  const supabase = await createSupabaseServer();
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
    valueLabel: await previewValueLabel(card.id, card.ownerId, card.createdAt),
  });
});

function matchCardOf(card: SoldCompCard): MatchCard {
  return {
    playerName: card.playerName,
    year: card.year,
    yearLabel: card.yearLabel,
    setBrand: card.setBrand,
    cardNumber: card.cardNumber,
    noNumber: card.noNumber,
    parallel: card.parallel,
    serialRun: card.serialRun,
    isAuto: card.isAuto,
    isRelic: card.isRelic,
    conditionType: card.conditionType,
    grade: card.grade,
    gradeQualifier: card.gradeQualifier,
  };
}

/** Owner "Not a match" flags — same exclusions as the card page comps list. */
async function loadOwnerCompFlagIds(
  cardId: string,
  ownerId: string,
): Promise<Set<string>> {
  const client = createSupabaseAdmin();
  if (!client || !cardId || !ownerId) return new Set();
  const { data, error } = await client
    .from("comp_flags")
    .select("item_id")
    .eq("card_id", cardId)
    .eq("user_id", ownerId);
  if (error || !data) return new Set();
  return new Set(
    data
      .map((row) => row.item_id as string)
      .filter((itemId) => Boolean(itemId)),
  );
}

/**
 * Same comps source and freshness as the card page (query key + 6h window).
 * No Trawl call. Stale / other-key batches fall back to card_values.
 */
async function previewValueLabel(
  cardId: string,
  ownerId: string,
  createdAt: string | undefined,
): Promise<string> {
  const stored = await getCardValue(cardId);
  const full = await loadSoldCompCard(cardId);
  if (!full) return formatCardValueLabel(stored, { createdAt });

  const expectedQueryKey = buildQueryKey(full);
  const latest = await readLatestSoldCompsBatch(expectedQueryKey);
  const hiddenItemIds = await loadOwnerCompFlagIds(cardId, ownerId);
  return previewValueLabelFromSources({
    card: matchCardOf(full),
    expectedQueryKey,
    batch: latest
      ? {
          queryKey: expectedQueryKey,
          sales: latest.sales,
          fetchedAt: latest.fetchedAt,
        }
      : null,
    hiddenItemIds,
    stored,
    createdAt,
  });
}

export const loadProfilePreview = cache(async (username: string): Promise<LinkPreview> => {
  const supabase = await createSupabaseServer();
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
  const supabase = await createSupabaseServer();
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
