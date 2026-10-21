import type { IdentityCard } from "@/lib/social/card-identity";

/** Full want label, e.g. "2020 Panini Select Jordan Love #47 PSA 10". */
export function wantLabel(card: IdentityCard): string {
  const year = (card.yearLabel || (card.year ? String(card.year) : "")).trim();
  const set = (card.setBrand || "").trim();
  const player = (card.playerName || "").trim();
  const rawNumber = (card.cardNumber || "").trim();
  const number =
    rawNumber && rawNumber !== "—"
      ? rawNumber.startsWith("#")
        ? rawNumber
        : `#${rawNumber}`
      : "";
  const grade = (card.grade || "").trim();
  return [year, set, player, number, grade].filter(Boolean).join(" ");
}

function bareHandle(value: string | null | undefined) {
  return (value ?? "").trim().replace(/^@/, "");
}

/**
 * Chip on a card. The viewer's own saved want says "your".
 * Another person's list uses that owner's handle. Display only.
 */
export function wantChipLabel(input: {
  saved: boolean;
  ownerHandle?: string | null;
  viewerHandle?: string | null;
}): string {
  if (!input.saved) return "Add to want list";
  const owner = bareHandle(input.ownerHandle);
  const viewer = bareHandle(input.viewerHandle);
  if (!owner || owner.toLowerCase() === viewer.toLowerCase()) return "On your want list";
  return `On @${owner}'s want list`;
}

/** Short name used in alert copy, e.g. "Jordan Love PSA 10". */
export function wantShortLabel(card: IdentityCard): string {
  const player = (card.playerName || "").trim() || "Card";
  const grade = (card.grade || "").trim();
  if (!grade || grade.toLowerCase() === "raw") return player;
  return `${player} ${grade}`;
}
