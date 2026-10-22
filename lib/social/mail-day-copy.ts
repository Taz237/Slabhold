import {
  canonicalParallelName,
  parallelMatchKey,
} from "@/lib/cards/parallels";

/** Fields a Mail Day tile, share title, or eBay search can read. */
export type MailDayNameCard = {
  playerName?: string | null;
  year?: number | null;
  yearLabel?: string | null;
  setBrand?: string | null;
  parallel?: string | null;
  cardNumber?: string | null;
  isRookie?: boolean | null;
};

export function mailDayPlayerLine(card: MailDayNameCard): string {
  return (card.playerName ?? "").replace(/\s+/g, " ").trim();
}

function yearText(card: MailDayNameCard): string {
  const label = (card.yearLabel ?? "").trim();
  if (label) return label;
  return card.year ? String(card.year) : "";
}

function parallelText(card: MailDayNameCard): string {
  const name = canonicalParallelName(card.setBrand ?? "", card.parallel ?? "");
  if (!name || parallelMatchKey(name) === "base") return "";
  return name;
}

function numberText(card: MailDayNameCard): string {
  const number = (card.cardNumber ?? "").trim().replace(/^#/, "");
  return number && number !== "—" ? `#${number}` : "";
}

/** "2024 Donruss Optic · Pink · #303" plus RC when the card is a rookie. */
export function mailDayDetailLine(card: MailDayNameCard): string {
  const yearSet = [yearText(card), (card.setBrand ?? "").trim()].filter(Boolean).join(" ");
  return [yearSet, parallelText(card), numberText(card), card.isRookie ? "RC" : ""]
    .filter(Boolean)
    .join(" · ");
}

/** "J.J. McCarthy 2024 Donruss Optic Pink #303". Player stays first and is never dropped. */
export function mailDayShareName(card: MailDayNameCard): string {
  const player = mailDayPlayerLine(card);
  const rest = [yearText(card), (card.setBrand ?? "").trim(), parallelText(card), numberText(card), card.isRookie ? "RC" : ""]
    .filter(Boolean)
    .join(" ");
  return [player, rest].filter(Boolean).join(" ");
}

/** Open Graph line for a Mail Day post. Empty when the card has no public name. */
export function mailDayOgTitle(card: MailDayNameCard): string {
  const name = mailDayShareName(card);
  if (!name) return "";
  return `${name} | Mail Day on Slabhold`;
}

/** One card uses the full-width hero. Two or more keep the grid. */
export function mailDayTileLayout(count: number): "hero" | "grid" {
  return count === 1 ? "hero" : "grid";
}

type SharePost = {
  postType?: string | null;
  card?: MailDayNameCard | null;
  mailDay?: { showValue?: boolean } | null;
  mailDayCards?: { showValue?: boolean; card?: MailDayNameCard | null }[] | null;
};

/** Card name for the share sheet. Private Mail Day cards stay out of the title. */
export function shareTitleForPost(post: SharePost): string {
  if (post.postType === "mail_day") {
    const views = post.mailDayCards?.length
      ? post.mailDayCards.filter((item) => item.showValue !== false)
      : post.mailDay?.showValue === false
        ? []
        : post.card
          ? [{ card: post.card }]
          : [];
    const name = mailDayShareName(views[0]?.card ?? {});
    if (name) return name;
    return "Mail Day";
  }
  if (post.card) {
    const name = mailDayShareName(post.card);
    if (name) return name;
  }
  return "Slabhold";
}
