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

/** Short name used in alert copy, e.g. "Jordan Love PSA 10". */
export function wantShortLabel(card: IdentityCard): string {
  const player = (card.playerName || "").trim() || "Card";
  const grade = (card.grade || "").trim();
  if (!grade || grade.toLowerCase() === "raw") return player;
  return `${player} ${grade}`;
}
