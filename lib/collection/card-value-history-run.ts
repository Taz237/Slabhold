import "server-only";

import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { snapshotDateInNewYork } from "@/lib/collection/totals-shared";
import { addCalendarDays } from "@/lib/moving-today/rank";
import {
  buildCardValueHistoryRows,
  cardValueHistoryEnabled,
  CARD_VALUE_HISTORY_RUN_CAP,
  CARD_VALUE_HISTORY_TABLE,
  historyRetentionCutoff,
  isFreshMatchedCardValue,
  isMissingRelation,
  numericFromUnknown,
  rotateCardValueHistoryBatch,
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

async function writtenCardIds(admin: Admin, snapshotDate: string): Promise<Set<string>> {
  const ids = new Set<string>();
  let from = 0;
  for (;;) {
    const { data, error } = await admin
      .from(CARD_VALUE_HISTORY_TABLE)
      .select("card_id")
      .eq("snapshot_date", snapshotDate)
      .order("card_id", { ascending: true })
      .range(from, from + CARD_PAGE - 1);
    if (error) throw new Error(error.message);
    const page = data ?? [];
    for (const row of page) {
      if (typeof row.card_id === "string" && row.card_id) ids.add(row.card_id);
    }
    if (page.length < CARD_PAGE) break;
    from += CARD_PAGE;
  }
  return ids;
}

async function largestWrittenCardId(admin: Admin, snapshotDate: string): Promise<string | null> {
  const { data, error } = await admin
    .from(CARD_VALUE_HISTORY_TABLE)
    .select("card_id")
    .eq("snapshot_date", snapshotDate)
    .order("card_id", { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  const cardId = data?.[0]?.card_id;
  return typeof cardId === "string" && cardId ? cardId : null;
}

async function queryFreshValues(
  admin: Admin,
  input: {
    afterCardId: string | null;
    beforeInclusive: string | null;
    limit: number;
    skip: ReadonlySet<string>;
  },
): Promise<{ cardId: string; median: number }[]> {
  const values: { cardId: string; median: number }[] = [];
  if (input.limit <= 0) return values;
  let from = 0;
  while (values.length < input.limit) {
    let query = admin
      .from("card_values")
      .select("card_id, median, status")
      .eq("status", "ok")
      .order("card_id", { ascending: true });
    if (input.afterCardId) query = query.gt("card_id", input.afterCardId);
    if (input.beforeInclusive) query = query.lte("card_id", input.beforeInclusive);
    const { data, error } = await query.range(from, from + CARD_PAGE - 1);
    if (error) throw new Error(error.message);
    const page = data ?? [];
    for (const row of page) {
      if (!isFreshMatchedCardValue(row)) continue;
      const cardId = typeof row.card_id === "string" ? row.card_id : "";
      const median = numericFromUnknown(row.median);
      if (!cardId || median == null || input.skip.has(cardId)) continue;
      values.push({ cardId, median });
      if (values.length >= input.limit) break;
    }
    if (page.length < CARD_PAGE) break;
    from += CARD_PAGE;
  }
  return values;
}

async function listFreshValues(
  admin: Admin,
  snapshotDate: string,
  previousDate: string,
): Promise<{ cardId: string; median: number }[]> {
  const writtenToday = await writtenCardIds(admin, snapshotDate);
  let afterCardId: string | null = null;
  for (const id of writtenToday) {
    if (afterCardId == null || id > afterCardId) afterCardId = id;
  }
  if (!afterCardId) afterCardId = await largestWrittenCardId(admin, previousDate);
  const after = await queryFreshValues(admin, {
    afterCardId,
    beforeInclusive: null,
    limit: CARD_VALUE_HISTORY_RUN_CAP,
    skip: writtenToday,
  });
  const wrap =
    afterCardId && after.length < CARD_VALUE_HISTORY_RUN_CAP
      ? await queryFreshValues(admin, {
          afterCardId: null,
          beforeInclusive: afterCardId,
          limit: CARD_VALUE_HISTORY_RUN_CAP - after.length,
          skip: writtenToday,
        })
      : [];
  return rotateCardValueHistoryBatch([...after, ...wrap], {
    cap: CARD_VALUE_HISTORY_RUN_CAP,
    alreadyWrittenIds: [...writtenToday],
    afterCardId,
  });
}

async function ownersFor(admin: Admin, cardIds: string[]): Promise<Map<string, string>> {
  const owners = new Map<string, string>();
  for (const group of chunks(cardIds, ID_CHUNK)) {
    const { data, error } = await admin.from("cards").select("id, user_id").in("id", group);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      const id = typeof row.id === "string" ? row.id : "";
      const userId = typeof row.user_id === "string" ? row.user_id : "";
      if (id && userId) owners.set(id, userId);
    }
  }
  return owners;
}

async function mediansFor(
  admin: Admin,
  cardIds: string[],
  known: Map<string, number>,
): Promise<{ cardId: string; median: number | null }[]> {
  const found = new Map<string, number | null>();
  for (const id of cardIds) found.set(id, known.get(id) ?? null);
  for (const group of chunks(cardIds, ID_CHUNK)) {
    const { data, error } = await admin
      .from("card_values")
      .select("card_id, median, status")
      .in("card_id", group);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      const cardId = typeof row.card_id === "string" ? row.card_id : "";
      if (!cardId || !found.has(cardId)) continue;
      if (!isFreshMatchedCardValue(row)) {
        found.set(cardId, null);
        continue;
      }
      found.set(cardId, numericFromUnknown(row.median));
    }
  }
  return [...found.entries()]
    .filter((entry): entry is [string, number] => entry[1] != null)
    .map(([cardId, median]) => ({ cardId, median }));
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
  knownMedians: Map<string, number>,
  snapshotDate: string,
  previousDate: string,
): Promise<number> {
  const [current, previous] = await Promise.all([
    mediansFor(admin, cardIds, knownMedians),
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
  const fresh = await listFreshValues(admin, snapshotDate, previousDate);
  const owners = await ownersFor(
    admin,
    fresh.map((row) => row.cardId),
  );
  const knownMedians = new Map(fresh.map((row) => [row.cardId, row.median]));
  const byUser = new Map<string, string[]>();
  for (const row of fresh) {
    const userId = owners.get(row.cardId);
    if (!userId) continue;
    const list = byUser.get(userId) ?? [];
    list.push(row.cardId);
    byUser.set(userId, list);
  }
  let written = 0;
  const users = [...byUser.entries()];
  for (let index = 0; index < users.length; index += USER_BATCH) {
    const batch = users.slice(index, index + USER_BATCH);
    const counts = await Promise.all(
      batch.map(([userId, cardIds]) =>
        writeUser(admin, userId, cardIds, knownMedians, snapshotDate, previousDate),
      ),
    );
    written += counts.reduce((sum, count) => sum + count, 0);
  }
  const cutoff = historyRetentionCutoff(snapshotDate);
  const { error } = await admin
    .from(CARD_VALUE_HISTORY_TABLE)
    .delete()
    .lt("snapshot_date", cutoff);
  if (error) throw new Error(error.message);
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
