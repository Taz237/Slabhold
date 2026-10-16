import "server-only";

import { mapCardRow, type CardRow } from "@/lib/social/cards";
import { hasPaid } from "@/lib/format";
import { summarize } from "@/lib/portfolio";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getCardValues } from "@/lib/value/getCardValue";
import {
  collectionTotalsFromSummarize,
  snapshotDateInNewYork,
  type CollectionTotals,
} from "./totals-shared";

export type { CollectionTotals };
export {
  collectionTotalsFromSummarize,
  snapshotDateInNewYork,
} from "./totals-shared";
export { hasPaid };

/**
 * Reuses Collection summary math (summarize + cached card_values).
 * Never calls Trawl.
 */
export async function computeCollectionTotals(
  userId: string,
): Promise<CollectionTotals> {
  if (!userId) return { value: 0, invested: 0, profit: 0 };

  const admin = createSupabaseAdmin();
  if (!admin) return { value: 0, invested: 0, profit: 0 };

  const { data, error } = await admin
    .from("cards")
    .select("*")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);

  const cards = ((data ?? []) as CardRow[]).map(mapCardRow);
  const values = await getCardValues(cards.map((card) => card.id));
  return collectionTotalsFromSummarize(summarize(cards, values));
}

/**
 * Upsert today's snapshot for a user (America/New_York date).
 * Service-role write only.
 */
export async function upsertTodaysCollectionSnapshot(
  userId: string,
): Promise<CollectionTotals | null> {
  if (!userId) return null;
  const admin = createSupabaseAdmin();
  if (!admin) return null;

  const totals = await computeCollectionTotals(userId);
  const snapshotDate = snapshotDateInNewYork();

  const { error } = await admin.from("collection_snapshots").upsert(
    {
      user_id: userId,
      snapshot_date: snapshotDate,
      value: totals.value,
      invested: totals.invested,
      profit: totals.profit,
    },
    { onConflict: "user_id,snapshot_date" },
  );
  if (error) throw new Error(error.message);
  return totals;
}
