export const MAIL_DAY_POST_FAILED = "Card saved, post failed, try again";

export const ACQUIRED_SOURCES = ["ebay", "card_show", "lcs", "trade", "other"] as const;

export type AcquiredSource = (typeof ACQUIRED_SOURCES)[number];

export const SOURCE_LABELS: Record<AcquiredSource, string> = {
  ebay: "eBay",
  card_show: "Card show",
  lcs: "LCS",
  trade: "Trade",
  other: "Other",
};

export type MailDayInput = {
  playerName: string;
  yearLabel: string;
  setBrand: string;
  cardNumber: string;
  parallel: string;
  sport: string;
  conditionType: "raw" | "graded";
  grader: string;
  grade: string;
  paid: string;
  source: string;
  category: "pc" | "flipping";
  isPublic: boolean;
  showPaid: boolean;
  caption: string;
  photos: string[];
  acquiredAt: string;
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

/**
 * Post meta. paid is included only when the card is public and show_paid is on.
 */
export function mailDayMeta(input: {
  source: AcquiredSource;
  photos: string[];
  isPublic: boolean;
  showPaid: boolean;
  paid: number | null;
  acquiredAt: string;
}): Record<string, unknown> {
  const meta: Record<string, unknown> = {
    source: input.source,
    photos: input.photos.filter(Boolean).slice(0, 4),
    public: input.isPublic,
    acquiredAt: input.acquiredAt,
  };
  if (input.isPublic && input.showPaid && input.paid != null && Number.isFinite(input.paid)) {
    meta.paid = input.paid;
  }
  return meta;
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
}): MailDayPresentation | null {
  if (input.postType !== "mail_day") return null;
  const meta =
    input.meta && typeof input.meta === "object"
      ? (input.meta as Record<string, unknown>)
      : {};
  const storedPaid =
    typeof meta.paid === "number" && Number.isFinite(meta.paid) ? meta.paid : null;
  const view = mailDayVisibility({
    isPublic: input.cardIsPublic,
    showPaid: input.showPaid === true,
    viewerIsOwner: Boolean(input.viewerId) && input.viewerId === input.authorId,
    paid: storedPaid,
  });
  const source = view.showValue ? parseAcquiredSource(meta.source) : null;
  const photos = Array.isArray(meta.photos)
    ? meta.photos
        .filter((item): item is string => typeof item === "string" && item.length > 0)
        .slice(0, 4)
    : [];
  return {
    source: source ? SOURCE_LABELS[source] : null,
    photos,
    paid: view.paid,
    isPublic: input.cardIsPublic,
    showValue: view.showValue,
  };
}

export async function runMailDaySave(deps: {
  saveCard: () => Promise<{ ok: true; cardId: string } | { ok: false; error: string }>;
  savePost: (
    cardId: string,
  ) => Promise<{ ok: true; postId: string } | { ok: false }>;
}): Promise<
  | { ok: true; cardId: string; postId: string }
  | { ok: false; cardSaved: false; error: string }
  | { ok: false; cardSaved: true; cardId: string; error: typeof MAIL_DAY_POST_FAILED }
> {
  const card = await deps.saveCard();
  if (!card.ok) return { ok: false, cardSaved: false, error: card.error };
  const post = await deps.savePost(card.cardId);
  if (!post.ok) {
    return {
      ok: false,
      cardSaved: true,
      cardId: card.cardId,
      error: MAIL_DAY_POST_FAILED,
    };
  }
  return { ok: true, cardId: card.cardId, postId: post.postId };
}
