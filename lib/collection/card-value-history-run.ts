import "server-only";

import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { snapshotDateInNewYork } from "@/lib/collection/totals-shared";
import { addCalendarDays } from "@/lib/moving-today/rank";
import {
  buildCardValueHistoryRows,
  cardValueHistoryEnabled,
  CARD_VALUE_HISTORY_TABLE,
  isMissingRelation,
  numericFromUnknown,
  runCardValueHistoryCron,
  type CardValueHistoryCronResult,
} from "./card-value-history";

const CARD_PAGE = 1000;
const USER_BATCH = 20;
const ID_CHUNK = 200;

type Admin = NonNullable<ReturnType<typeof createSupabaseAdmin>>;

function chunks<T>(items: T[], size: number): T[][] {
  const groups: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    groups.push(items.slice(index, index + size));
  }
  return groups;
}

async function listOwnedCards(admin: Admin): Promise<{ id: string; userId: string }[]> {
  const cards: { id: string; userId: string }[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await admin
      .from("cards")
      .select("id, user_id")
      .range(from, from + CARD_PAGE - 1);
    if (error) throw new Error(error.message);
    const page = data ?? [];
    for (const row of page) {
      const id = typeof row.id === "string" ? row.id : "";
      const userId = typeof row.user_id === "string" ? row.user_id : "";
      if (id && userId) cards.push({ id, userId });
    }
    if (page.length < CARD_PAGE) break;
    from += CARD_PAGE;
  }
  return cards;
}

async function mediansFor(
  admin: Admin,
  cardIds: string[],
): Promise<{ cardId: string; median: number | null }[]> {
  const found = new Map<string, number | null>();
  for (const id of cardIds) found.set(id, null);
  for (const group of chunks(cardIds, ID_CHUNK)) {
    const { data, error } = await admin
      .from("card_values")
      .select("card_id, median")
      .in("card_id", group);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      const cardId = typeof row.card_id === "string" ? row.card_id : "";
      if (!cardId || !found.has(cardId)) continue;
      found.set(cardId, numericFromUnknown(row.median));
    }
  }
  return [...found.entries()].map(([cardId, median]) => ({ cardId, median }));
}

async function previousFor(
  admin: Admin,
  userId: string,
  previousDate: string,
): Promise<{ cardId: string; median: number | null }[]> {
  const { data, error } = await admin
    .from(CARD_VALUE_HISTORY_TABLE)
    .select("card_id, median")
    .eq("user_id", userId)
    .eq("snapshot_date", previousDate);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    cardId: typeof row.card_id === "string" ? row.card_id : "",
    median: numericFromUnknown(row.median),
  })).filter((row) => row.cardId);
}

async function writeUser(
  admin: Admin,
  userId: string,
  cardIds: string[],
  snapshotDate: string,
  previousDate: string,
): Promise<number> {
  const [current, previous] = await Promise.all([
    mediansFor(admin, cardIds),
    previousFor(admin, userId, previousDate),
  ]);
  const rows = buildCardValueHistoryRows({
    userId,
    snapshotDate,
    current,
    previous,
  });
  if (rows.length === 0) return 0;
  for (const group of chunks(rows, ID_CHUNK)) {
    const { error } = await admin
      .from(CARD_VALUE_HISTORY_TABLE)
      .upsert(group, { onConflict: "card_id,snapshot_date" });
    if (error) throw new Error(error.message);
  }
  return rows.length;
}

/** Reads cached card_values only. */
export async function writeCardValueHistory(now: Date = new Date()): Promise<number> {
  const admin = createSupabaseAdmin();
  if (!admin) return 0;
  const snapshotDate = snapshotDateInNewYork(now);
  const previousDate = addCalendarDays(snapshotDate, -1);
  const cards = await listOwnedCards(admin);
  const byUser = new Map<string, string[]>();
  for (const card of cards) {
    const list = byUser.get(card.userId) ?? [];
    list.push(card.id);
    byUser.set(card.userId, list);
  }
  let written = 0;
  const users = [...byUser.entries()];
  for (let index = 0; index < users.length; index += USER_BATCH) {
    const batch = users.slice(index, index + USER_BATCH);
    const counts = await Promise.all(
      batch.map(([userId, cardIds]) =>
        writeUser(admin, userId, cardIds, snapshotDate, previousDate),
      ),
    );
    written += counts.reduce((sum, count) => sum + count, 0);
  }
  return written;
}

export async function cardValueHistoryTableExists(): Promise<boolean> {
  const admin = createSupabaseAdmin();
  if (!admin) return false;
  const { error } = await admin.from(CARD_VALUE_HISTORY_TABLE).select("card_id").limit(1);
  if (!error) return true;
  if (isMissingRelation(error)) return false;
  throw new Error(error.message);
}

export function runCardValueHistory(): Promise<CardValueHistoryCronResult> {
  return runCardValueHistoryCron({
    enabled: () => cardValueHistoryEnabled(),
    tableExists: cardValueHistoryTableExists,
    write: () => writeCardValueHistory(),
  });
}
