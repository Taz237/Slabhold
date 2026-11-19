import { categoryLabel } from "@/lib/card-category";
import type { CardCategory } from "@/lib/types";

export function collectionFilterEmpty(lane: CardCategory): { title: string; detail: string } {
  if (lane === "flipping") {
    return {
      title: "No cards open to offers yet",
      detail: `Cards you move to ${categoryLabel("flipping")} show up here.`,
    };
  }
  return {
    title: `No ${categoryLabel("pc")} cards yet`,
    detail: "Cards you mark Personal show up here.",
  };
}
