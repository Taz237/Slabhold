import "server-only";

import { mapCardRow } from "@/lib/social/cards";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import type { SoldCompCard } from "./types";

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

/** Load card details from the DB by id. Never trust client-supplied fields. */
export async function loadSoldCompCard(
  cardId: string,
): Promise<SoldCompCard | null> {
  const client = createSupabaseAdmin();
  if (!client || !cardId) return null;

  const { data, error } = await client
    .from("cards")
    .select("*")
    .eq("id", cardId)
    .maybeSingle();

  if (error || !data) return null;

  const card = mapCardRow(data as CardRow);
  return {
    id: card.id,
    playerName: card.playerName,
    year: card.year,
    setBrand: card.setBrand,
    cardNumber: card.cardNumber || undefined,
    grade: card.grade || undefined,
    parallel: card.parallel || undefined,
    estimatedSellPrice: card.estimatedSellPrice || undefined,
  };
}
