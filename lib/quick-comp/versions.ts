import { parallelMatchKey, parallelsForSet } from "@/lib/cards/parallels";
import { parallelsIn, productPhrase, sameSeason, type ProductRecord } from "@/lib/cards/product-data";
import type { QuickCompIdentity } from "./identity";

/** One choice in the Version row: a parallel, and its print run when the checklist has one. */
export type QuickVersion = { name: string; serialRun: number | null };

export const BASE_VERSION: QuickVersion = { name: "Base", serialRun: null };

type VersionCard = { yearLabel: string; setBrand: string; cardNumber: string; sport?: string };

const key = (name: string) => parallelMatchKey(name).replace(/\s+/g, "");

/**
 * The versions of a card, Base first.
 *  - The year's checklist for the set when we have it, with print runs. With no sport (a typed
 *    card), every product with that year and set name is read: a run shows only where they agree.
 *  - Else the set family's list (Topps Chrome: Refractor, X-Fractor, …), names only.
 * The version already picked is always in the list.
 */
export function quickCompVersions(
  data: readonly ProductRecord[] | null,
  card: VersionCard,
  picked?: { parallel: string; serialRun?: number | null },
): QuickVersion[] {
  const list: QuickVersion[] = [];
  const index = new Map<string, number>();
  const disagree = new Set<string>();
  const add = (name: string, serialRun: number | null) => {
    const id = key(name);
    if (!id) return;
    const at = index.get(id);
    if (at == null) {
      index.set(id, list.length);
      list.push({ name, serialRun });
    } else if (list[at].serialRun !== serialRun) {
      disagree.add(id);
    }
  };

  const phrase = productPhrase(card.setBrand);
  const sport = (card.sport ?? "").trim().toLowerCase();
  const products = (data ?? []).filter(
    (product) =>
      Boolean(phrase) &&
      sameSeason(product.yearLabel, card.yearLabel) &&
      productPhrase(product.product) === phrase &&
      (!sport || product.sport.trim().toLowerCase() === sport),
  );
  for (const product of products) {
    for (const item of parallelsIn([product], product.sport, product.yearLabel, product.product, card.cardNumber)) {
      add(item.name, item.runVaries ? null : item.serialRun);
    }
  }
  if (list.length === 0) for (const name of parallelsForSet(card.setBrand)) add(name, null);

  const versions = list.map((item) => (disagree.has(key(item.name)) ? { name: item.name, serialRun: null } : item));
  const baseAt = versions.findIndex((item) => key(item.name) === "base");
  if (baseAt > 0) versions.unshift(...versions.splice(baseAt, 1));
  if (baseAt < 0) versions.unshift(BASE_VERSION);

  const current = picked?.parallel.trim();
  if (current && !versions.some((item) => key(item.name) === key(current))) {
    versions.splice(1, 0, { name: current, serialRun: picked?.serialRun ?? null });
  }
  return versions;
}

/** The same card and grade at another version. Base carries no run. */
export function withVersion(identity: QuickCompIdentity, version: QuickVersion): QuickCompIdentity {
  const base = key(version.name) === "base";
  return { ...identity, parallel: base ? "Base" : version.name, serialRun: base ? null : version.serialRun };
}

/** The version an identity is at, for marking the row. */
export function isVersion(identity: Pick<QuickCompIdentity, "parallel">, version: QuickVersion): boolean {
  return key(identity.parallel || "Base") === key(version.name);
}
