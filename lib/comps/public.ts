import "server-only";

import { unstable_cache } from "next/cache";
import { formatGrade, parseGrade, RAW_GRADE } from "@/lib/card-options";
import { buildQueryKey } from "@/lib/comps/query-key";
import { dollarsToCents } from "@/lib/comps/stats";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { isUuid, soldCompsAccess } from "@/lib/value/card-value-access";
import { cardCacheTag } from "@/lib/value/card-cache";
import {
  blankPublicComps,
  hiddenPublicComps,
  STORED_SALE_SOURCE,
  type PublicCardComps,
  type PublicCompSale,
  type PublicCompsStatus,
} from "./public-types";

export type { PublicCardComps, PublicCompSale, PublicCompsStatus } from "./public-types";

/** Same window as the signed-in card value cache. Refresh drops both via `card:${id}`. */
const PUBLIC_COMPS_REVALIDATE_SECONDS = 300;

const IDENTITY_SELECT =
  "id, year, year_label, set, set_name, grade, grader, parallel, card_number, serial_run, is_auto, is_relic, condition_type, grade_qualifier";

const VALUE_SELECT = "median, low, high, n_sales, status, query_key, matched_at";

const SALE_SELECT = "price, sold_at, grade, grader, item_id";

type Row = Record<string, unknown>;

type QueryError = { message: string } | null;

export type PublicCompsQuery = {
  select(columns: string): PublicCompsQuery;
  eq(column: string, value: string): PublicCompsQuery;
  neq(column: string, value: string): PublicCompsQuery;
  order(column: string, options?: { ascending?: boolean }): PublicCompsQuery;
  limit(count: number): PublicCompsQuery;
  maybeSingle(): Promise<{ data: Row | null; error: QueryError }>;
} & PromiseLike<{ data: Row[] | null; error: QueryError }>;

export type PublicCompsClient = {
  from(table: string): PublicCompsQuery;
};

type IdentityRow = {
  id: string;
  year?: number | string | null;
  year_label?: string | null;
  set?: string | null;
  set_name?: string | null;
  grade?: string | null;
  grader?: string | null;
  parallel?: string | null;
  card_number?: string | null;
  serial_run?: number | string | null;
  is_auto?: boolean | null;
  is_relic?: boolean | null;
  condition_type?: string | null;
  grade_qualifier?: string | null;
};

function displayGrade(row: IdentityRow): string {
  const grader = (row.grader ?? "").trim();
  const gradeText = (row.grade ?? "").trim();
  if (grader) {
    const numberOnly = /^\d+(?:\.\d+)?$/.test(gradeText)
      ? gradeText
      : parseGrade(gradeText).number;
    return formatGrade(grader, numberOnly);
  }
  return gradeText;
}

function inferConditionType(row: IdentityRow): "raw" | "graded" {
  if (row.condition_type === "raw" || row.condition_type === "graded") {
    return row.condition_type;
  }
  const parsed = parseGrade(row.grade ?? "");
  if (parsed.company && parsed.company !== RAW_GRADE) return "graded";
  return "raw";
}

/** Same identity key loadSoldCompCard + buildQueryKey writes onto card_values. */
export function publicCardQueryKey(row: IdentityRow): string {
  const grade = displayGrade(row);
  const parallel = row.parallel ?? "Base";
  const qualifier = row.grade_qualifier ?? "";
  const serial =
    row.serial_run == null || row.serial_run === ""
      ? null
      : Number(row.serial_run);
  return buildQueryKey({
    id: row.id,
    year: Number(row.year) || 0,
    yearLabel: (row.year_label || "").trim() || String(row.year ?? ""),
    setBrand: (row.set_name || row.set || "").trim(),
    cardNumber: row.card_number || undefined,
    grade: grade || undefined,
    parallel: parallel || undefined,
    serialRun: serial != null && Number.isFinite(serial) ? serial : null,
    isAuto: Boolean(row.is_auto),
    isRelic: Boolean(row.is_relic),
    conditionType: inferConditionType(row),
    gradeQualifier: qualifier || null,
  });
}

function dateOnly(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const date = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

function integerCents(value: unknown): number | null {
  if (value == null || value === "") return null;
  const dollars = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(dollars)) return null;
  const cents = dollarsToCents(dollars);
  if (!Number.isInteger(cents)) return null;
  return cents;
}

function saleGrade(row: Row): string {
  const grader = typeof row.grader === "string" ? row.grader.trim() : "";
  const grade = typeof row.grade === "string" ? row.grade.trim() : "";
  return [grader, grade].filter(Boolean).join(" ") || "Raw";
}

/** Fresh object. Listing, seller, and owner fields on the row are not copied. */
export function toPublicSale(row: Row): PublicCompSale | null {
  if (row.item_id === "__empty__") return null;
  const priceCents = integerCents(row.price);
  const soldAt = dateOnly(row.sold_at);
  if (priceCents == null || priceCents <= 0 || !soldAt) return null;
  return {
    priceCents,
    soldAt,
    grade: saleGrade(row),
    source: STORED_SALE_SOURCE,
  };
}

export function newestStoredSales(rows: readonly Row[], limit = 3): PublicCompSale[] {
  const sorted = [...rows].sort((a, b) => {
    const left = typeof a.sold_at === "string" ? a.sold_at : "";
    const right = typeof b.sold_at === "string" ? b.sold_at : "";
    if (left === right) return 0;
    return left < right ? 1 : -1;
  });
  const sales: PublicCompSale[] = [];
  for (const row of sorted) {
    const sale = toPublicSale(row);
    if (!sale) continue;
    sales.push(sale);
    if (sales.length >= limit) break;
  }
  return sales;
}

function asStatus(value: unknown): PublicCompsStatus {
  if (
    value === "ok" ||
    value === "no_sales" ||
    value === "stale" ||
    value === "unavailable" ||
    value === "sample"
  ) {
    return value;
  }
  return "unavailable";
}

function asCount(value: unknown): number {
  const count = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(count) || count < 0) return 0;
  return count;
}

function asStamp(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

async function readRows(
  query: PublicCompsQuery,
): Promise<{ data: Row[] | null; error: QueryError }> {
  return query;
}

async function readPublicCardComps(
  cardKey: string,
  client: PublicCompsClient | null,
): Promise<PublicCardComps> {
  if (!client || !isUuid(cardKey)) return blankPublicComps("unavailable");

  const { data: publicRow, error: publicError } = await client
    .from("public_cards")
    .select(IDENTITY_SELECT)
    .eq("id", cardKey)
    .maybeSingle();

  if (publicError) {
    console.warn("[public-comps] public card read failed:", publicError.message);
    return blankPublicComps("unavailable");
  }

  const publicIds = new Set<string>();
  if (publicRow && publicRow.id === cardKey) publicIds.add(cardKey);
  if (soldCompsAccess(cardKey, publicIds, new Set()) !== "public") {
    return hiddenPublicComps();
  }

  const identity = publicRow as IdentityRow;
  const { data: valueRow, error: valueError } = await client
    .from("card_values")
    .select(VALUE_SELECT)
    .eq("card_id", cardKey)
    .maybeSingle();

  if (valueError) {
    console.warn("[public-comps] card value read failed:", valueError.message);
    return blankPublicComps("unavailable");
  }
  if (!valueRow) return blankPublicComps("no_sales");

  const storedKey = typeof valueRow.query_key === "string" ? valueRow.query_key : "";
  const expectedKey = publicCardQueryKey(identity);
  if (storedKey && storedKey !== expectedKey) {
    return {
      ...blankPublicComps("stale"),
      matchedAt: asStamp(valueRow.matched_at),
    };
  }

  const status = asStatus(valueRow.status);
  if (status === "sample") {
    return {
      ...blankPublicComps("sample"),
      matchedAt: asStamp(valueRow.matched_at),
    };
  }

  const queryKey = storedKey || expectedKey;
  const sales = await readStoredSales(client, queryKey);

  return {
    sales,
    medianCents: integerCents(valueRow.median),
    p25Cents: integerCents(valueRow.low),
    p75Cents: integerCents(valueRow.high),
    nSales: asCount(valueRow.n_sales),
    matchedAt: asStamp(valueRow.matched_at),
    status,
  };
}

async function readStoredSales(
  client: PublicCompsClient,
  queryKey: string,
): Promise<PublicCompSale[]> {
  if (!queryKey) return [];

  const { data: latest, error: latestError } = await client
    .from("sold_comps_cache")
    .select("fetched_at")
    .eq("query_key", queryKey)
    .order("fetched_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestError) {
    console.warn("[public-comps] sale batch read failed:", latestError.message);
    return [];
  }
  const fetchedAt = asStamp(latest?.fetched_at);
  if (!fetchedAt) return [];

  const { data, error } = await readRows(
    client
      .from("sold_comps_cache")
      .select(SALE_SELECT)
      .eq("query_key", queryKey)
      .eq("fetched_at", fetchedAt)
      .neq("item_id", "__empty__"),
  );
  if (error) {
    console.warn("[public-comps] sale read failed:", error.message);
    return [];
  }
  return newestStoredSales(data ?? [], 3);
}

/**
 * Stored card_values and sold_comps_cache only.
 * Never starts a live listing fetch or a value refresh.
 * Pass `client` from tests to skip the Next cache.
 */
export async function getPublicCardComps(
  cardKey: string,
  client?: PublicCompsClient | null,
): Promise<PublicCardComps> {
  if (client !== undefined) return readPublicCardComps(cardKey, client);
  return unstable_cache(
    async () => readPublicCardComps(cardKey, createSupabaseAdmin() as PublicCompsClient | null),
    ["public-card-comps", cardKey],
    { tags: [cardCacheTag(cardKey)], revalidate: PUBLIC_COMPS_REVALIDATE_SECONDS },
  )();
}
