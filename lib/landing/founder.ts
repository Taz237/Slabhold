import type { ArtCard } from "@/components/card-slab-art";
import { photoSource } from "@/lib/collection/grid";
import { mapPublicCard } from "@/lib/social/cards";

/** The founder's account. Donnie OK'd his public profile and cards on the landing page. */
export const FOUNDER_USERNAME = "donnietaz";

/** Hero slabs. */
export const FOUNDER_CARD_LIMIT = 3;

/** Rows read before picking, so cards with no photo don't leave the hero short. */
export const FOUNDER_CARD_SCAN = 24;

export const FOUNDER_CARD_SELECT =
  "id, user_id, player, year, year_label, set, set_name, grade, grader, grade_qualifier, condition_type, estimated_value, image_url, accent, created_at";

export type FounderCardRow = {
  id: string;
  user_id: string;
  player: string;
  year: number;
  year_label: string | null;
  set: string;
  set_name: string | null;
  grade: string | null;
  grader: string | null;
  grade_qualifier: string | null;
  condition_type: string | null;
  estimated_value: number | null;
  image_url: string | null;
  accent: string | null;
  created_at: string | null;
};

export type FounderProfileRow = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
};

/** Slab label fields and the photo. No cert, price, or owner id. */
export type FounderCard = ArtCard & { id: string; photoUrl: string };

export type FounderShowcase = {
  profile: { username: string; displayName: string; avatarUrl: string | null } | null;
  cards: FounderCard[];
};

export const EMPTY_FOUNDER_SHOWCASE: FounderShowcase = { profile: null, cards: [] };

function value(row: FounderCardRow): number {
  const amount = Number(row.estimated_value);
  return Number.isFinite(amount) ? amount : 0;
}

function time(row: FounderCardRow): number {
  const at = Date.parse(row.created_at ?? "");
  return Number.isFinite(at) ? at : 0;
}

function toCard(row: FounderCardRow, photoUrl: string): FounderCard {
  const card = mapPublicCard({
    ...row,
    parallel: null,
    card_number: null,
    sport: null,
    condition_type: row.condition_type as "graded" | "raw" | null,
  });
  return {
    id: card.id,
    photoUrl,
    playerName: card.playerName,
    year: card.year,
    yearLabel: card.yearLabel ?? "",
    setBrand: card.setBrand,
    grade: card.grade ?? "",
    gradeQualifier: (row.grade_qualifier ?? "").trim(),
    certNumber: "",
    accent: card.accent,
    conditionType: card.conditionType,
    grader: card.grader,
  };
}

/**
 * The founder's top public cards by stored value, newest first on a tie.
 * Only his own rows, only photos in our card-photos bucket, each photo once.
 */
export function founderShowcase(
  profile: FounderProfileRow | null,
  rows: readonly FounderCardRow[],
): FounderShowcase {
  if (!profile) return EMPTY_FOUNDER_SHOWCASE;
  const seen = new Set<string>();
  const cards: FounderCard[] = [];
  const sorted = rows
    .filter((row) => row.user_id === profile.id)
    .sort((a, b) => value(b) - value(a) || time(b) - time(a));
  for (const row of sorted) {
    const source = photoSource(row.image_url);
    if (source.kind !== "optimized" || seen.has(source.src)) continue;
    seen.add(source.src);
    cards.push(toCard(row, source.src));
    if (cards.length >= FOUNDER_CARD_LIMIT) break;
  }
  const avatar = (profile.avatar_url ?? "").trim();
  return {
    profile: {
      username: profile.username,
      displayName: (profile.display_name ?? "").trim() || profile.username,
      avatarUrl: avatar.startsWith("https://") ? avatar : null,
    },
    cards,
  };
}
