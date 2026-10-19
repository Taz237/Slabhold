import type { CleanedSale, TrawlSoldResult } from "./types";

type TitleRow = {
  title?: string | null;
  itemId?: string | null;
  item_id?: string | null;
};

/**
 * Titles the shared filter kept, and titles it dropped.
 * Matching uses item id only. This does not decide which sales are priced.
 */
export function keptAndDroppedTitles(
  input: ReadonlyArray<TitleRow | TrawlSoldResult | CleanedSale>,
  kept: ReadonlyArray<Pick<CleanedSale, "itemId">>,
): { keptTitles: string[]; droppedTitles: string[] } {
  const keptIds = new Set(
    kept
      .map((sale) => sale.itemId)
      .filter((id): id is string => Boolean(id) && id !== "__empty__"),
  );
  const keptTitles: string[] = [];
  const droppedTitles: string[] = [];
  for (const row of input) {
    const title = (row.title ?? "").trim();
    const id =
      ("itemId" in row && row.itemId) ||
      ("item_id" in row && row.item_id) ||
      "";
    if (id && keptIds.has(id)) keptTitles.push(title);
    else droppedTitles.push(title);
  }
  return { keptTitles, droppedTitles };
}
