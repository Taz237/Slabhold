import type { SupabaseClient } from "@supabase/supabase-js";
import { cardCategory, rememberCategory } from "@/lib/card-category";
import { uploadMedia } from "@/lib/supabase/media";
import type { SportsCard } from "@/lib/types";
import type { OwnedCard } from "./types";

type CardRow = {
  id: string;
  user_id: string;
  player: string;
  year: number;
  set: string;
  grade: string | null;
  parallel: string | null;
  paid_price: number | null;
  estimated_value: number | null;
  image_url: string | null;
  card_number: string | null;
  sport: string | null;
  purchase_date: string | null;
  sell_price: number | null;
  sell_date: string | null;
  notes: string | null;
  accent: string | null;
  is_public: boolean | null;
  category?: string | null;
  created_at: string;
  updated_at: string | null;
};

function dateOnly(value: string | null, fallback: string) {
  if (!value) return fallback.slice(0, 10);
  return value.slice(0, 10);
}

export function mapCardRow(row: CardRow): SportsCard {
  return {
    id: row.id,
    playerName: row.player,
    year: row.year,
    setBrand: row.set,
    cardNumber: row.card_number ?? "",
    grade: row.grade ?? "",
    parallel: row.parallel ?? "",
    sport: row.sport ?? "Basketball",
    purchasePrice: Number(row.paid_price) || 0,
    purchaseDate: dateOnly(row.purchase_date, row.created_at),
    estimatedSellPrice: Number(row.estimated_value) || 0,
    sellPrice: row.sell_price == null ? null : Number(row.sell_price),
    sellDate: row.sell_date,
    notes: row.notes ?? "",
    photoDataUrl: row.image_url,
    accent: row.accent ?? "#7c5cff",
    category: row.category === "pc" || row.category === "flipping" ? row.category : undefined,
    isPublic: Boolean(row.is_public),
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? row.created_at,
  };
}

export function mapPublicCard(row: CardRow): OwnedCard {
  const card = mapCardRow(row);
  return {
    ownerId: row.user_id,
    id: card.id,
    playerName: card.playerName,
    year: card.year,
    setBrand: card.setBrand,
    cardNumber: card.cardNumber,
    sport: card.sport,
    photoDataUrl: card.photoDataUrl,
    accent: card.accent,
    estimatedSellPrice: card.estimatedSellPrice,
    grade: card.grade,
    parallel: card.parallel,
    purchasePrice: row.paid_price == null ? null : Number(row.paid_price),
  };
}

export async function loadUserCards(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from("cards")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as CardRow[]).map(mapCardRow);
}

function missingCategoryColumn(error: { code?: string; message?: string }) {
  const message = error.message ?? "";
  return (
    /category/i.test(message) &&
    (error.code === "PGRST204" || error.code === "42703" || /schema cache|column/i.test(message))
  );
}

export async function saveUserCard(supabase: SupabaseClient, userId: string, card: SportsCard) {
  const uploaded = await uploadMedia(supabase, "card-photos", userId, card.photoDataUrl);
  if (uploaded.error) throw new Error(uploaded.error);
  const category = cardCategory(card);
  rememberCategory(card.id, category);
  const payload = {
    id: card.id,
    user_id: userId,
    player: card.playerName,
    year: card.year,
    set: card.setBrand,
    grade: card.grade,
    parallel: card.parallel,
    paid_price: card.purchasePrice,
    estimated_value: card.estimatedSellPrice,
    image_url: uploaded.url,
    card_number: card.cardNumber,
    sport: card.sport,
    purchase_date: card.purchaseDate || null,
    sell_price: card.sellPrice,
    sell_date: card.sellDate,
    notes: card.notes,
    accent: card.accent,
    is_public: Boolean(card.isPublic),
    created_at: card.createdAt,
    updated_at: card.updatedAt,
  };
  const withCategory = await supabase.from("cards").upsert({ ...payload, category });
  if (!withCategory.error) return;
  if (!missingCategoryColumn(withCategory.error)) throw new Error(withCategory.error.message);
  const { error } = await supabase.from("cards").upsert(payload);
  if (error) throw new Error(error.message);
}

export async function removeUserCard(supabase: SupabaseClient, userId: string, cardId: string) {
  const { error } = await supabase.from("cards").delete().eq("id", cardId).eq("user_id", userId);
  if (error) throw new Error(error.message);
}
