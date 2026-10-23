import "server-only";

import { mapCardRow, type CardRow } from "@/lib/social/cards";
import { hasPaid } from "@/lib/format";
import { summarize } from "@/lib/portfolio";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { cardValueSnapshotFields } from "@/lib/leaderboard/snapshot-fields";
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
async function loadUserCollection(userId: string) {
  const admin = createSupabaseAdmin();
  if (!admin || !userId) return null;

  const { data, error } = await admin
    .from("cards")
    .select("*")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);

  const cards = ((data ?? []) as CardRow[]).map(mapCardRow);
  const values = await getCardValues(cards.map((card) => card.id));
  return { admin, cards, values };
}

export async function computeCollectionTotals(
  userId: string,
): Promise<CollectionTotals> {
  if (!userId) return { value: 0, invested: 0, profit: 0 };
  const loaded = await loadUserCollection(userId);
  if (!loaded) return { value: 0, invested: 0, profit: 0 };
  return collectionTotalsFromSummarize(summarize(loaded.cards, loaded.values));
}

/**
 * Upsert today's snapshot for a user (America/New_York date).
 * Service-role write only.
 */
export async function upsertTodaysCollectionSnapshot(
  userId: string,
): Promise<CollectionTotals | null> {
  if (!userId) return null;
  const loaded = await loadUserCollection(userId);
  if (!loaded) return null;

  const totals = collectionTotalsFromSummarize(
    summarize(loaded.cards, loaded.values),
  );
  const snapshotDate = snapshotDateInNewYork();

  const { error } = await loaded.admin.from("collection_snapshots").upsert(
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

  const cardRows = loaded.cards.map((card) => {
    const fields = cardValueSnapshotFields(loaded.values.get(card.id));
    return {
      card_id: card.id,
      snapshot_date: snapshotDate,
      median: fields.median,
      n_sales: fields.n_sales,
      self_reported: fields.self_reported,
    };
  });
  if (cardRows.length > 0) {
    const { error: cardError } = await loaded.admin
      .from("card_value_snapshots")
      .upsert(cardRows, { onConflict: "card_id,snapshot_date" });
    if (cardError) throw new Error(cardError.message);
  }

  return totals;
}
