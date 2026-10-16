import type { SupabaseClient } from "@supabase/supabase-js";
import { cardCategory, rememberCategory } from "@/lib/card-category";
import {
  formatGrade,
  isValidYear,
  parseGrade,
  RAW_GRADE,
} from "@/lib/card-options";
import { uploadMedia } from "@/lib/supabase/media";
import type { ConditionType, SportsCard } from "@/lib/types";
import type { OwnedCard } from "./types";

export type CardRow = {
  id: string;
  user_id: string;
  player: string;
  year: number;
  set: string;
  grade: string | null;
  parallel: string | null;
  paid_price: number | null;
  estimated_value: number | null;
  image_url: string | null;
  card_number: string | null;
  sport: string | null;
  purchase_date: string | null;
  sell_price: number | null;
  sell_date: string | null;
  notes: string | null;
  accent: string | null;
  is_public: boolean | null;
  category?: string | null;
  created_at: string;
  updated_at: string | null;
  no_number?: boolean | null;
  year_label?: string | null;
  set_name?: string | null;
  set_is_custom?: boolean | null;
  parallel_is_custom?: boolean | null;
  serial_run?: number | null;
  serial_no?: number | null;
  is_rookie?: boolean | null;
  is_auto?: boolean | null;
  is_relic?: boolean | null;
  condition_type?: string | null;
  grader?: string | null;
  grade_qualifier?: string | null;
  cert_number?: string | null;
};

function dateOnly(value: string | null, fallback: string) {
  if (!value) return fallback.slice(0, 10);
  return value.slice(0, 10);
}

function inferConditionType(
  row: CardRow,
): ConditionType {
  if (row.condition_type === "raw" || row.condition_type === "graded") {
    return row.condition_type;
  }
  const parsed = parseGrade(row.grade ?? "");
  if (parsed.company && parsed.company !== RAW_GRADE) return "graded";
  return "raw";
}

function displayGrade(row: CardRow): string {
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

export function mapCardRow(row: CardRow): SportsCard {
  const setBrand = (row.set_name || row.set || "").trim();
  const yearLabel =
    (row.year_label || "").trim() || String(row.year);
  return {
    id: row.id,
    playerName: row.player,
    year: row.year,
    yearLabel,
    setBrand,
    setIsCustom: Boolean(row.set_is_custom),
    cardNumber: row.card_number ?? "",
    noNumber: Boolean(row.no_number),
    grade: displayGrade(row),
    parallel: row.parallel ?? "Base",
    parallelIsCustom: Boolean(row.parallel_is_custom),
    serialRun: row.serial_run ?? null,
    serialNo: row.serial_no ?? null,
    isRookie: Boolean(row.is_rookie),
    isAuto: Boolean(row.is_auto),
    isRelic: Boolean(row.is_relic),
    conditionType: inferConditionType(row),
    gradeQualifier: row.grade_qualifier ?? "",
    certNumber: row.cert_number ?? "",
    sport: row.sport ?? "Basketball",
    purchasePrice:
      row.paid_price == null || !Number.isFinite(Number(row.paid_price))
        ? null
        : Number(row.paid_price),
    purchaseDate: dateOnly(row.purchase_date, row.created_at),
    estimatedSellPrice: Number(row.estimated_value) || 0,
    sellPrice: row.sell_price == null ? null : Number(row.sell_price),
    sellDate: row.sell_date,
    notes: row.notes ?? "",
    photoDataUrl: row.image_url,
    accent: row.accent ?? "#7c5cff",
    category:
      row.category === "pc" || row.category === "flipping"
        ? row.category
        : undefined,
    isPublic: Boolean(row.is_public),
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? row.created_at,
  };
}

/** Map a public_cards (or safe) row — never expose paid/notes/cert/purchase date. */
export function mapPublicCard(
  row: Pick<
    CardRow,
    | "id"
    | "user_id"
    | "player"
    | "year"
    | "set"
    | "grade"
    | "parallel"
    | "estimated_value"
    | "image_url"
    | "card_number"
    | "sport"
    | "accent"
    | "year_label"
    | "set_name"
    | "grader"
  >,
): OwnedCard {
  const setBrand = (row.set_name || row.set || "").trim();
  const yearLabel = (row.year_label || "").trim() || String(row.year);
  const grader = (row.grader ?? "").trim();
  const gradeText = (row.grade ?? "").trim();
  const grade = grader
    ? formatGrade(
        grader,
        /^\d+(?:\.\d+)?$/.test(gradeText)
          ? gradeText
          : parseGrade(gradeText).number,
      )
    : gradeText;
  return {
    ownerId: row.user_id,
    id: row.id,
    playerName: row.player,
    year: row.year,
    setBrand,
    cardNumber: row.card_number ?? "",
    sport: row.sport ?? "Basketball",
    photoDataUrl: row.image_url,
    accent: row.accent ?? "#7c5cff",
    estimatedSellPrice: Number(row.estimated_value) || 0,
    grade,
    parallel: row.parallel ?? "Base",
    purchasePrice: null,
  };
}

export async function loadUserCards(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from("cards")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as CardRow[]).map(mapCardRow);
}

function missingColumnError(error: { code?: string; message?: string }) {
  const message = error.message ?? "";
  return (
    error.code === "PGRST204" ||
    error.code === "42703" ||
    /schema cache|column/i.test(message)
  );
}

export async function saveUserCard(
  supabase: SupabaseClient,
  userId: string,
  card: SportsCard,
) {
  const yearText = (card.yearLabel || String(card.year || "")).trim();
  if (!isValidYear(yearText)) {
    throw new Error("Use 2026 or 2023-24");
  }

  const uploaded = await uploadMedia(
    supabase,
    "card-photos",
    userId,
    card.photoDataUrl,
  );
  if (uploaded.error) throw new Error(uploaded.error);
  const category = cardCategory(card);
  rememberCategory(card.id, category);

  const parsed = parseGrade(card.grade);
  const graded = card.conditionType === "graded";
  const grader =
    graded && parsed.company && parsed.company !== RAW_GRADE
      ? parsed.company
      : null;
  const gradeValue = graded
    ? parsed.number || ""
    : parsed.company === RAW_GRADE || !card.grade.trim()
      ? "Raw"
      : card.grade;

  const base = {
    id: card.id,
    user_id: userId,
    player: card.playerName,
    year: card.year,
    set: card.setBrand,
    grade: gradeValue,
    parallel: card.parallel || "Base",
    paid_price: card.purchasePrice,
    estimated_value: card.estimatedSellPrice,
    image_url: uploaded.url,
    card_number: card.cardNumber,
    sport: card.sport,
    purchase_date: card.purchaseDate || null,
    sell_price: card.sellPrice,
    sell_date: card.sellDate,
    notes: card.notes,
    accent: card.accent,
    is_public: Boolean(card.isPublic),
    created_at: card.createdAt,
    updated_at: card.updatedAt,
  };

  const extended = {
    ...base,
    category,
    no_number: Boolean(card.noNumber),
    year_label: card.yearLabel || String(card.year),
    set_name: card.setBrand,
    set_is_custom: Boolean(card.setIsCustom),
    parallel_is_custom: Boolean(card.parallelIsCustom),
    serial_run: card.serialRun,
    serial_no: card.serialNo,
    is_rookie: Boolean(card.isRookie),
    is_auto: Boolean(card.isAuto),
    is_relic: Boolean(card.isRelic),
    condition_type: card.conditionType,
    grader,
    grade_qualifier: card.gradeQualifier || null,
    cert_number: card.certNumber || null,
  };

  const full = await supabase.from("cards").upsert(extended);
  if (!full.error) return;
  if (!missingColumnError(full.error)) throw new Error(full.error.message);

  // Fallback if migration not applied yet
  const withCategory = await supabase
    .from("cards")
    .upsert({ ...base, category });
  if (!withCategory.error) return;
  if (!missingColumnError(withCategory.error)) {
    throw new Error(withCategory.error.message);
  }
  const { error } = await supabase.from("cards").upsert(base);
  if (error) throw new Error(error.message);
}

export async function removeUserCard(
  supabase: SupabaseClient,
  userId: string,
  cardId: string,
) {
  const { error } = await supabase
    .from("cards")
    .delete()
    .eq("id", cardId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}
