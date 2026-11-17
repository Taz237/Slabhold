import { productPhrase } from "@/lib/cards/product-data";

/**
 * Who printed a card: the four makers a modern back signs. Used as a hard guard: a back that signs
 * Topps is never shown as a Leaf, Panini or Upper Deck card (lib/scan/match.ts).
 */
export type CardMaker = "Topps" | "Panini" | "Leaf" | "Upper Deck";

/** "Leaf" but never the Maple Leafs; "Upper Deck" with or without the space. */
const BACK_MAKERS: readonly [RegExp, CardMaker][] = [
  [/\b(?:topps|bowman)\b/i, "Topps"],
  [/\bpanini\b/i, "Panini"],
  [/\bleaf\b(?!s)/i, "Leaf"],
  [/\bupper\s?deck\b/i, "Upper Deck"],
];

/** The one maker a card's back names. Two makers, or none: null (nothing to guard on). */
export function backMakerOf(lines: readonly string[]): CardMaker | null {
  const found = new Set<CardMaker>();
  for (const line of lines) for (const [pattern, maker] of BACK_MAKERS) if (pattern.test(line)) found.add(maker);
  return found.size === 1 ? [...found][0] : null;
}

/** First year Topps made Hoops too (lib/cards/checklists.ts toppsMade). */
const TOPPS_HOOPS_FROM = 2025;
/** Panini bought Donruss and Playoff in 2009; before that a Donruss back signs Donruss. */
const PANINI_DONRUSS_FROM = 2009;
/** Upper Deck has made O-Pee-Chee hockey since 2007-08. */
const UD_OPC_FROM = 2007;

const TOPPS_SETS =
  /^(?:topps|bowman|stadium club|finest|heritage|allen (?:and )?ginter|gypsy queen|archives|tribute|museum collection|dynasty|inception|sterling|tier one|five star|triple threads|transcendent|chrome)\b/;
const PANINI_SETS =
  /^(?:panini|prizm|optic|select|mosaic|contenders|national treasures|flawless|immaculate|spectra|absolute|certified|chronicles|phoenix|revolution|origins|prestige|obsidian|noir|one and one|illusions|recon|zenith|crown royale|court kings|impeccable|encased|plates (?:and )?patches|playbook|xr|status|luminance|elite|black|gold standard|totally certified|threads|limited|unparalleled|eminence|horizon|instant|hoops)\b/;
const UD_SETS = /^(?:upper deck|sp authentic|sp game used|spx|sp\b|the cup|artifacts|black diamond|ice|trilogy|synergy|allure|mvp|young guns|ultimate collection|series one|series two)\b/;

/**
 * The maker of a set the way the store names it ("Topps", "Panini Prizm", "Leaf", "Upper Deck").
 * A set we can't place for sure (Fleer, Score, Skybox, vintage O-Pee-Chee): null, never a guess.
 */
export function setMakerOf(setBrand: string, yearLabel: string, sport = ""): CardMaker | null {
  const phrase = productPhrase(setBrand) || setBrand.toLowerCase().trim();
  const name = setBrand.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  const year = Number(/^\d{4}/.exec(yearLabel.trim())?.[0] ?? 0);
  if (!name) return null;
  // Hoops is Panini's through 2024-25. From 2025-26 a Hoops back can sign either maker: no guard.
  if (/^(?:nba )?hoops\b/.test(name) || /^hoops\b/.test(phrase)) return year > 0 && year < TOPPS_HOOPS_FROM ? "Panini" : null;
  if (/^donruss\b/.test(name)) return year >= PANINI_DONRUSS_FROM ? "Panini" : null;
  // O-Pee-Chee hockey is Upper Deck's; any other O-Pee-Chee could be Topps' (basketball, vintage).
  if (/^o pee chee\b|^opc\b/.test(name)) return /hockey/i.test(sport) && year >= UD_OPC_FROM ? "Upper Deck" : null;
  if (/^leaf\b/.test(name)) return "Leaf";
  if (TOPPS_SETS.test(name)) return "Topps";
  if (UD_SETS.test(name)) return "Upper Deck";
  if (PANINI_SETS.test(name)) return "Panini";
  return null;
}
