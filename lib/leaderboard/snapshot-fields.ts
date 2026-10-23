import type { CardValueResult } from "@/lib/value/types";
import { cardIdentity } from "./identity";
import { saleSourceIsSelfReported } from "./self-reported";

/**
 * Source stored on the snapshot. A self, owner, or reported sale wins over a
 * marketplace sale so the value board can flag that card.
 */
export function snapshotSaleSource(
  value: { sales?: readonly { source?: string | null }[] | null } | null | undefined,
): string | null {
  let fallback: string | null = null;
  for (const sale of value?.sales ?? []) {
    const source = sale.source?.trim();
    if (!source) continue;
    if (saleSourceIsSelfReported(source)) return source;
    if (!fallback) fallback = source;
  }
  return fallback;
}

/** Fields stored beside the median. A null sale count is not a trusted price. */
export function cardValueSnapshotFields(
  value: CardValueResult | null | undefined,
  saleSource?: string | null,
): { median: number | null; n_sales: number | null; self_reported: boolean } {
  const median =
    value && typeof value.median === "number" && Number.isFinite(value.median) ? value.median : null;
  const nSales =
    value && typeof value.nSales === "number" && Number.isFinite(value.nSales)
      ? Math.max(0, Math.round(value.nSales))
      : null;
  const source = saleSource === undefined ? snapshotSaleSource(value) : saleSource;
  return {
    median,
    n_sales: nSales,
    self_reported: saleSourceIsSelfReported(source),
  };
}

/** True when the snapshot upsert failed because a new column is not there yet. */
export function isMissingSnapshotColumn(
  error: { code?: string | null; message?: string | null } | null | undefined,
): boolean {
  if (!error) return false;
  if (error.code === "42703" || error.code === "PGRST204") return true;
  const message = error.message ?? "";
  return /column/i.test(message) && /does not exist|schema cache/i.test(message);
}

export type CardSnapshotInsert = {
  card_id: string;
  card_key: string;
  user_id: string;
  snapshot_date: string;
  median: number | null;
  n_sales: number | null;
  self_reported: boolean;
  status: string | null;
  is_public: boolean;
  held: boolean;
  player: string;
  year: string;
  set_name: string;
  parallel: string;
  grade: string;
  grader: string;
};

/** Full row written after the leaderboard migration. Today's date only. */
export function cardSnapshotInsert(input: {
  cardId: string;
  userId: string;
  snapshotDate: string;
  playerName?: string | null;
  year?: number | string | null;
  setBrand?: string | null;
  parallel?: string | null;
  grade?: string | null;
  isPublic: boolean;
  held: boolean;
  value: CardValueResult | null | undefined;
  saleSource?: string | null;
}): CardSnapshotInsert {
  const fields = cardValueSnapshotFields(input.value, input.saleSource);
  const identity = cardIdentity(input);
  return {
    card_id: input.cardId,
    card_key: input.cardId,
    user_id: input.userId,
    snapshot_date: input.snapshotDate,
    median: fields.median,
    n_sales: fields.n_sales,
    self_reported: fields.self_reported,
    status: input.value?.status ?? null,
    is_public: input.isPublic,
    held: input.held,
    player: identity.player,
    year: identity.year,
    set_name: identity.setName,
    parallel: identity.parallel,
    grade: identity.grade,
    grader: identity.grader,
  };
}

/** Median-only row used when the new snapshot columns are not applied yet. */
export function medianOnlySnapshotInsert(row: {
  card_id: string;
  snapshot_date: string;
  median: number | null;
}): { card_id: string; snapshot_date: string; median: number | null } {
  return {
    card_id: row.card_id,
    snapshot_date: row.snapshot_date,
    median: row.median,
  };
}
