import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays } from "@/lib/chart/range";
import { snapshotDateInNewYork } from "@/lib/collection/totals-shared";
import { CARD_VALUE_HISTORY_TABLE, numericFromUnknown } from "@/lib/collection/card-value-history";
import type { SnapshotRow } from "@/lib/collection/value-series";

/** Days of per-card history read for Top movers. */
export const MOVER_HISTORY_DAYS = 30;

export type CardHistory = Map<string, { date: string; value: number }[]>;

/**
 * Saved daily collection values, oldest first. Own rows only (RLS). Empty
 * when the read fails. The browser hook and Collection's server render share it.
 */
export async function readCollectionSnapshots(supabase: SupabaseClient): Promise<SnapshotRow[]> {
  const { data, error } = await supabase
    .from("collection_snapshots")
    .select("snapshot_date, value")
    .order("snapshot_date", { ascending: true });
  if (error) return [];
  return (data ?? []).map((row) => ({
    snapshot_date: String(row.snapshot_date),
    value: Number(row.value) || 0,
  }));
}

/**
 * Daily per-card values for the last 30 days, for Top movers. Null when the
 * table is not there yet or the read fails: Top movers then uses the price paid.
 */
export async function readCardValueHistory(supabase: SupabaseClient): Promise<CardHistory | null> {
  const since = addDays(snapshotDateInNewYork(), -MOVER_HISTORY_DAYS);
  const { data, error } = await supabase
    .from(CARD_VALUE_HISTORY_TABLE)
    .select("card_id, snapshot_date, median")
    .gte("snapshot_date", since)
    .order("snapshot_date", { ascending: true })
    .limit(5000);
  if (error || !data) return null;
  const next: CardHistory = new Map();
  for (const row of data as { card_id: string; snapshot_date: string; median: unknown }[]) {
    const value = numericFromUnknown(row.median);
    if (value == null) continue;
    const list = next.get(row.card_id) ?? [];
    list.push({ date: String(row.snapshot_date), value });
    next.set(row.card_id, list);
  }
  return next;
}
