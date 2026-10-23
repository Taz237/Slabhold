import "server-only";

import { mapCardRow, type CardRow } from "@/lib/social/cards";
import { hasPaid, isSold } from "@/lib/format";
import { summarize } from "@/lib/portfolio";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import {
  cardSnapshotInsert,
  isMissingSnapshotColumn,
  medianOnlySnapshotInsert,
  snapshotSaleSource,
} from "@/lib/leaderboard/snapshot-fields";
import {
  rowsKeepingPriorIdentity,
  type SnapshotIdentityRow,
} from "@/lib/leaderboard/snapshot-keep";
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
 * Service-role write only. Writes today's date only, so past snapshot dates stay frozen.
 * If the leaderboard columns are not applied yet, the median is still saved.
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
    const value = loaded.values.get(card.id);
    return cardSnapshotInsert({
      cardId: card.id,
      userId,
      snapshotDate,
      playerName: card.playerName,
      year: card.year,
      yearLabel: card.yearLabel,
      setBrand: card.setBrand,
      parallel: card.parallel,
      grade: card.grade,
      cardNumber: card.cardNumber,
      serialRun: card.serialRun,
      isAuto: card.isAuto,
      isRelic: card.isRelic,
      gradeQualifier: card.gradeQualifier,
      conditionType: card.conditionType,
      isPublic: card.isPublic === true,
      held: !isSold(card),
      value,
      saleSource: snapshotSaleSource(value),
    });
  });
  let rowsToWrite = cardRows;
  if (cardRows.length > 0) {
    const prior = await loaded.admin
      .from("card_value_snapshots")
      .select(
        "card_key, player, year, year_label, set_name, parallel, grade, grader, card_number, serial_run, is_auto, is_relic, grade_qualifier, condition_type, query_key",
      )
      .eq("user_id", userId)
      .eq("snapshot_date", snapshotDate);
    if (prior.error && !isMissingSnapshotColumn(prior.error)) {
      throw new Error(prior.error.message);
    }
    if (!prior.error) {
      rowsToWrite = rowsKeepingPriorIdentity(
        (prior.data ?? []) as SnapshotIdentityRow[],
        cardRows,
      );
    }
  }
  if (rowsToWrite.length > 0) {
    const full = await loaded.admin
      .from("card_value_snapshots")
      .upsert(rowsToWrite, { onConflict: "card_key,snapshot_date" });
    if (full.error && isMissingSnapshotColumn(full.error)) {
      const fallback = await loaded.admin.from("card_value_snapshots").upsert(
        rowsToWrite.map((row) => medianOnlySnapshotInsert(row)),
        { onConflict: "card_id,snapshot_date" },
      );
      if (fallback.error) throw new Error(fallback.error.message);
    } else if (full.error) {
      throw new Error(full.error.message);
    }
  }

  return totals;
}
