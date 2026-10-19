import type { SupabaseClient } from "@supabase/supabase-js";
import {
  formatGrade,
  isValidCardNumber,
  isValidYear,
  normalizeCardNumberInput,
  parseYearLabel,
} from "@/lib/card-options";
import { isUuid } from "@/lib/value/card-value-access";
import type { MailDayCardView, Post, PublicCard } from "./types";

export const MAIL_DAY_POST_FAILED = "Cards saved, post failed, try again";
export const MAIL_DAY_MAX_CARDS = 10;
export const MAIL_DAY_FEED_LIMIT = 4;

const MAIL_DAY_PAID_CHUNK = 200;

export const ACQUIRED_SOURCES = ["ebay", "card_show", "lcs", "trade", "other"] as const;

export type AcquiredSource = (typeof ACQUIRED_SOURCES)[number];

export const SOURCE_LABELS: Record<AcquiredSource, string> = {
  ebay: "eBay",
  card_show: "Card show",
  lcs: "LCS",
  trade: "Trade",
  other: "Other",
};

/** Stored sport values. Pokémon shows as Pokémon/TCG in the picker. */
export const MAIL_DAY_SPORTS = [
  "Baseball",
  "Basketball",
  "Football",
  "Hockey",
  "Soccer",
  "Pokémon",
  "Other",
] as const;

export type MailDaySport = (typeof MAIL_DAY_SPORTS)[number];

export function mailDaySportLabel(sport: string): string {
  return sport === "Pokémon" ? "Pokémon/TCG" : sport;
}

export function isMailDaySport(value: string): value is MailDaySport {
  return (MAIL_DAY_SPORTS as readonly string[]).includes(value);
}

export type MailDayDraftCard = {
  playerName: string;
  yearLabel: string;
  setBrand: string;
  setIsCustom: boolean;
  cardNumber: string;
  parallel: string;
  parallelIsCustom: boolean;
  sport: string;
  conditionType: "raw" | "graded";
  grader: string;
  grade: string;
  paid: string;
  source: string;
  category: "pc" | "flipping";
  isPublic: boolean;
  showPaid: boolean;
  photos: string[];
};

export type MailDayInput = {
  caption: string;
  cards: MailDayDraftCard[];
  acquiredAt: string;
};

export type PreparedMailDayCard = {
  playerName: string;
  year: number;
  yearLabel: string;
  setBrand: string;
  setIsCustom: boolean;
  cardNumber: string;
  parallel: string;
  parallelIsCustom: boolean;
  sport: MailDaySport;
  conditionType: "raw" | "graded";
  grader: string | null;
  gradeValue: string;
  gradeText: string;
  paid: number | null;
  source: AcquiredSource;
  category: "pc" | "flipping";
  isPublic: boolean;
  showPaid: boolean;
  photos: string[];
};

export function parseAcquiredSource(value: unknown): AcquiredSource | null {
  if (typeof value !== "string") return null;
  const source = value.trim();
  return (ACQUIRED_SOURCES as readonly string[]).includes(source)
    ? (source as AcquiredSource)
    : null;
}

/**
 * Private cards hide value and paid from everyone.
 * On a public card, the owner always sees paid. Others see it only when show_paid is on.
 */
export function mailDayVisibility(input: {
  isPublic: boolean;
  showPaid: boolean;
  viewerIsOwner: boolean;
  paid: number | null;
}): { showValue: boolean; paid: number | null } {
  if (!input.isPublic) return { showValue: false, paid: null };
  const canSeePaid = input.viewerIsOwner || input.showPaid;
  const paid =
    canSeePaid && input.paid != null && Number.isFinite(input.paid) ? input.paid : null;
  return { showValue: true, paid };
}

/** Private cards are plain text. Public cards link to the card. */
export function mailDayCardHref(input: {
  showValue: boolean;
  cardId: string;
  viewerIsOwner: boolean;
  username: string;
}): string | null {
  if (!input.showValue || !input.cardId) return null;
  if (input.viewerIsOwner) return `/cards/${input.cardId}`;
  if (!input.username) return null;
  return `/u/${input.username}/cards/${input.cardId}`;
}

export function visibleMailDayCards<T>(cards: readonly T[], variant: "feed" | "detail") {
  if (variant === "detail" || cards.length <= MAIL_DAY_FEED_LIMIT) {
    return { shown: [...cards], extra: 0 };
  }
  return {
    shown: cards.slice(0, MAIL_DAY_FEED_LIMIT),
    extra: cards.length - MAIL_DAY_FEED_LIMIT,
  };
}

/** First missing requirement, so Log Mail Day can explain itself. */
export function mailDaySubmitBlocker(cards: readonly MailDayDraftCard[]): string | null {
  if (cards.length < 1) return "Add a card";
  if (cards.length > MAIL_DAY_MAX_CARDS) return "Mail Day holds up to 10 cards";
  for (let index = 0; index < cards.length; index += 1) {
    const card = cards[index];
    const label = `card ${index + 1}`;
    const photos = card.photos.filter(Boolean);
    if (photos.length < 1) return `Add a photo for ${label}`;
    if (photos.length > 4) return `Use 1 to 4 photos for ${label}`;
    if (!card.playerName.trim()) return `Add the player for ${label}`;
    if (!card.yearLabel.trim() || !isValidYear(card.yearLabel)) return `Add a year for ${label}`;
    if (!card.setBrand.trim()) return `Add the set for ${label}`;
    if (!isMailDaySport(card.sport)) return `Choose a sport for ${label}`;
    if (!parseAcquiredSource(card.source)) return `Choose a source for ${label}`;
    if (card.conditionType === "graded" && (!card.grader.trim() || !card.grade.trim())) {
      return `Add the grader and grade for ${label}`;
    }
  }
  return null;
}

export function mailDayIsDirty(cards: readonly MailDayDraftCard[], caption: string): boolean {
  if (caption.trim()) return true;
  if (cards.length !== 1) return true;
  const card = cards[0];
  if (!card) return false;
  return Boolean(
    card.photos.some(Boolean) ||
      card.playerName.trim() ||
      card.yearLabel.trim() ||
      card.setBrand.trim() ||
      card.cardNumber.trim() ||
      (card.parallel.trim() && card.parallel.trim().toLowerCase() !== "base") ||
      card.parallelIsCustom ||
      card.setIsCustom ||
      card.sport.trim() ||
      card.paid.trim() ||
      card.source ||
      card.isPublic ||
      card.showPaid ||
      card.category !== "flipping" ||
      card.conditionType !== "raw",
  );
}

function parsePaid(value: string): { ok: true; paid: number | null } | { ok: false; error: string } {
  const trimmed = value.trim();
  if (!trimmed) return { ok: true, paid: null };
  const paid = Number(trimmed);
  if (!Number.isFinite(paid) || paid < 0) return { ok: false, error: "Enter a valid price paid." };
  if (paid === 0) return { ok: true, paid: null };
  return { ok: true, paid };
}

export function validateMailDayDraft(
  input: MailDayInput,
):
  | { ok: true; caption: string; acquiredAt: string; cards: PreparedMailDayCard[] }
  | { ok: false; error: string } {
  const blocked = mailDaySubmitBlocker(input.cards);
  if (blocked) return { ok: false, error: blocked };
  const caption = input.caption.trim();
  if (caption.length > 280) return { ok: false, error: "Keep the caption to 280 characters." };
  const acquiredAt = /^\d{4}-\d{2}-\d{2}$/.test(input.acquiredAt)
    ? input.acquiredAt
    : new Date().toISOString().slice(0, 10);
  const cards: PreparedMailDayCard[] = [];
  for (let index = 0; index < input.cards.length; index += 1) {
    const card = input.cards[index];
    const label = `card ${index + 1}`;
    const photos = card.photos.filter((photo) => photo.startsWith("data:")).slice(0, 4);
    if (photos.length < 1) return { ok: false, error: `Add a photo for ${label}` };
    const parsedYear = parseYearLabel(card.yearLabel);
    if (!parsedYear) return { ok: false, error: `Add a year for ${label}` };
    const cardNumber = normalizeCardNumberInput(card.cardNumber);
    if (cardNumber && !isValidCardNumber(cardNumber)) {
      return { ok: false, error: `Check the card number for ${label}` };
    }
    const source = parseAcquiredSource(card.source);
    if (!isMailDaySport(card.sport)) return { ok: false, error: `Choose a sport for ${label}` };
    if (!source) return { ok: false, error: `Choose a source for ${label}` };
    if (card.category !== "pc" && card.category !== "flipping") {
      return { ok: false, error: `Choose PC or Flipping for ${label}` };
    }
    const paid = parsePaid(card.paid ?? "");
    if (!paid.ok) return { ok: false, error: `${paid.error.replace(/\.$/, "")} for ${label}.` };
    const conditionType = card.conditionType === "graded" ? "graded" : "raw";
    const isPublic = Boolean(card.isPublic);
    cards.push({
      playerName: card.playerName.trim(),
      year: parsedYear.year,
      yearLabel: parsedYear.yearLabel,
      setBrand: card.setBrand.trim(),
      setIsCustom: Boolean(card.setIsCustom),
      cardNumber,
      parallel: card.parallel.trim() || "Base",
      parallelIsCustom: Boolean(card.parallelIsCustom),
      sport: card.sport,
      conditionType,
      grader: conditionType === "graded" ? card.grader.trim() : null,
      gradeValue: conditionType === "graded" ? card.grade.trim() : "Raw",
      gradeText:
        conditionType === "raw" ? "Raw" : formatGrade(card.grader.trim(), card.grade.trim()),
      paid: paid.paid,
      source,
      category: card.category,
      isPublic,
      showPaid: Boolean(card.showPaid) && isPublic,
      photos,
    });
  }
  return { ok: true, caption, acquiredAt, cards };
}

export function mailDayCardRecord(
  userId: string,
  card: PreparedMailDayCard & { id: string },
  acquiredAt: string,
  now: string,
) {
  return {
    id: card.id,
    user_id: userId,
    player: card.playerName,
    year: card.year,
    year_label: card.yearLabel,
    set: card.setBrand,
    set_name: card.setBrand,
    set_is_custom: card.setIsCustom,
    grade: card.gradeValue,
    grader: card.grader,
    parallel: card.parallel,
    parallel_is_custom: card.parallelIsCustom,
    card_number: card.cardNumber,
    sport: card.sport,
    condition_type: card.conditionType,
    category: card.category,
    is_public: card.isPublic,
    paid_price: card.paid,
    acquired_source: card.source,
    acquired_at: acquiredAt,
    image_url: card.photos[0] ?? null,
    estimated_value: 0,
    accent: "#7c5cff",
    created_at: now,
    updated_at: now,
  };
}

export type MailDayMetaCard = {
  id: string;
  photos: string[];
  source: AcquiredSource | null;
  showPaid: boolean;
  playerName: string;
  year: number;
  yearLabel: string;
  setBrand: string;
  cardNumber: string;
  sport: string;
  parallel: string;
  grade: string;
  conditionType: "raw" | "graded";
  grader?: string | null;
};

/**
 * Post meta. Paid and public are not stored here.
 * Readers use mail_day_paid and the cards row.
 */
export function mailDayMeta(input: {
  acquiredAt: string;
  cards: MailDayMetaCard[];
}): Record<string, unknown> {
  const cards = input.cards.map((card) => ({
    id: card.id,
    photos: card.photos.filter(Boolean).slice(0, 4),
    source: card.source,
    showPaid: card.showPaid === true,
    playerName: card.playerName,
    year: card.year,
    yearLabel: card.yearLabel,
    setBrand: card.setBrand,
    cardNumber: card.cardNumber,
    sport: card.sport,
    parallel: card.parallel,
    grade: card.grade,
    conditionType: card.conditionType,
    grader: card.grader ?? null,
  }));
  const first = cards[0];
  return {
    source: first?.source ?? null,
    photos: first?.photos ?? [],
    acquiredAt: input.acquiredAt,
    cards,
  };
}

/** Finite paid amount from mail_day_paid. Numeric columns often arrive as strings. */
export function mailDayPaidAmount(value: unknown): number | null {
  const paid =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : Number.NaN;
  return Number.isFinite(paid) ? paid : null;
}

export type MailDayPaidByCard = Map<string, Map<string, number>>;

/**
 * cards.paid_price for these Mail Day posts, already filtered by mail_day_paid.
 * A failed RPC is logged and treated as no paid, so the feed still renders.
 */
export async function loadMailDayPaid(
  supabase: SupabaseClient,
  postIds: readonly string[],
): Promise<MailDayPaidByCard> {
  const ids = [...new Set(postIds.filter((id) => isUuid(id)))];
  const paid: MailDayPaidByCard = new Map();
  for (let index = 0; index < ids.length; index += MAIL_DAY_PAID_CHUNK) {
    const chunk = ids.slice(index, index + MAIL_DAY_PAID_CHUNK);
    try {
      const { data, error } = await supabase.rpc("mail_day_paid", { p_post_ids: chunk });
      if (error) {
        console.warn("[mail_day] paid:", error.message);
        continue;
      }
      for (const row of (data ?? []) as { post_id?: unknown; card_id?: unknown; paid?: unknown }[]) {
        const amount = mailDayPaidAmount(row.paid);
        if (typeof row.post_id !== "string" || typeof row.card_id !== "string" || amount == null) {
          continue;
        }
        const bucket = paid.get(row.post_id) ?? new Map<string, number>();
        bucket.set(row.card_id, amount);
        paid.set(row.post_id, bucket);
      }
    } catch (err) {
      console.warn("[mail_day] paid:", err instanceof Error ? err.message : err);
    }
  }
  return paid;
}

export type MailDayPresentation = {
  source: string | null;
  photos: string[];
  paid: number | null;
  isPublic: boolean;
  showValue: boolean;
};

export function presentMailDay(input: {
  postType: unknown;
  showPaid: unknown;
  meta: unknown;
  authorId: string;
  viewerId: string | null;
  /** Current public_cards membership. Overrides a stale meta.public flag. */
  cardIsPublic: boolean;
  /** From mail_day_paid. meta.paid is never read. */
  paid?: number | null;
}): MailDayPresentation | null {
  if (input.postType !== "mail_day") return null;
  const meta =
    input.meta && typeof input.meta === "object"
      ? (input.meta as Record<string, unknown>)
      : {};
  const view = mailDayVisibility({
    isPublic: input.cardIsPublic,
    showPaid: input.showPaid === true,
    viewerIsOwner: Boolean(input.viewerId) && input.viewerId === input.authorId,
    paid: mailDayPaidAmount(input.paid),
  });
  const source = view.showValue ? parseAcquiredSource(meta.source) : null;
  const photos = photoList(meta.photos);
  return {
    source: source ? SOURCE_LABELS[source] : null,
    photos,
    paid: view.paid,
    isPublic: input.cardIsPublic,
    showValue: view.showValue,
  };
}

function photoList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.length > 0).slice(0, 4);
}

function readSnapshots(meta: unknown): MailDayMetaCard[] {
  if (!meta || typeof meta !== "object") return [];
  const cards = (meta as Record<string, unknown>).cards;
  if (!Array.isArray(cards)) return [];
  const snapshots: MailDayMetaCard[] = [];
  for (const item of cards) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    if (typeof row.id !== "string" || !row.id) continue;
    const conditionType = row.conditionType === "graded" ? "graded" : "raw";
    snapshots.push({
      id: row.id,
      photos: photoList(row.photos),
      source: parseAcquiredSource(row.source),
      showPaid: row.showPaid === true,
      playerName: typeof row.playerName === "string" ? row.playerName : "",
      year: typeof row.year === "number" ? row.year : Number(row.year) || 0,
      yearLabel: typeof row.yearLabel === "string" ? row.yearLabel : "",
      setBrand: typeof row.setBrand === "string" ? row.setBrand : "",
      cardNumber: typeof row.cardNumber === "string" ? row.cardNumber : "",
      sport: typeof row.sport === "string" ? row.sport : "",
      parallel: typeof row.parallel === "string" ? row.parallel : "Base",
      grade: typeof row.grade === "string" ? row.grade : "",
      conditionType,
      grader: typeof row.grader === "string" ? row.grader : null,
    });
  }
  return snapshots;
}

function cardFromParts(
  id: string,
  snap: MailDayMetaCard | undefined,
  legacy: PublicCard | null,
): PublicCard | null {
  if (!snap && !legacy) return null;
  const base = legacy && legacy.id === id ? legacy : null;
  return {
    id,
    playerName: snap?.playerName || base?.playerName || "",
    year: snap?.year || base?.year || 0,
    yearLabel: snap?.yearLabel || base?.yearLabel,
    setBrand: snap?.setBrand || base?.setBrand || "",
    cardNumber: snap?.cardNumber || base?.cardNumber || "",
    sport: snap?.sport || base?.sport || "",
    photoDataUrl: snap?.photos[0] || base?.photoDataUrl || null,
    accent: base?.accent || "#7c5cff",
    estimatedSellPrice: 0,
    grade: snap?.grade || base?.grade,
    parallel: snap?.parallel || base?.parallel,
    conditionType: snap?.conditionType || base?.conditionType,
    grader: snap?.grader || base?.grader || undefined,
  };
}

/**
 * Build every card for one Mail Day post.
 * Public comes from public_cards (the cards row), never meta.public.
 * Paid comes only from the RPC map, then mailDayVisibility.
 */
export function assembleMailDayCards(input: {
  postType: unknown;
  showPaid: unknown;
  meta: unknown;
  authorId: string;
  viewerId: string | null;
  legacyCard: PublicCard | null;
  linked: { cardId: string; position: number }[];
  publicIds: ReadonlySet<string>;
  paidByCard: ReadonlyMap<string, number>;
}): MailDayCardView[] {
  if (input.postType !== "mail_day") return [];
  const meta =
    input.meta && typeof input.meta === "object"
      ? (input.meta as Record<string, unknown>)
      : {};
  const snapshots = readSnapshots(input.meta);
  const linkedIds = [...input.linked]
    .filter((row) => row.cardId)
    .sort((a, b) => a.position - b.position || a.cardId.localeCompare(b.cardId))
    .map((row) => row.cardId);
  const snapshotIds = snapshots.map((snap) => snap.id);
  let ids = linkedIds.length ? linkedIds : snapshotIds;
  if (!ids.length && input.legacyCard?.id) ids = [input.legacyCard.id];
  const seen = new Set<string>();
  const views: MailDayCardView[] = [];
  const viewerIsOwner = Boolean(input.viewerId) && input.viewerId === input.authorId;
  ids.forEach((id, index) => {
    if (!id || seen.has(id)) return;
    seen.add(id);
    const snap = snapshots.find((item) => item.id === id);
    const card = cardFromParts(id, snap, input.legacyCard);
    if (!card) return;
    const photos = snap?.photos.length
      ? snap.photos
      : index === 0
        ? photoList(meta.photos)
        : card.photoDataUrl
          ? [card.photoDataUrl]
          : [];
    const isPublic = input.publicIds.has(id);
    const showPaidFlag = snap ? snap.showPaid : input.showPaid === true;
    const view = mailDayVisibility({
      isPublic,
      showPaid: showPaidFlag,
      viewerIsOwner,
      paid: input.paidByCard.get(id) ?? null,
    });
    const sourceName = snap?.source ?? (index === 0 ? parseAcquiredSource(meta.source) : null);
    views.push({
      card: { ...card, photoDataUrl: photos[0] ?? card.photoDataUrl },
      photos,
      source: view.showValue && sourceName ? SOURCE_LABELS[sourceName] : null,
      paid: view.paid,
      isPublic,
      showValue: view.showValue,
    });
  });
  return views;
}

export type MailDaySourceRow = {
  id: string;
  user_id: string;
  post_type?: string | null;
  show_paid?: boolean | null;
  meta?: unknown;
  card?: PublicCard | null;
};

function missingRelation(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return error.code === "PGRST205" || error.code === "42P01" || /schema cache|does not exist/i.test(error.message ?? "");
}

/** Load post_cards, public membership, and paid, then assemble every Mail Day card. */
export async function loadMailDayViews(
  supabase: SupabaseClient,
  rows: readonly MailDaySourceRow[],
  viewerId: string | null,
): Promise<Map<string, MailDayCardView[]>> {
  const result = new Map<string, MailDayCardView[]>();
  const mailRows = rows.filter((row) => row.post_type === "mail_day");
  if (!mailRows.length) return result;

  const paidByPost = await loadMailDayPaid(
    supabase,
    mailRows.map((row) => row.id),
  );
  const postIds = mailRows.map((row) => row.id).filter((id) => isUuid(id));
  let linked: { post_id?: unknown; card_id?: unknown; position?: unknown }[] = [];
  if (postIds.length) {
    const { data, error } = await supabase
      .from("post_cards")
      .select("post_id, card_id, position")
      .in("post_id", postIds);
    if (error) {
      if (!missingRelation(error)) console.warn("[mail_day] post_cards:", error.message);
    } else {
      linked = (data ?? []) as typeof linked;
    }
  }

  const cardIds = new Set<string>();
  for (const row of mailRows) {
    if (row.card?.id && isUuid(row.card.id)) cardIds.add(row.card.id);
    for (const snap of readSnapshots(row.meta)) {
      if (isUuid(snap.id)) cardIds.add(snap.id);
    }
  }
  for (const row of linked) {
    if (typeof row.card_id === "string" && isUuid(row.card_id)) cardIds.add(row.card_id);
  }

  const publicIds = new Set<string>();
  if (cardIds.size) {
    const { data, error } = await supabase
      .from("public_cards")
      .select("id")
      .in("id", [...cardIds]);
    if (error) console.warn("[mail_day] public cards:", error.message);
    else {
      for (const row of (data ?? []) as { id?: unknown }[]) {
        if (typeof row.id === "string") publicIds.add(row.id);
      }
    }
  }

  for (const row of mailRows) {
    const links = linked
      .filter((item) => item.post_id === row.id && typeof item.card_id === "string")
      .map((item) => ({
        cardId: item.card_id as string,
        position: typeof item.position === "number" ? item.position : Number(item.position) || 0,
      }));
    result.set(
      row.id,
      assembleMailDayCards({
        postType: row.post_type,
        showPaid: row.show_paid,
        meta: row.meta,
        authorId: row.user_id,
        viewerId,
        legacyCard: row.card ?? null,
        linked: links,
        publicIds,
        paidByCard: paidByPost.get(row.id) ?? new Map(),
      }),
    );
  }
  return result;
}

/** What other people will see. Public is the form toggle that becomes the cards row. */
export function previewMailDayPost(input: {
  authorId: string;
  caption: string;
  cards: readonly MailDayDraftCard[];
}): Post {
  const views: MailDayCardView[] = input.cards.map((card, index) => {
    const parsed = parseYearLabel(card.yearLabel);
    const paidNumber = Number(card.paid);
    const paid = card.paid.trim() && Number.isFinite(paidNumber) ? paidNumber : null;
    const view = mailDayVisibility({
      isPublic: card.isPublic,
      showPaid: card.showPaid,
      viewerIsOwner: false,
      paid,
    });
    const source = view.showValue ? parseAcquiredSource(card.source) : null;
    const photos = card.photos.filter(Boolean).slice(0, 4);
    const publicCard: PublicCard = {
      id: `preview-${index + 1}`,
      playerName: card.playerName.trim(),
      year: parsed?.year ?? 0,
      yearLabel: parsed?.yearLabel,
      setBrand: card.setBrand.trim(),
      cardNumber: card.cardNumber.trim(),
      sport: card.sport,
      photoDataUrl: photos[0] ?? null,
      accent: "#7c5cff",
      estimatedSellPrice: 0,
      grade: card.conditionType === "graded" ? formatGrade(card.grader, card.grade) : "Raw",
      parallel: card.parallel.trim() || "Base",
      conditionType: card.conditionType,
      grader: card.conditionType === "graded" ? card.grader : undefined,
    };
    return {
      card: publicCard,
      photos,
      source: source ? SOURCE_LABELS[source] : null,
      paid: view.paid,
      isPublic: card.isPublic,
      showValue: view.showValue,
    };
  });
  const first = views[0];
  return {
    id: "mail-day-preview",
    authorId: input.authorId,
    body: input.caption,
    imageDataUrl: first?.photos[0] ?? null,
    card: first?.card ?? null,
    quotedPostId: null,
    createdAt: new Date(0).toISOString(),
    postType: "mail_day",
    showPaid: false,
    mailDay: first
      ? {
          source: first.source,
          photos: first.photos,
          paid: first.paid,
          isPublic: first.isPublic,
          showValue: first.showValue,
        }
      : null,
    mailDayCards: views,
  };
}

export async function runMailDaySave(deps: {
  saveCards: () => Promise<
    { ok: true; cardIds: string[] } | { ok: false; error: string; cardIds?: string[] }
  >;
  savePost: (cardIds: string[]) => Promise<{ ok: true; postId: string } | { ok: false }>;
}): Promise<
  | { ok: true; cardId: string; cardIds: string[]; postId: string }
  | { ok: false; cardSaved: false; error: string }
  | { ok: false; cardSaved: true; cardId: string; cardIds: string[]; error: string }
> {
  const cards = await deps.saveCards();
  if (!cards.ok) {
    if (cards.cardIds?.length) {
      return {
        ok: false,
        cardSaved: true,
        cardId: cards.cardIds[0],
        cardIds: cards.cardIds,
        error: cards.error,
      };
    }
    return { ok: false, cardSaved: false, error: cards.error };
  }
  const post = await deps.savePost(cards.cardIds);
  if (!post.ok) {
    return {
      ok: false,
      cardSaved: true,
      cardId: cards.cardIds[0] ?? "",
      cardIds: cards.cardIds,
      error: MAIL_DAY_POST_FAILED,
    };
  }
  return { ok: true, cardId: cards.cardIds[0] ?? "", cardIds: cards.cardIds, postId: post.postId };
}
