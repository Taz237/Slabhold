/**
 * The insert a card is in ("Rookie Code" for the 2026-27 Topps RC-3), saved in cards.insert_name.
 * Set by a scan that placed the card # in a checklist insert. Shown with the set, never the parallel:
 * a plain Rookie Code is still "Base", and its Refractor is a parallel of it.
 */

/** Longest insert name saved: the checklists' longest section names are well under it. */
export const INSERT_NAME_MAX = 80;

/** The insert name, trimmed and capped. "" when the card has none. */
export function insertNameOf(card: { insertName?: string | null }): string {
  return (card.insertName ?? "").trim().replace(/\s+/g, " ").slice(0, INSERT_NAME_MAX).trim();
}

/** The set with its insert: "Topps Rookie Code". A set that already names it isn't doubled. */
export function setWithInsertName(card: { setBrand: string; insertName?: string | null }): string {
  const set = card.setBrand.trim();
  const insert = insertNameOf(card);
  if (!insert || set.toLowerCase().includes(insert.toLowerCase())) return set;
  return [set, insert].filter(Boolean).join(" ");
}

/** The card page's "Insert" detail, or null for a card in no insert. */
export function insertSpec(card: { insertName?: string | null }): { label: "Insert"; value: string } | null {
  const insert = insertNameOf(card);
  return insert ? { label: "Insert", value: insert } : null;
}

/** Null when the column is not on the row yet ("" means saved with none). */
export function readInsertName(row: object): string | null {
  if (!Object.prototype.hasOwnProperty.call(row, "insert_name")) return null;
  const value = (row as { insert_name?: unknown }).insert_name;
  return typeof value === "string" ? insertNameOf({ insertName: value }) : "";
}

/** The row with insert_name, only for a card in an insert: other cards' saves don't change at all. */
export function withInsertNameColumn<T extends Record<string, unknown>>(row: T, card: { insertName?: string | null }): T & { insert_name?: string } {
  const insert = insertNameOf(card);
  return insert ? { ...row, insert_name: insert } : row;
}
