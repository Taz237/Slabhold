import "server-only";

import { mapCardRow } from "@/lib/social/cards";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import type { SoldCompCard } from "./types";

type CardRow = Parameters<typeof mapCardRow>[0];

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
    yearLabel: card.yearLabel,
    setBrand: card.setBrand,
    cardNumber: card.cardNumber || undefined,
    noNumber: card.noNumber,
    grade: card.grade || undefined,
    parallel: card.parallel || undefined,
    serialRun: card.serialRun,
    isAuto: card.isAuto,
    isRelic: card.isRelic,
    conditionType: card.conditionType,
    gradeQualifier: card.gradeQualifier || null,
    estimatedSellPrice: card.estimatedSellPrice || undefined,
    sport: card.sport || undefined,
  };
}
