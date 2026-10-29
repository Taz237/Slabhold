import { clipText } from "@/lib/social/link-preview";
import { scrubPublicText } from "@/lib/social/share-image";
import type { MovingTodayPayload } from "./types";

export type MovingTodayShareLine = {
  name: string;
  price: string;
  move: string;
  sold: string;
};

export type MovingTodayShareModel = {
  title: string;
  dateLabel: string;
  lines: MovingTodayShareLine[];
};

/**
 * Copy for the share image. Emails and ids are dropped. At most four tiles,
 * movers first. A plain card shows its price and "New", never a percent.
 */
export function movingTodayShareModel(payload: MovingTodayPayload): MovingTodayShareModel {
  const lines: MovingTodayShareLine[] = [];
  for (const sale of payload.sales) {
    const name = clipText(scrubPublicText(sale.player), 42);
    if (!name) continue;
    lines.push({
      name,
      price: sale.priceLabel,
      move: sale.kind === "mover" ? (sale.percentLabel ?? "") : "",
      sold: sale.kind === "mover" ? (sale.soldLabel ?? "") : sale.isNew ? "New" : "",
    });
    if (lines.length >= 4) break;
  }
  return {
    title: payload.title,
    dateLabel: scrubPublicText(payload.dateLabel),
    lines,
  };
}
