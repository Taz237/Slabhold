import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays } from "@/lib/chart/range";
import { snapshotDateInNewYork } from "@/lib/collection/totals-shared";
import { CARD_VALUE_HISTORY_TABLE, numericFromUnknown } from "@/lib/collection/card-value-history";
import type { SnapshotRow } from "@/lib/collection/value-series";
import type { SavedCardDay } from "@/lib/collection/performance";

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

/** Card ids per request, so the URL stays short. */
const SNAPSHOT_ID_CHUNK = 150;
const SNAPSHOT_PAGE = 1000;
/** Pages per chunk at most: 40,000 card-days. */
const SNAPSHOT_MAX_PAGES = 40;

/** A column the select names is not there yet (same test as the snapshot writer's). */
function missingColumn(error: { code?: string | null; message?: string | null }): boolean {
  if (error.code === "42703" || error.code === "PGRST204") return true;
  const message = error.message ?? "";
  return /column/i.test(message) && /does not exist|schema cache/i.test(message);
}

type CardDayRow = { card_id: unknown; snapshot_date: unknown; median: unknown; held?: unknown };

/**
 * Saved daily per-card values (the same nightly write as the collection
 * total), for the market-only performance line. Only these cards. Null when
 * the read fails: the hero then shows the value line alone. Read-only.
 */
export async function readCardDaySnapshots(
  supabase: SupabaseClient,
  cardIds: readonly string[],
): Promise<SavedCardDay[] | null> {
  const ids = [...new Set(cardIds.filter(Boolean))].sort();
  const out: SavedCardDay[] = [];
  let withHeld = true;
  for (let index = 0; index < ids.length; index += SNAPSHOT_ID_CHUNK) {
    const chunk = ids.slice(index, index + SNAPSHOT_ID_CHUNK);
    for (let page = 0; page < SNAPSHOT_MAX_PAGES; page++) {
      const from = page * SNAPSHOT_PAGE;
      const query = (columns: string) =>
        supabase
          .from("card_value_snapshots")
          .select(columns)
          .in("card_id", chunk)
          .order("snapshot_date", { ascending: true })
          .order("card_id", { ascending: true })
          .range(from, from + SNAPSHOT_PAGE - 1);
      let result = await query(withHeld ? "card_id, snapshot_date, median, held" : "card_id, snapshot_date, median");
      if (result.error && withHeld && missingColumn(result.error)) {
        // The held column is not there yet: sold cards are dropped by their sale date instead.
        withHeld = false;
        result = await query("card_id, snapshot_date, median");
      }
      if (result.error || !result.data) return null;
      const rows = result.data as unknown as CardDayRow[];
      for (const row of rows) {
        const value = numericFromUnknown(row.median);
        if (value == null || typeof row.card_id !== "string" || !row.card_id) continue;
        out.push({
          cardId: row.card_id,
          date: String(row.snapshot_date),
          value,
          held: typeof row.held === "boolean" ? row.held : null,
        });
      }
      if (rows.length < SNAPSHOT_PAGE) break;
    }
  }
  return out;
}
