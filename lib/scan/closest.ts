import type { ChecklistProduct } from "@/lib/cards/checklists";
import type { ScanMatch } from "./match";
import { nameKey } from "./player-lookup";

/**
 * Never a dead end. When a scan read a player and nothing that names the card (no year, set or
 * card #), the collector is shown that player's real cards from our checklists to pick from,
 * oldest first, with cards other collectors confirmed for the same read on top. Pure: the hub
 * loads the lists (closest-load.ts) and wires the pick.
 *
 * These are choices, never an answer: they are kept apart from the scan's matches, nothing is
 * preselected, and the scan itself stays open until the collector taps one. Open beats wrong.
 */

/**
 * One sport's base-set cards by player, built from the checklist store
 * (scripts/build-player-cards.ts). `players` maps a name key to "product:number" pairs joined
 * with ";" where product is a place in `products`.
 */
export type PlayerCards = {
  sport: string;
  products: [yearLabel: string, product: string][];
  players: Record<string, string>;
};

export type ClosestCard = {
  playerName: string;
  sport: string;
  yearLabel: string;
  setBrand: string;
  cardNumber: string;
  /** How many collectors confirmed this card for the same read. Left out for a checklist card. */
  confirmed?: number;
};

/** The most choices shown. A player with more gets "Add it step by step" under the list, as always. */
export const MAX_CLOSEST = 8;

/** The index for one sport. Base-set sections only: an insert or an autograph needs its back to be told apart. */
export function buildPlayerCards(products: readonly ChecklistProduct[], isBase: (section: string) => boolean): PlayerCards {
  const sorted = [...products].sort((a, b) => a.yearLabel.localeCompare(b.yearLabel) || a.product.localeCompare(b.product));
  const players = new Map<string, string[]>();
  sorted.forEach((product, place) => {
    for (const section of product.sections) {
      if (!isBase(section.name)) continue;
      for (const [number, player] of section.cards) {
        const key = nameKey(player);
        // One player per card: a leaders card or a checklist ("Gretzky / Lemieux") is nobody's base card.
        if (!key || /[\/,&]/.test(player)) continue;
        const entry = `${place}:${number}`;
        const list = players.get(key) ?? [];
        if (!list.includes(entry)) list.push(entry);
        players.set(key, list);
      }
    }
  });
  return {
    sport: sorted[0]?.sport ?? "",
    products: sorted.map((product) => [product.yearLabel, product.product]),
    players: Object.fromEntries([...players.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, list]) => [key, list.join(";")])),
  };
}

/** One card, however it is spelled: "1985-86 Topps #9" and "1985-86 TOPPS 9" are one key. */
export const cardKey = (card: Pick<ClosestCard, "yearLabel" | "setBrand" | "cardNumber">) =>
  [card.yearLabel, card.setBrand, card.cardNumber].map((part) => part.toLowerCase().replace(/[^a-z0-9]+/g, "")).join("|");

/**
 * The player's cards to pick from: confirmed ones first (most confirmed first), then the
 * checklists', oldest first. Each card once. Empty when we know no card of theirs.
 */
export function closestCards(player: { name: string; sport: string }, index: PlayerCards | null, confirmed: readonly ClosestCard[] = []): ClosestCard[] {
  return allPlayerCards(player, index, confirmed).slice(0, MAX_CLOSEST);
}

/** Every card of the player's, in the pick list's order, with no cap: what a confirmation is checked against. */
function allPlayerCards(player: { name: string; sport: string }, index: PlayerCards | null, confirmed: readonly ClosestCard[] = []): ClosestCard[] {
  const out: ClosestCard[] = [];
  const seen = new Set<string>();
  const add = (card: ClosestCard) => {
    const key = cardKey(card);
    if (!card.yearLabel || !card.setBrand || !card.cardNumber || seen.has(key)) return;
    seen.add(key);
    out.push(card);
  };
  for (const card of [...confirmed].sort((a, b) => (b.confirmed ?? 0) - (a.confirmed ?? 0))) {
    if (nameKey(card.playerName) === nameKey(player.name)) add({ ...card, playerName: player.name });
  }
  for (const entry of (index?.players[nameKey(player.name)] ?? "").split(";").filter(Boolean)) {
    const at = entry.indexOf(":");
    const product = index!.products[Number(entry.slice(0, at))];
    if (!product) continue;
    add({ playerName: player.name, sport: index!.sport || player.sport, yearLabel: product[0], setBrand: product[1], cardNumber: entry.slice(at + 1) });
  }
  return out;
}

/**
 * A card we know: the checklists put this player on this year, set and card #. A confirmation is
 * only ever saved or shown for one of these, so nobody can seed a made-up choice.
 */
export function isKnownCard(card: ClosestCard, index: PlayerCards | null): boolean {
  if (!index || !card.playerName) return false;
  const key = cardKey(card);
  return allPlayerCards({ name: card.playerName, sport: card.sport }, index).some((known) => cardKey(known) === key);
}

/**
 * The read a confirmed card is filed under: its own player and sport, and nothing else. A
 * confirmation's key must be this, so a card is never filed under another player's read.
 */
export function confirmKeyOf(card: Pick<ClosestCard, "playerName" | "sport">): string {
  return readKeyOf({ playerName: card.playerName, sport: card.sport });
}

/** A choice as a row for the pick list: the card's identity, everything else open. Never a scan's own match. */
export function closestMatch(card: ClosestCard): ScanMatch {
  return {
    catalogId: null,
    playerName: card.playerName,
    sport: card.sport,
    yearLabel: card.yearLabel,
    setBrand: card.setBrand,
    cardNumber: card.cardNumber,
    parallel: "",
    serialRun: null,
    serialNo: "",
    isRookie: false,
    isAuto: false,
    grade: null,
    score: 0,
    sureness: { player: "sure", year: "unsure", set: "unsure", number: "unsure", parallel: "unsure" },
    parallelOptions: [],
  };
}

/** The two lines a pick adds to the front, as a card prints them: "1985-86 TOPPS" and "#9". */
function pickedLines(card: Pick<ClosestCard, "yearLabel" | "setBrand" | "cardNumber">): string[] {
  return [`${card.yearLabel} ${card.setBrand}`.replace(/\s+/g, " ").trim().toUpperCase(), `#${card.cardNumber.trim().toUpperCase()}`];
}

/**
 * The collector picked their card from the choices: the same scan, read again as if the front
 * printed that card's year, set and card # (the way a picked version is read, session.ts). So the
 * checklist, the versions and the sold prices all run on the card they chose. A second pick
 * replaces the first.
 */
export function withPickedCard<T extends { lines: string[]; pickedLines?: string[] | null }>(capture: T, card: Pick<ClosestCard, "yearLabel" | "setBrand" | "cardNumber">): T {
  const before = capture.pickedLines ?? [];
  const lines = capture.lines.filter((line, index) => !(index >= capture.lines.length - before.length && before.includes(line)));
  const added = pickedLines(card);
  return { ...capture, lines: [...lines, ...added], pickedLines: added };
}

/**
 * What a read is filed under, so the next collector whose scan reads the same finds what this one
 * confirmed: the player and whatever of the year, set, card # and print run the scan read. Text
 * only, no photo, nothing about who scanned it. "" with no player.
 */
export function readKeyOf(read: { playerName: string; sport?: string; yearLabel?: string; setBrand?: string; cardNumber?: string; serialRun?: number | null }): string {
  const player = nameKey(read.playerName);
  if (!player) return "";
  const part = (text: string | undefined) => (text ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  return [player, part(read.sport), part(read.yearLabel), part(read.setBrand), part(read.cardNumber), read.serialRun ? String(read.serialRun) : ""].join("|").slice(0, 200);
}
