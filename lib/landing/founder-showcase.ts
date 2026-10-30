import { photoSource } from "@/lib/collection/grid";
import type { FounderCard, FounderShowcase } from "@/lib/landing/founder";

const NONE: FounderShowcase = { profile: null, cards: [] };

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** One hero card, or null. Photos outside our card-photos bucket are dropped. */
function readCard(value: unknown): FounderCard | null {
  if (!value || typeof value !== "object") return null;
  const card = value as Record<string, unknown>;
  const source = photoSource(str(card.photoUrl));
  if (typeof card.id !== "string" || source.kind !== "optimized" || !str(card.playerName)) return null;
  return {
    id: card.id,
    photoUrl: source.src,
    playerName: str(card.playerName),
    year: typeof card.year === "number" ? card.year : 0,
    yearLabel: str(card.yearLabel),
    setBrand: str(card.setBrand),
    grade: str(card.grade),
    gradeQualifier: str(card.gradeQualifier),
    certNumber: "",
    accent: str(card.accent),
    conditionType: card.conditionType === "graded" || card.conditionType === "raw" ? card.conditionType : undefined,
    grader: str(card.grader) || undefined,
  };
}

/** Keeps only the shape the landing page draws. Anything else is no founder. */
export function readFounderShowcase(value: unknown): FounderShowcase {
  if (!value || typeof value !== "object") return NONE;
  const { profile, cards } = value as { profile?: unknown; cards?: unknown };
  if (!profile || typeof profile !== "object") return NONE;
  const { username, displayName, avatarUrl } = profile as Record<string, unknown>;
  if (typeof username !== "string" || !username) return NONE;
  return {
    profile: {
      username,
      displayName: typeof displayName === "string" && displayName ? displayName : username,
      avatarUrl: typeof avatarUrl === "string" && avatarUrl.startsWith("https://") ? avatarUrl : null,
    },
    cards: Array.isArray(cards)
      ? cards.flatMap((card) => {
          const read = readCard(card);
          return read ? [read] : [];
        }).slice(0, 3)
      : [],
  };
}
