import { parallelSwatch } from "@/lib/cards/parallel-swatch";
import type { CatalogCard } from "@/lib/card-catalog";
import { parallelMatchKey, parallelSetFamily, parallelsForSet, sameParallelLoosely } from "@/lib/cards/parallels";
import { baseSetHits, checklistNumberKey, isBaseSection, playersAt, toppsMade, type ChecklistHit, type ChecklistProduct } from "@/lib/cards/checklists";
import { parallelsIn, productForSet, productPhrase, sameSeason, type ProductParallel, type ProductRecord } from "@/lib/cards/product-data";
import { setMatchPhrase } from "@/lib/comps/match";
import type { IndexedDirectoryPlayer } from "@/lib/players/types";
import { compactNorm, normInterest } from "@/lib/social/follow-rank";
import { AUTO_CODE_PREFIX, BOWMAN_U_BEST, findPlayers, looksLikeCatalogSku, readRawCardText, type RawCardRead, type RawPlayerHit } from "./raw-text";

export { looksLikeCatalogSku };
import type { SlabLabelRead } from "./slab-label";
import { MARKET_ALONE_MIN_VOTES, marketPlayer, nameKey, namesAgree, surnameAgrees, withoutSuffix, type LookupCard } from "./player-lookup";
import { TITLE_LOT, titleRuns } from "./title-facts";
import { rankVersionsByLook, type PhotoLook } from "./photo-look";
import { backMakerOf, setMakerOf, type CardMaker } from "./maker";
import { SAPPHIRE_WORD, inSapphireFamily, isSapphireSet, sapphireOf, sapphireOptionFor, sapphireSearchSet } from "./sapphire";

/**
 * Checks a scan's read (slab label, or raw card front and back) against our
 * catalog, our cached eBay sold listings and the parallel checklists, and
 * ranks up to 3 cards.
 *
 * What the card prints comes first. When the player's name is read on the
 * card (its nameplate, front or back), every row is that player: a catalog
 * row or a sold listing for someone else never shows. Cached sold titles can
 * identify a card our catalog doesn't have (a Mosaic, an insert, a new
 * prospect), and they can name the set when only a logo was printed.
 *
 * One row per card, never one per parallel. The parallel is decided
 * separately: from the label, a serial run the checklist pins, or a color
 * word, and left open ("") when we can't tell. A field is only "sure" when
 * the card itself says so. Nothing here guesses a card #, year or parallel
 * the card didn't show.
 *
 * rankScanMatches is pure. matchScan adds at most 2 catalog searches.
 */

export type ScanRead =
  | {
      kind: "slab";
      label: SlabLabelRead;
      /** The slab's back (the card's back through the case), when the scanner asked for it. Only its card # is used. */
      back?: RawCardRead | null;
    }
  | {
      kind: "raw";
      front: RawCardRead;
      back?: RawCardRead | null;
      /** The border's color name from the photo (pink, red, purple...), read on the phone. Only breaks ties. */
      border?: string | null;
      /** The photo's look (border color, rainbow sheen). Only orders "Which version?": it never names a parallel. */
      look?: PhotoLook | null;
    };

export type FieldSureness = "sure" | "likely" | "unsure";

export type ScanGrade = {
  company: string;
  number: string;
  qualifier: string;
  /** Private. Never put it in a URL. */
  certNumber: string;
  authentic: boolean;
  autoGrade: string;
};

export type ScanMatch = {
  /** The catalog row this card came from, or null when built from the card alone. */
  catalogId: string | null;
  playerName: string;
  sport: string;
  yearLabel: string;
  setBrand: string;
  cardNumber: string;
  /** "" when we can't tell. The confirm sheet asks. */
  parallel: string;
  serialRun: number | null;
  serialNo: string;
  isRookie: boolean;
  isAuto: boolean;
  /** The card says it holds a patch, a swatch or a relic (the back's memorabilia notice, or the label). */
  isRelic?: boolean;
  /** Slabs only. */
  grade: ScanGrade | null;
  score: number;
  sureness: Record<"player" | "year" | "set" | "number" | "parallel", FieldSureness>;
  /** Likely parallels for the picker, best first. One row when the parallel is sure. */
  parallelOptions: ProductParallel[];
  /** The insert or variation the back names ("Rookie Autograph Variations"). Never the parallel. */
  subset?: string;
  /**
   * The checklist insert this card # belongs to ("Rookie Code" for RC-3), from the insert name the
   * front prints or the card # itself. Shown with the set and searched with the sales. Never the
   * parallel: a plain Rookie Code is still "which version?" (plain, Rainbow Foilboard, numbered).
   */
  insertName?: string;
  /** A photo of this exact card from a sold listing the scan's search returned. Never stored. */
  listing?: { imageUrl: string; soldAt: string | null };
  /** The set was named by most of this card's sold titles ("Sapphire"), not by the card's print. */
  setSource?: "sales";
  /** The Sapphire Edition of this set, offered as a quick pick while nothing confirms it. */
  sapphireOption?: string;
  /** The card carries the 1ST BOWMAN mark. */
  firstBowman?: boolean;
  /** The player's name was read off the card and isn't in our player list yet. */
  playerNew?: boolean;
  /**
   * The player was looked up, not read on its own: the checklist puts them on this year, set and
   * card #, or most of this card's sold titles name them. Never set for a name the card and our
   * player list already agree on.
   */
  playerSource?: "checklist" | "sales";
  /**
   * Where a likely parallel came from: the card's print, sold titles that agree, or the print run
   * alone (the only parallel on the checklist at that run, with no title naming it yet).
   */
  parallelSource?: "card" | "sales" | "run";
  /** The print run read off the card matched no sold title, and 2+ titles agree on a run within 2 of it: theirs is used. */
  runUnsure?: boolean;
};

export type ScanMatchResult = {
  matches: ScanMatch[];
  /**
   * Every card we could find conflicts with what the back printed (another maker, another card #):
   * none is shown. The sheet says "We couldn't pin this one down" and offers search, never a guess.
   */
  unpinned?: boolean;
  /** The top match is settled on the phone: no AI step needed. */
  settled: boolean;
};

/** One cached eBay sold listing (sold_comps_cache): the title is what identifies the card. */
export type SoldTitle = {
  title: string;
  price?: number | null;
  soldAt?: string | null;
  /** The grader and grade the listing was saved with, when known. Null for raw. */
  grader?: string | null;
  grade?: string | null;
};

export type RankOptions = {
  directory: readonly IndexedDirectoryPlayer[];
  /** Checklists. Null or empty falls back to the per-set parallel lists. */
  products: readonly ProductRecord[] | null;
  /** Cached sold listings for the player the card names. Never a live search. */
  soldTitles?: readonly SoldTitle[] | null;
  /** The checklists for the year and set this scan read (lib/cards/checklists.ts). None: no lookup by card #. */
  checklists?: readonly ChecklistProduct[] | null;
};

const MAX_MATCHES = 3;
const MAX_PARALLEL_OPTIONS = 8;
/** Most cached sold titles read per scan. */
const MAX_SOLD_TITLES = 60;
/** Each sold listing that agrees with a card adds this, up to TITLE_SUPPORT_MAX. */
const TITLE_SUPPORT = 6;
const TITLE_SUPPORT_MAX = 18;

/** Label words that mark an autograph or rookie, not a parallel. */
const FLAG_WORDS = new Set(["rookie", "rc", "auto", "autos", "autograph", "autographs", "autographed", "card", "cards"]);
/** Label words that name a subset of the set (Prospects, Rookie Ticket, Young Guns), never a parallel. */
const SLAB_SUBSET_WORDS = new Set(["prospect", "prospects", "ticket", "young", "guns", "rated", "1st"]);

/** Short forms graders print on a label's variety line, spelled out. An unknown one stays as printed. */
const LABEL_SHORT_FORMS: Record<string, readonly string[]> = {
  ref: ["refractor"],
  refr: ["refractor"],
  rfr: ["refractor"],
  xfractor: ["x", "fractor"],
  przm: ["prizm"],
  gld: ["gold"],
  slv: ["silver"],
  slvr: ["silver"],
  blu: ["blue"],
  grn: ["green"],
  prpl: ["purple"],
  orng: ["orange"],
  blk: ["black"],
  wht: ["white"],
  pnk: ["pink"],
  ylw: ["yellow"],
};

/** A cert number read with a slip ("4567B912"): mostly digits, never a parallel's word. */
function certLike(word: string): boolean {
  return (word.match(/\d/g)?.length ?? 0) >= 4;
}

/** The parallel words on a slab's variety line: no flags, subset names, stray numbers, or a trailing "Prizm". */
function slabParallelWords(varietyText: string): string[] {
  const all = words(varietyText).flatMap((word) => LABEL_SHORT_FORMS[word] ?? [word]);
  // "TICKET" is Contenders' Rookie Ticket subset, except after another word: Championship, Playoff,
  // Cracked Ice and Super Bowl Ticket are parallels, and keep the word.
  const parallelTicket = (index: number) => all[index] === "ticket" && index > 0 && !["rookie", "rc"].includes(all[index - 1]);
  const kept = all.filter((word, index) => parallelTicket(index) || (!FLAG_WORDS.has(word) && !SLAB_SUBSET_WORDS.has(word) && !/^\d+$/.test(word) && !certLike(word)));
  // "SILVER PRIZM" is Silver. "PRIZM" alone is the parallel's own name (2012's Prizm), so it stays.
  const colors = kept.filter((word) => word !== "prizm" && word !== "prizms");
  return colors.length > 0 ? colors : kept;
}

type Evidence = {
  slab: boolean;
  players: RawPlayerHit[];
  /** A printed player name (slab label, or a raw card's nameplate) used when the directory doesn't know it. */
  playerText: string;
  /** The card printed the player's name clearly: every row must be this player. */
  playerLocked: boolean;
  /**
   * The printed name isn't in our list and nothing on the card backs it as a name (no position,
   * team or school line beside it, and not on both sides). It counts only once a catalog row or
   * a sold title names it; with neither, the player stays open. Never an invented player.
   */
  playerUnverified?: boolean;
  /** An unverified name was dropped: the card still shows, with no player. */
  playerOpen?: boolean;
  /** The player came from the lookup (checklist or sold titles for this year, set and card #), spelled as the source spells it. */
  lookedUp?: { name: string; source: "checklist" | "sales" };
  /** Read on both the front and the back. */
  playerBothSides: boolean;
  /** From a team line when the player is new to us. */
  sport: string;
  /** An insert the card names, such as Instinct. */
  insert: string;
  /** The insert or variation a raw card's back names ("Rookie Autograph Variations"). */
  subset: string;
  /** The checklist insert section of this card # ("Rookie Code"), once a checklist placed it there. */
  insertSection?: string;
  /** The border color read from the photo, for ties only. */
  border: string | null;
  /** The photo's look, raw cards only. Orders "Which version?" and nothing else. */
  look?: PhotoLook | null;
  yearLabel: string;
  copyrightYear: string;
  /** The last season the back's stat table lists ("2019"), or "". A year only once a checklist confirms it. */
  statSeason?: string;
  /**
   * The © year is the only year, and the back's stats stop two seasons before it: last year's
   * product printed late, or this year's. The lookups try both; the sheet shows neither.
   */
  yearOpen?: boolean;
  setNames: string[];
  /**
   * A raw card whose back signs only "© 2025 THE TOPPS COMPANY": no product named on either side,
   * and no other maker. Its set is the one Topps checklist with this player at this # (withSetFromToppsBack).
   */
  toppsBack?: boolean;
  /** A slab's printed set when it isn't one of SETS. */
  setText: string;
  cardNumber: string;
  /**
   * Numbers alone on a line of the back ("47"). Never the card # by themselves (a jersey or an age
   * prints the same way), only a tie-break between real cards the sold titles name.
   */
  backNumbers: string[];
  /** Codes read too loosely to trust alone ("RC 3", "RC" over "3"): a checklist must back one (RawCardRead.codeHints). */
  codeHints: string[];
  /** The one maker the back names (Topps, Panini, Leaf, Upper Deck). A card by another maker is never shown. */
  backMaker: CardMaker | null;
  serial: { number: string; run: string } | null;
  /** The read run was replaced by the run sold titles agree on (OCR read /298, titles say /299). */
  runUnsure?: boolean;
  /** Slab: the variety line with flag words removed. Raw: parallel words. */
  parallelWords: string[];
  isRookie: boolean;
  isAuto: boolean;
  /** The card says it holds a patch, a swatch or a relic. */
  isRelic?: boolean;
  grade: ScanGrade | null;
};

/** More bare numbers than this on one back is a stat table read cell by cell: none of them is trusted. */
const MAX_LONE_NUMBERS = 2;

/** Every 1-4 digit number alone on a line of the back, as a card # key. None when the back has many. */
function loneNumbers(back: RawCardRead | null | undefined): string[] {
  const numbers = [...new Set((back?.lines ?? []).map((line) => line.trim()).filter((line) => /^\d{1,4}$/.test(line)).map(cardNumberKey))];
  return numbers.length > MAX_LONE_NUMBERS ? [] : numbers;
}

function words(text: string): string[] {
  return normInterest(text).split(" ").filter(Boolean);
}

function compactName(name: string): string {
  return compactNorm(normInterest(name));
}

/** Words a card prints in capitals that stay capitals: a name's suffix (II, III, IV) and set initials (SP, SPx, UD). */
const KEPT_CAPITALS: Record<string, string> = { ii: "II", iii: "III", iv: "IV", sp: "SP", spx: "SPx", ud: "UD", opc: "OPC" };

function titleCase(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    // "C.J. STROUD" is C.J. Stroud: a letter after a period starts a word too.
    .replace(/(^|[\s.-])([a-z])/g, (_match, lead: string, letter: string) => `${lead}${letter.toUpperCase()}`)
    .split(" ")
    .map((word) => KEPT_CAPITALS[word.toLowerCase()] ?? word)
    .join(" ");
}

function cardNumberKey(value: string): string {
  return value.replace(/^#/, "").trim().toLowerCase();
}

function startYear(label: string): number | null {
  const match = label.trim().match(/^(\d{4})/);
  return match ? Number(match[1]) : null;
}

/** PSA prints 2018 for a 2018-19 basketball card. Add card stores the season. */
function seasonFor(sport: string, yearLabel: string, setBrand = ""): string {
  if (!/^\d{4}$/.test(yearLabel)) return yearLabel;
  if (sport !== "Basketball" && sport !== "Hockey") return yearLabel;
  // The WNBA plays inside one calendar year: a 2024 Prizm WNBA card is 2024, not 2024-25.
  if (/\bwnba\b/i.test(setBrand)) return yearLabel;
  const start = Number(yearLabel);
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

/** A slab label's word for a piece of memorabilia: PATCH, RELIC, JERSEY, SWATCH, MEMORABILIA, MATERIAL(S). */
const RELIC_LABEL_WORD = /^(?:patch(?:es)?|relics?|jerseys?|swatch(?:es)?|memorabilia|materials?|rpa)$/i;

function evidenceFrom(read: ScanRead, directory: readonly IndexedDirectoryPlayer[]): Evidence {
  if (read.kind === "slab") {
    const label = read.label;
    const variety = words(label.varietyText);
    return {
      slab: true,
      // Roster-file players only. The label's own text is the name for anyone else, as printed.
      players: label.playerText ? findPlayers([label.playerText], directory).filter((hit) => !hit.more) : [],
      playerText: label.playerText,
      playerLocked: false,
      playerBothSides: false,
      sport: "",
      insert: "",
      subset: "",
      border: null,
      yearLabel: label.yearLabel,
      copyrightYear: "",
      setNames: label.setName ? [label.setName] : [],
      setText: label.setName ? "" : label.setText,
      // The label's # first; else the one the back prints the way a back does ("No. 47", "BP-27").
      cardNumber: (looksLikeCatalogSku(label.cardNumber) ? "" : label.cardNumber) || (read.back?.cardNumber && !looksLikeCatalogSku(read.back.cardNumber) ? read.back.cardNumber : ""),
      backNumbers: loneNumbers(read.back),
      codeHints: [],
      backMaker: null,
      serial: label.serial ?? null,
      parallelWords: slabParallelWords(label.varietyText),
      isRookie: label.isRookie,
      isAuto: Boolean(label.autoGrade) || variety.some((word) => word.startsWith("auto")),
      ...(variety.some((word) => RELIC_LABEL_WORD.test(word)) ? { isRelic: true } : {}),
      grade: {
        company: label.grader,
        number: label.gradeNumber,
        qualifier: label.gradeQualifier,
        certNumber: label.certNumber,
        authentic: label.authentic,
        autoGrade: label.autoGrade,
      },
    };
  }
  const sides = [read.front, read.back].filter((side): side is RawCardRead => Boolean(side));
  // The sport the card itself gives: a team line, a position line, a league mark, the product line.
  const cardSports = sides.flatMap((side) => [side.team?.sport ?? "", side.sportHint ?? "", side.baseballSign ? "Baseball" : ""]).filter(Boolean);
  let players: RawPlayerHit[] = [];
  // A near name (one or two letters off) from a sport the card rules out is nobody: a Bills card
  // reading "JAMES COOK" is never the Nationals' James Wood.
  const otherSport = (hit: RawPlayerHit) => hit.score < 1 && cardSports.length > 0 && !cardSports.includes(hit.sport);
  for (const hit of sides.flatMap((side) => side.players).filter((item) => !otherSport(item))) {
    const seen = players.find((item) => item.name === hit.name && item.sport === hit.sport);
    if (!seen) players.push({ ...hit });
    else {
      if (hit.score > seen.score) seen.score = hit.score;
      if (hit.nameplate) seen.nameplate = true;
    }
  }
  players.sort((a, b) => b.score - a.score || Number(Boolean(b.nameplate)) - Number(Boolean(a.nameplate)));
  const onBoth = (compact: string) =>
    Boolean(read.back) &&
    [read.front, read.back].every((side) =>
      side!.players.some((hit) => hit.nameplate && compactName(hit.name) === compact) ||
      compactName(side!.printedName) === compact,
    );
  // The nameplate is the card telling us who it is. A name inside other text
  // (a bio line, the background) never outranks it.
  let playerText = "";
  let playerLocked = false;
  const plate = players.filter((hit) => hit.nameplate && !hit.more).sort((a, b) => {
    const both = Number(onBoth(compactName(b.name))) - Number(onBoth(compactName(a.name)));
    return both || b.score - a.score;
  })[0];
  const printed = [read.front.printedName, read.back?.printedName ?? ""].find(Boolean) ?? "";
  if (plate) {
    players = [plate];
    playerLocked = true;
  } else {
    // A wider-list name (retired, college, prospects) only confirms the name the card printed: the
    // same line the card is read by without it. And never against the card's own sport.
    const confirmed = printed ? players.find((hit) => hit.more && hit.nameplate && compactName(hit.name) === compactName(printed)) : undefined;
    players = players.filter((hit) => !hit.more);
    if (confirmed && (cardSports.length === 0 || cardSports.every((sport) => sport === confirmed.sport))) {
      players = [confirmed];
      playerLocked = true;
    } else if (printed) {
      players = [];
      playerText = printed;
      playerLocked = true;
    }
  }
  const anchoredName =
    Boolean(playerText) &&
    ([read.front, read.back].some((side) => side?.printedName === playerText && side.printedNameAnchored) || onBoth(compactName(playerText)));
  const lockedName = players[0]?.name ?? playerText;
  // The back is where the card # lives. A front number is usually something else.
  const backNumber = read.back?.cardNumber ?? "";
  // An autograph or relic checklist code ends in the player's initials (RAV-ML for Makai Lemon).
  // Only that makes a letter code the card #: any other is a word on the card.
  const initialCode = lockedName
    ? [read.back, read.front].flatMap((side) => side?.letterCodes ?? []).find((code) => code.split("-")[1] === initialsOf(lockedName)) ?? ""
    : "";
  const cardNumber = backNumber || read.front.cardNumber || initialCode;
  const setNames = mergedSetNames(sides, cardNumber);
  const numberPrefix = /^([A-Z]+)-/.exec(cardNumber)?.[1] ?? "";
  const yearLabel = sides.map((side) => side.yearLabel).find(Boolean) ?? "";
  const copyrightYear = sides.map((side) => side.copyrightYear).find(Boolean) ?? "";
  const statSeason = sides.map((side) => side.statSeason ?? "").find(Boolean) ?? "";
  const yearOpen = !yearLabel && /^\d{4}$/.test(copyrightYear) && Boolean(statSeason) && Number(copyrightYear) - Number(statSeason) === 2;
  const parallelWords: string[] = [];
  // In a set with a Sapphire Edition, "Sapphire" names the product, never the parallel.
  const sapphireProduct = Boolean(setNames[0]) && inSapphireFamily(setNames[0]);
  for (const phrase of sides.flatMap((side) => side.parallelWords)) {
    for (const word of words(phrase)) {
      if (sapphireProduct && word === "sapphire") continue;
      if (!parallelWords.includes(word)) parallelWords.push(word);
    }
  }
  return {
    slab: false,
    players,
    playerText,
    playerLocked,
    playerBothSides: Boolean(lockedName) && onBoth(compactName(lockedName)),
    ...(playerText && !anchoredName ? { playerUnverified: true } : {}),
    sport: sides.map((side) => side.team?.sport ?? "").find(Boolean) ?? sides.map((side) => side.sportHint ?? "").find(Boolean) ?? "",
    insert: sides.map((side) => side.insert).find(Boolean) ?? "",
    subset: sides.map((side) => side.subset ?? "").find(Boolean) ?? "",
    border: read.border ?? null,
    ...(read.look ? { look: read.look } : {}),
    yearLabel,
    copyrightYear,
    ...(statSeason ? { statSeason } : {}),
    ...(yearOpen ? { yearOpen: true } : {}),
    setNames,
    ...(plainToppsBack(read, setNames) ? { toppsBack: true } : {}),
    // No set on our list was read, and the back's product line names its product in full: that is the set.
    setText: setNames.length === 0 ? (sides.map((side) => side.productText ?? "").find(Boolean) ?? "") : "",
    cardNumber,
    backNumbers: loneNumbers(read.back),
    codeHints: [...(read.back?.codeHints ?? []), ...read.front.codeHints].filter((code, index, all) => all.indexOf(code) === index),
    backMaker: read.back ? backMakerOf(read.back.lines) : null,
    serial: sides.map((side) => side.serial).find(Boolean) ?? null,
    parallelWords,
    isRookie: sides.some((side) => side.isRookie),
    isAuto: sides.some((side) => side.isAuto) || AUTO_CODE_PREFIX.test(numberPrefix),
    ...(sides.some((side) => side.isRelic) ? { isRelic: true } : {}),
    grade: null,
  };
}

/** The back's legal line signs Topps: "© 2025 THE TOPPS COMPANY, INC.", "© 2025 TOPPS". */
const TOPPS_LEGAL = /\btopps\s+company\b|(?:©|\(c\))\s*\d{4}\s+(?:the\s+)?topps\b/i;
/** Another maker or a Topps-made product line that isn't plain Topps: never a plain Topps back. */
const NOT_PLAIN_TOPPS = /\b(?:bowman|panini|donruss|upper\s+deck|leaf|fleer|skybox|o-?pee-?chee)\b/i;

/** Both sides read no set, and the back signs only Topps: the set is for the Topps checklists to settle. */
function plainToppsBack(read: Extract<ScanRead, { kind: "raw" }>, setNames: readonly string[]): boolean {
  if (!read.back || setNames.length > 0) return false;
  const lines = [...read.front.lines, ...read.back.lines];
  return read.back.lines.some((line) => TOPPS_LEGAL.test(line)) && !lines.some((line) => NOT_PLAIN_TOPPS.test(line));
}

/** "Makai Lemon" is ML; "Ja'Marr Chase" is JC. First and last word only. */
function initialsOf(name: string): string {
  const parts = name.replace(/[^a-z\s-]/gi, "").split(/[\s-]+/).filter(Boolean);
  if (parts.length < 2) return "";
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

/** A "Bowman U" or "Bowman Chrome U" logo read. Bowman U Best and Bowman U Now are other products. */
const BOWMAN_U_LOGO = /\bbowman\s+(?:chrome\s+)?u(?:niversity)?\b(?!\s+(?:best|now))|\bbowman\s+u(?:niversity)?\s+chrome\b/i;

/** Bowman U's other products, printed in full. */
const BOWMAN_U_OTHER = /\bbowman\s+u(?:niversity)?\s+(?:best|now)\b|\bbowman(?:'?s)?\s+(?:best|now)\s+u(?:niversity)?\b/i;

/** "SAPPHIRE EDITION" printed with a Topps or Bowman set's name. */
const SAPPHIRE_EDITION = /\bsapphire\s+edition\b/i;

/** Bowman codes for Chrome prospects and prospect autos (in Bowman Chrome and in flagship Bowman), and codes only in Draft. */
const BOWMAN_CHROME_PREFIXES = new Set(["BCP", "BCPA", "CPA"]);
const BOWMAN_DRAFT_PREFIXES = new Set(["BD", "BDC", "CDA", "BDA"]);

/**
 * The set names both sides printed, best first. A name printed in full on either side
 * ("2024 TOPPS UPDATE SERIES", "PRIZM WNBA") beats a one-word logo guess, and the fuller name
 * beats the shorter one inside it (Topps Update over Topps, Upper Deck Series 1 over Upper Deck).
 */
function mergedSetNames(sides: readonly RawCardRead[], cardNumber: string): string[] {
  const names = printedSetNames(sides, cardNumber);
  // "SAPPHIRE" anywhere on the card names the Sapphire Edition of a set that has one.
  const sapphire = names[0] ? sapphireOf(names[0]) : null;
  if (sapphire && sides.some((side) => side.lines.some((line) => SAPPHIRE_WORD.test(line)))) {
    return [sapphire, ...names.filter((name) => name !== sapphire)];
  }
  // "SAPPHIRE EDITION" on a Topps or Bowman set whose Sapphire Edition isn't on our list (Topps
  // Chrome Update): it is that other product, so the set stays open. Never the plain set.
  if (names[0] && !sapphire && !isSapphireSet(names[0]) && /^(?:topps|bowman)\b/i.test(names[0]) && sides.some((side) => side.lines.some((line) => SAPPHIRE_EDITION.test(line)))) {
    return [];
  }
  return names;
}

function printedSetNames(sides: readonly RawCardRead[], cardNumber: string): string[] {
  const names: string[] = [];
  for (const name of sides.flatMap((side) => side.setNames)) if (!names.includes(name)) names.push(name);
  const printed = new Set(sides.flatMap((side) => side.printedSets ?? []));
  const within = (short: string, long: string) => {
    const a = words(short);
    const b = words(long);
    return b.length > a.length && a.every((word) => b.includes(word));
  };
  const rank = (name: string) => (printed.has(name) ? 0 : 1);
  const ordered = names
    .map((name, index) => ({ name, index }))
    .sort((a, b) => rank(a.name) - rank(b.name) || Number(within(a.name, b.name)) - Number(within(b.name, a.name)) || a.index - b.index)
    .map((item) => item.name);
  // "1ST BOWMAN" is on paper and Chrome alike, and flagship Bowman prints BCP Chrome Prospects and
  // CPA autos too. So with only the Bowman name printed, a BCP, BCPA or CPA code keeps Bowman first
  // and offers Bowman Chrome second; only "BOWMAN CHROME" printed makes it Chrome. A Draft code
  // (BD-1, BDC-12) is only in Bowman Draft.
  const prefix = /^([A-Z]+)-?/i.exec(cardNumber)?.[1]?.toUpperCase() ?? "";
  // College Bowman: the logo says so, or the card prints a school where a pro card prints its team,
  // on a Bowman card that is Chrome (the Chrome trademark line, or a BCP code). A school with
  // plain Bowman and nothing saying Chrome stays as it was read.
  const lines = sides.flatMap((side) => side.lines);
  const bowman = ordered.some((name) => name === "Bowman" || name === "Bowman Chrome") || lines.some((line) => /\bbowman\b/i.test(line));
  const chrome = lines.some((line) => /\bbowman\s+chrome\b/i.test(line)) || BOWMAN_CHROME_PREFIXES.has(prefix);
  // The school must be the card's team line (beside the name or the position), and Bowman U is
  // football and basketball only: any sign of baseball on either side rules the school rule out.
  const baseball = sides.some((side) => side.baseballSign || side.sportHint === "Baseball" || side.team?.sport === "Baseball");
  const school = sides.some((side) => Boolean(side.school) && side.schoolInHeader) && !sides.some((side) => side.team) && !baseball;
  if (lines.some((line) => BOWMAN_U_LOGO.test(line)) || (bowman && chrome && school)) {
    return ["Bowman U Chrome", ...ordered.filter((name) => name !== "Bowman U Chrome" && name !== "Bowman" && name !== "Bowman Chrome")];
  }
  // "BOWMAN UNIVERSITY BEST" and "BOWMAN U NOW" are their own products, not on our list: never Bowman's Best or Bowman.
  // Bowman U Best printed in full is that set (it has its own checklist); Bowman U Now stays open.
  if (lines.some((line) => BOWMAN_U_BEST.test(line))) return ["Bowman U Best", ...ordered.filter((name) => !/^bowman/i.test(name))];
  if (lines.some((line) => BOWMAN_U_OTHER.test(line))) return ordered.filter((name) => !/^bowman/i.test(name));
  // A college Bowman card with nothing saying Chrome: Bowman U has more than one product, so the set stays open.
  if (bowman && school) return ordered.filter((name) => name !== "Bowman" && name !== "Bowman Chrome");
  // Topps Update numbers its cards US1, US175 (US-175 later): a Topps card with a US code is Update.
  if (ordered[0] === "Topps" && prefix === "US" && /^US-?\d+$/i.test(cardNumber)) return ["Topps Update", ...ordered];
  if (ordered[0] === "Bowman") {
    if (BOWMAN_CHROME_PREFIXES.has(prefix) && !ordered.includes("Bowman Chrome")) return ["Bowman", "Bowman Chrome", ...ordered.slice(1)];
    if (BOWMAN_DRAFT_PREFIXES.has(prefix)) return ["Bowman Draft", ...ordered.filter((name) => name !== "Bowman Draft")];
  }
  return ordered;
}

function bestPlayerName(evidence: Evidence): string {
  // A looked-up name keeps its source's spelling ("De'Von Achane"), never re-cased.
  return evidence.players[0]?.name ?? evidence.lookedUp?.name ?? (evidence.playerText ? titleCase(evidence.playerText) : "");
}

/** The year, set and card # a scan read off the card: what the player lookup needs. Null when one is missing, or on a slab. */
export type ScanCardKey = { years: string[]; yearPrinted: boolean; setBrand: string; cardNumber: string; run: number | null; sport: string };

/** The years a card's checklist can be under: the printed year, or the © year and the one before it. */
function cardYears(evidence: Evidence): string[] {
  // The year printed beside the brand is the card's year. A © year alone can be the year after.
  const copyright = /^\d{4}$/.test(evidence.copyrightYear) ? evidence.copyrightYear : "";
  return evidence.yearLabel ? [evidence.yearLabel] : copyright ? [copyright, String(Number(copyright) - 1)] : [];
}

/**
 * No year printed, no © year and no stats: the year of the set whose checklist has this player at
 * this # (the card's own, or one bare number on its back). Exactly one year and #, or nothing changes.
 */
function withYearFromChecklists(evidence: Evidence, checklists: readonly ChecklistProduct[], name: string, setBrand: string): Evidence {
  if (!evidence.sport) return evidence;
  const numbers = evidence.cardNumber ? [evidence.cardNumber] : evidence.backNumbers;
  // Base-set hits first: a later year's insert can reuse the number (2026 Topps' Mantle #311 tribute).
  const found = { base: new Set<string>(), any: new Set<string>() };
  for (const product of checklists) {
    if (product.sport.toLowerCase() !== evidence.sport.toLowerCase()) continue;
    for (const number of numbers) {
      for (const hit of playersAt([product], { yearLabel: product.yearLabel, setBrand, cardNumber: number, sport: evidence.sport })) {
        if (!namesAgree(hit.player, name)) continue;
        found.any.add(`${product.yearLabel}|${number}`);
        if (isBaseSection(hit.section)) found.base.add(`${product.yearLabel}|${number}`);
      }
    }
  }
  const pick = found.base.size === 1 ? found.base : found.base.size === 0 && found.any.size === 1 ? found.any : null;
  if (!pick) return evidence;
  const [yearLabel, cardNumber] = [...pick][0].split("|");
  return { ...evidence, yearLabel, cardNumber };
}

/** The year a card with no printed or © year is, by its stats: the season after the last one listed. Only ever checked against a checklist. */
function statYear(evidence: Evidence): string {
  return !evidence.yearLabel && !evidence.copyrightYear && /^\d{4}$/.test(evidence.statSeason ?? "") ? String(Number(evidence.statSeason) + 1) : "";
}

/** The years to load and check checklists for: the card's own, else the one its stats point to. */
function checklistYears(evidence: Evidence): string[] {
  const years = cardYears(evidence);
  const fromStats = statYear(evidence);
  return years.length > 0 ? years : fromStats ? [fromStats] : [];
}

function cardKeyOf(evidence: Evidence): ScanCardKey | null {
  if (evidence.slab) return null;
  // The set as read, or the product the back's own product line names (a set our list doesn't have).
  const setBrand = evidence.setNames[0] ?? (evidence.setText ? titleCase(evidence.setText) : "");
  if (!setBrand || !evidence.cardNumber) return null;
  const years = cardYears(evidence);
  if (years.length === 0) return null;
  const run = evidence.serial ? Number(evidence.serial.run) : null;
  return { years, yearPrinted: Boolean(evidence.yearLabel), setBrand, cardNumber: evidence.cardNumber, run: Number.isFinite(run) ? run : null, sport: evidence.sport };
}

/**
 * A slab's year, set and card # off its label, when it printed a name our player list has only
 * under another spelling (or not at all): the checklist can back that name (withLookedUpPlayer).
 * Null on a raw card, and on a slab whose name the list already matched exactly.
 */
function slabCardKey(evidence: Evidence): ScanCardKey | null {
  if (!evidence.slab || !evidence.yearLabel || !evidence.cardNumber) return null;
  const setBrand = evidence.setNames[0] ?? "";
  if (!setBrand || evidence.players.some((hit) => hit.score === 1)) return null;
  if (!evidence.playerText && evidence.players.length === 0) return null;
  return { years: [evidence.yearLabel], yearPrinted: true, setBrand, cardNumber: evidence.cardNumber, run: null, sport: evidence.sport };
}

/** The card a scan read (year, set, card #), so its checklist can be loaded before ranking. */
/** Which checklist files a scan needs: its year and set. */
export type ScanChecklistKey = { years: string[]; setBrand: string; sport: string; allYears?: boolean; family?: "topps" };

/** Plain Topps backs are read for these sports only: baseball's Topps backs are left as they were. */
const TOPPS_BACK_SPORTS = new Set(["Basketball", "Football"]);

/** A plain Topps back with what the Topps checklists need: the player, the card's sport, a year and a card # (or one bare number). */
function toppsBackReady(evidence: Evidence, years: readonly string[]): boolean {
  return (
    Boolean(evidence.toppsBack) &&
    !evidence.setNames[0] &&
    Boolean(bestPlayerName(evidence)) &&
    TOPPS_BACK_SPORTS.has(toppsBackSport(evidence)) &&
    years.length > 0
  );
}

/**
 * The sport for a plain Topps back: the card's own (a team, a position, a league mark), else the
 * sport of the player whose nameplate the card printed. Inserts often print no team or position.
 */
function toppsBackSport(evidence: Evidence): string {
  return evidence.sport || (evidence.playerLocked ? (evidence.players[0]?.sport ?? "") : "");
}

/**
 * The year and set to load checklists for. The card # isn't needed here: with a player read and a
 * bare number on the back, the checklist is what can tell that number is the card # (withChecklistNumber).
 */
export function scanChecklistKey(read: ScanRead, directory: readonly IndexedDirectoryPlayer[]): ScanChecklistKey | null {
  const card = scanCardKey(read, directory);
  if (card) return card;
  const evidence = evidenceFrom(read, directory);
  const slabCard = slabCardKey(evidence);
  if (slabCard) return { years: slabCard.years, setBrand: slabCard.setBrand, sport: slabCard.sport };
  const years = checklistYears(evidence);
  // No set read, but a paper prospect code (BP-27): only Bowman prints those. Load its lists to check.
  if (!evidence.slab && !evidence.setNames[0] && bestPlayerName(evidence) && isPaperProspectCode(evidence.cardNumber)) {
    return { years, setBrand: PAPER_PROSPECT_SET, sport: evidence.sport || "Baseball", ...(years.length === 0 ? { allYears: true } : {}) };
  }
  // No set read, a back that signs only Topps: every Topps product for the year, to find the one with him at this #.
  if (!evidence.slab && toppsBackReady(evidence, years)) return { years, setBrand: "Topps", sport: toppsBackSport(evidence), family: "topps" };
  const setBrand = evidence.setNames[0] ?? "";
  if (evidence.slab || !setBrand || !bestPlayerName(evidence)) return null;
  // No year at all: every year of the set, in the sport the card names, to find the one with him at this #.
  if (years.length === 0) {
    if (!evidence.sport || (!evidence.cardNumber && evidence.backNumbers.length === 0)) return null;
    // A letter code (BP-27, US175) is on modern cards only: then every year of the set, not just the vintage ones.
    return { years: [], setBrand, sport: evidence.sport, ...(/[a-z]/i.test(evidence.cardNumber) ? { allYears: true } : {}) };
  }
  // Worth a load only when the checklist can settle something: a bare back number, or a year by the stats.
  if (evidence.backNumbers.length === 0 && !(statYear(evidence) && evidence.cardNumber)) return null;
  return { years, setBrand, sport: evidence.sport };
}

/** The one set that prints paper prospect codes (BP-27). Bowman Chrome's are BCP-, Bowman Draft's BD-. */
const PAPER_PROSPECT_SET = "Bowman";

function isPaperProspectCode(cardNumber: string): boolean {
  return /^BP-?\d{1,3}$/i.test(cardNumber.trim());
}

/**
 * The logo didn't read, but the card prints a BP- code and its player's name: it is Bowman once a
 * Bowman checklist has this player at that code, for the card's year when it printed one. Never on
 * the code alone, and never when the checklists put someone else there.
 */
function withSetFromProspectCode(evidence: Evidence, checklists: readonly ChecklistProduct[], name: string): Evidence {
  if (evidence.setNames[0] || !name || !isPaperProspectCode(evidence.cardNumber)) return evidence;
  const years = checklistYears(evidence);
  const backed = checklists.some(
    (product) =>
      (years.length === 0 || years.includes(product.yearLabel)) &&
      playersAt([product], { yearLabel: product.yearLabel, setBrand: PAPER_PROSPECT_SET, cardNumber: evidence.cardNumber, sport: product.sport }).some((hit) =>
        namesAgree(hit.player, name),
      ),
  );
  if (!backed) return evidence;
  return { ...evidence, setNames: [PAPER_PROSPECT_SET], sport: evidence.sport || "Baseball" };
}

/**
 * A plain Topps back (basketball, football): it signs "© 2025 THE TOPPS COMPANY" and names no
 * product. Flagship, Chrome, Update and Finest backs can all read that way, so the set is the one
 * Topps product whose checklist, for the © year or the year before (or the year the card printed),
 * has this player at this card #. Two products with him there (flagship #201 and Finest's #201),
 * or none: the set stays open. The year becomes that checklist's year only when none was printed.
 */
function withSetFromToppsBack(evidence: Evidence, checklists: readonly ChecklistProduct[], name: string): Evidence {
  const years = checklistYears(evidence);
  if (!toppsBackReady(evidence, years)) return evidence;
  // The read # first, then the loose codes: "RC" over "3" is RC-3 when only that is his.
  const numbers = [...(evidence.cardNumber ? [evidence.cardNumber] : evidence.backNumbers), ...evidence.codeHints];
  const sport = toppsBackSport(evidence);
  const found = new Map<string, { setBrand: string; yearLabel: string; cardNumber: string }>();
  for (const product of checklists) {
    if (!toppsMade(product)) continue;
    if (product.sport.toLowerCase() !== sport.toLowerCase()) continue;
    if (!years.some((yearLabel) => sameSeason(product.yearLabel, yearLabel))) continue;
    for (const cardNumber of numbers) {
      const at = playersAt([product], { yearLabel: product.yearLabel, setBrand: product.product, cardNumber, sport: product.sport });
      if (at.some((hit) => namesAgree(hit.player, name))) {
        found.set(`${productPhrase(product.product)}|${product.yearLabel}|${cardNumber}`, { setBrand: product.product, yearLabel: product.yearLabel, cardNumber });
      }
    }
  }
  if (found.size !== 1) return evidence;
  const [pick] = found.values();
  // Bowman and Hoops backs print their own names: a plain back that only one of them fits stays open.
  if (!/^topps\b/.test(productPhrase(pick.setBrand))) return evidence;
  return { ...evidence, setNames: [pick.setBrand], cardNumber: pick.cardNumber, yearLabel: evidence.yearLabel || pick.yearLabel, sport: evidence.sport || sport };
}

/** The checklists this card can be on: its set's for its years, or every Topps product for a plain Topps back. */
function productsForCard(evidence: Evidence, checklists: readonly ChecklistProduct[], years: readonly string[]): ChecklistProduct[] {
  const setBrand = evidence.setNames[0] ?? "";
  const sport = (evidence.sport || toppsBackSport(evidence)).toLowerCase();
  return checklists.filter((product) => {
    if (sport && product.sport.toLowerCase() !== sport) return false;
    if (!years.some((yearLabel) => sameSeason(product.yearLabel, yearLabel))) return false;
    if (setBrand) return productPhrase(product.product) === productPhrase(setBrand);
    return Boolean(evidence.toppsBack) && toppsMade(product);
  });
}

/**
 * The front prints an insert's name in big letters ("ROOKIE CODE") and the card # didn't read (or
 * isn't his): the one card that insert section has him on is the card #. Only the front counts (a
 * bio's "no limit" is never the No Limit insert), only an insert of the year and set the card read,
 * and exactly one card, or the # stays open.
 */
function withNumberFromInsertName(evidence: Evidence, checklists: readonly ChecklistProduct[], name: string, frontText: string): Evidence {
  if (!name || !frontText.trim()) return evidence;
  const years = checklistYears(evidence);
  if (years.length === 0) return evidence;
  const products = productsForCard(evidence, checklists, years);
  const his = (number: string) => products.some((product) => playersAt([product], { yearLabel: product.yearLabel, setBrand: product.product, cardNumber: number }).some((hit) => namesAgree(hit.player, name)));
  if (evidence.cardNumber && his(evidence.cardNumber)) return evidence;
  const found = new Map<string, { product: ChecklistProduct; section: string; cardNumber: string }>();
  for (const product of products) {
    for (const section of product.sections) {
      if (isBaseSection(section.name) || !insertNamedOnFront(section.name, frontText)) continue;
      for (const [cardNumber, player] of section.cards) {
        if (namesAgree(player, name)) found.set(`${productPhrase(product.product)}|${product.yearLabel}|${checklistNumberKey(cardNumber)}`, { product, section: section.name, cardNumber });
      }
    }
  }
  if (found.size !== 1) return evidence;
  const [pick] = found.values();
  // A plain Topps back takes the set the checklist names (withSetFromToppsBack does the same with a read #).
  const setNames = evidence.setNames[0] ? evidence.setNames : /^topps\b/.test(productPhrase(pick.product.product)) ? [pick.product.product] : evidence.setNames;
  return {
    ...evidence,
    setNames,
    cardNumber: pick.cardNumber,
    yearLabel: evidence.yearLabel || pick.product.yearLabel,
    sport: evidence.sport || pick.product.sport,
    insertSection: pick.section,
  };
}

/** Section names that are a kind of card, not a printed insert name. */
const NOT_INSERT_NAME = /\b(?:autographs?|signatures?|signed|relics?|memorabilia|patch(?:es)?|fabrics?|remnants?|redemption|swatch(?:es)?|variations?)\b/i;

/**
 * The front names this insert, whole: "ROOKIE CODE", or ROOKIE and CODE on lines of their own.
 * Two words at least, so one common word ("Drivers", "Bounce") never names an insert on its own.
 */
function insertNamedOnFront(section: string, frontText: string): boolean {
  const key = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const name = key(section);
  if (name.split(" ").length < 2 || NOT_INSERT_NAME.test(section)) return false;
  return ` ${key(frontText)} `.includes(` ${name} `);
}

/**
 * The checklist insert a card # belongs to (RC-3 is in Rookie Code only): its name goes with the
 * card, however the # was found (the back, the front's insert name, sold titles). An autograph or
 * relic section, a number the base set shares, or a # in two sections names none.
 */
function insertSectionFor(
  card: Pick<ScanMatch, "playerName" | "yearLabel" | "setBrand" | "cardNumber" | "sport">,
  checklists: readonly ChecklistProduct[] | null | undefined,
): string {
  if (!checklists?.length || !card.playerName || !card.cardNumber || !card.setBrand || !card.yearLabel) return "";
  const hits = playersAt(checklists, { yearLabel: card.yearLabel, setBrand: card.setBrand, cardNumber: card.cardNumber, sport: card.sport || undefined });
  if (hits.length === 0 || hits.some((hit) => isBaseSection(hit.section))) return "";
  const his = hits.filter((hit) => namesAgree(hit.player, card.playerName));
  const sections = new Set(his.map((hit) => hit.section));
  if (sections.size !== 1) return "";
  const [section] = sections;
  // A tier of the base set ("Base Field Level" in Select) goes by its own name: Field Level.
  return NOT_INSERT_NAME.test(section) ? "" : section.replace(/^base\s+(?=\S)/i, "");
}

/** Words on the end of an autograph or relic section's name: what is left is the name the card prints. */
const SIGNED_SECTION_TAIL = /(?:\s+(?:autograph(?:ed|s)?|autos?|signatures?|signed|memorabilia|relics?|materials?|jerseys?|patch(?:es)?|swatch(?:es)?|prizms?))+$/i;

/**
 * An autograph or relic section the card itself names: "First Impressions Autographed
 * Memorabilia" on a card that prints FIRST IMPRESSIONS on a line of its own. The checklist has this
 * player at this # in that one section, and the card prints the section's own name (two words or
 * more), so it is the card's insert, signed and with its piece of memorabilia as the section says.
 * Anything less names nothing.
 */
export function signedSectionFor(
  card: Pick<ScanMatch, "playerName" | "yearLabel" | "setBrand" | "cardNumber" | "sport">,
  checklists: readonly ChecklistProduct[] | null | undefined,
  printedLines: readonly string[],
): { insertName: string; isAuto: boolean; isRelic: boolean } | null {
  if (!checklists?.length || !card.playerName || !card.cardNumber || !card.setBrand || !card.yearLabel) return null;
  const hits = playersAt(checklists, { yearLabel: card.yearLabel, setBrand: card.setBrand, cardNumber: card.cardNumber, sport: card.sport || undefined });
  const his = hits.filter((hit) => namesAgree(hit.player, card.playerName));
  const printed = new Set(printedLines.map(tierKey));
  const named = [...new Set(his.map((hit) => hit.section))].filter((section) => {
    const name = tierKey(section.replace(SIGNED_SECTION_TAIL, ""));
    return NOT_INSERT_NAME.test(section) && name.split(" ").length >= 2 && printed.has(name);
  });
  if (named.length !== 1) return null;
  const [section] = named;
  return {
    insertName: section.replace(SIGNED_SECTION_TAIL, "").trim(),
    isAuto: /\b(?:autograph(?:ed|s)?|autos?|signatures?|signed)\b/i.test(section),
    isRelic: /\b(?:memorabilia|relics?|materials?|jerseys?|patch(?:es)?|swatch(?:es)?)\b/i.test(section),
  };
}

const tierKey = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * A set split into tiers (Select: Concourse, Premier Level, Club Level, Field Level) names each
 * parallel after its tier, and a card can only be a parallel of its own. The card's tier is the
 * one it prints on a line of its own ("FIELD LEVEL"), or the one its checklist section is named
 * for. Then only that tier's rows are offered: a /25 Field Level is never a Club Level /25.
 * No tiers in the list, or no tier (or two) named for the card: the list is left as it is.
 */
export function tierParallels(options: ProductParallel[], printedLines: readonly string[], section = ""): ProductParallel[] {
  const keys = options.map((option) => tierKey(option.name));
  const tiers = keys.filter((key, index) => key && key !== "base" && keys.indexOf(key) === index && keys.filter((other) => other.startsWith(`${key} `)).length >= 3);
  if (tiers.length < 2) return options;
  const printed = new Set(printedLines.map(tierKey));
  const sectionKey = tierKey(section).replace(/^base /, "");
  const named = tiers.filter((tier) => printed.has(tier) || sectionKey === tier);
  if (named.length !== 1) return options;
  const [tier] = named;
  return options.filter((option, index) => keys[index] === "base" || keys[index] === tier || keys[index].startsWith(`${tier} `));
}

/**
 * No card # read, but the back has bare numbers and the card names its player: a number is the card
 * # when the checklist for the year and set the card read has this player at it. Exactly one such
 * number, or the # stays open. A jersey or an age the checklist doesn't put him at never counts.
 */
function withChecklistNumber(
  evidence: Evidence,
  checklists: readonly ChecklistProduct[] | null | undefined,
  /** The front's own text: where an insert prints its name in big letters ("ROOKIE CODE"). */
  frontText = "",
): Evidence {
  // A slab's label prints its #: its checklist only ever backs the name (withLookedUpPlayer).
  if (!checklists?.length || evidence.slab) return evidence;
  const name = bestPlayerName(evidence);
  evidence = withSetFromProspectCode(evidence, checklists, name);
  evidence = withNumberFromInsertName(evidence, checklists, name, frontText);
  evidence = withSetFromToppsBack(evidence, checklists, name);
  const setBrand = evidence.setNames[0] ?? "";
  const years = checklistYears(evidence);
  if (!name || !setBrand) return evidence;
  if (years.length === 0) return withYearFromChecklists(evidence, checklists, name, setBrand);
  const his = (number: string) =>
    years.some((yearLabel) => playersAt(checklists, { yearLabel, setBrand, cardNumber: number, sport: evidence.sport || undefined }).some((hit) => namesAgree(hit.player, name)));
  let next = evidence;
  if (!next.cardNumber && next.backNumbers.length > 0) {
    const numbers = next.backNumbers.filter(his);
    if (numbers.length === 1) next = { ...next, cardNumber: numbers[0] };
  }
  // The # read isn't his on this checklist (a lone "3" whose "RC" read on its own line, a bio's #),
  // and exactly one loose code is: that code is the card #.
  if (!(next.cardNumber && his(next.cardNumber)) && next.codeHints.length > 0) {
    const codes = next.codeHints.filter(his);
    if (codes.length === 1) next = { ...next, cardNumber: codes[0] };
  }
  // No year printed: the year its stats point to, once that year's checklist has him at this #.
  const fromStats = statYear(next);
  if (fromStats && next.cardNumber && his(next.cardNumber)) next = { ...next, yearLabel: fromStats };
  return next;
}

export function scanCardKey(read: ScanRead, directory: readonly IndexedDirectoryPlayer[]): ScanCardKey | null {
  return cardKeyOf(evidenceFrom(read, directory));
}

const rosterByKey = new WeakMap<readonly IndexedDirectoryPlayer[], Map<string, IndexedDirectoryPlayer[]>>();

/**
 * The one roster-file player a source's name is, accents, periods and Jr. aside ("LaBaron Philon"
 * is our "Labaron Philon Jr.", "C.J. Stroud" is our "CJ Stroud"). Null when two share the name
 * (a father and a son), or the sport is another: then the source's own spelling is used.
 */
function rosterPlayer(name: string, sport: string, directory: readonly IndexedDirectoryPlayer[]): RawPlayerHit | null {
  let index = rosterByKey.get(directory);
  if (!index) {
    index = new Map();
    for (const player of directory) {
      if (player.more) continue;
      const key = nameKey(player.name);
      index.set(key, [...(index.get(key) ?? []), player]);
    }
    rosterByKey.set(directory, index);
  }
  const found = (index.get(nameKey(name)) ?? []).filter((player) => !sport || player.sport === sport);
  if (found.length !== 1) return null;
  const [player] = found;
  return { name: player.name, sport: player.sport, score: 1, line: name, ...(player.team ? { team: player.team } : {}) };
}

/**
 * The player as a lookup. With the year, set and card # read off the card:
 *
 *   C. A name the card printed (its name line, or the text a near match was read from) is that
 *      player once the checklist's player at that number, or the market's, agrees with it:
 *      accents, case, Jr. and a small OCR slip aside.
 *   A + B. With no printed name agreeing, the checklist and the market naming the same player.
 *   A. With no name read at all, the one player every checklist section puts on that number,
 *      for a year the card printed. When inserts and autographs share the number (Panini reuses
 *      plain numbers), the one player the base sections put on it, unless the card reads as an
 *      autograph, an insert or a variation, or prints one of those sections' names. More than
 *      one player still possible: open. Never a pick.
 *   B. With no name read at all, the player a clear majority of 3+ sold titles for this card name.
 *
 * A name our player list already matched exactly is left alone. A printed name no source agrees
 * with is left to the rules below (kept when the card backs it, dropped when it doesn't), and
 * the lookup never puts someone else in its place: open beats wrong.
 */
function withLookedUpPlayer(
  evidence: Evidence,
  titles: readonly SoldTitle[],
  checklists: readonly ChecklistProduct[] | null | undefined,
  directory: readonly IndexedDirectoryPlayer[],
  /** Everything the card printed, both sides: an insert's name on it rules the base card out. */
  cardText = "",
): Evidence {
  const card = cardKeyOf(evidence) ?? slabCardKey(evidence);
  if (!card || evidence.players.some((hit) => hit.score === 1)) return evidence;
  // A slab: only C, the label's own name agreeing with the checklist's player at that #. Never a
  // name the label didn't print, and never the market's alone.
  const sold = evidence.slab ? [] : titles;
  const listed: ChecklistHit[] = checklists?.length
    ? card.years.flatMap((yearLabel) => playersAt(checklists, { yearLabel, setBrand: card.setBrand, cardNumber: card.cardNumber, sport: card.sport || undefined }))
    : [];
  const lookup: LookupCard = { years: card.years, setBrand: card.setBrand, cardNumber: card.cardNumber, run: card.run };
  const market = sold.length > 0 ? marketPlayer(sold.slice(0, MAX_SOLD_TITLES), lookup, directory) : null;
  if (listed.length === 0 && !market) return evidence;

  const named = (name: string, source: "checklist" | "sales", sport = ""): Evidence => {
    // Someone our list knows (the near match itself, give or take Jr., or an exact name) keeps the list's row.
    const known = evidence.players.find((hit) => nameKey(hit.name) === nameKey(name)) ?? rosterPlayer(name, sport || evidence.sport, directory);
    const base = { ...evidence, playerLocked: true, playerUnverified: false, playerOpen: false, sport: evidence.sport || sport };
    if (known) {
      // The source prints a suffix our list leaves off ("Patrick Mahomes II"): the card's own name keeps it.
      const shown = withoutSuffix(name) !== name && withoutSuffix(known.name) === known.name ? name : known.name;
      return { ...base, players: [{ ...known, name: shown, score: 1, nameplate: true }], playerText: "", lookedUp: { name: shown, source } };
    }
    return { ...base, players: [], playerText: name, lookedUp: { name, source } };
  };

  const printed = [evidence.playerText, ...evidence.players.filter((hit) => hit.score < 1).map((hit) => hit.line)].filter(Boolean);
  // A slab's label prints the whole name: no surname-only match.
  const agrees = (text: string, name: string) => namesAgree(text, name) || (!evidence.slab && surnameAgrees(text, name));
  for (const text of printed) {
    const hit = listed.find((item) => agrees(text, item.player));
    if (hit) return named(hit.player, "checklist", hit.sport);
    if (market && agrees(text, market.name)) return named(market.name, "sales");
  }
  if (market) {
    const both = listed.find((item) => namesAgree(item.player, market.name));
    if (both) return named(both.player, "checklist", both.sport);
  }
  // A name was read and no source agrees with it: never swapped for someone else.
  if (printed.length > 0 || evidence.slab) return evidence;
  const people = new Set(listed.map((item) => nameKey(item.player)));
  if (card.yearPrinted && people.size === 1) return named(listed[0].player, "checklist", listed[0].sport);
  // A number inserts share: the base card's player, when nothing says the card is anything else.
  if (card.yearPrinted && people.size > 1 && !evidence.isAuto && !evidence.subset && !evidence.insert) {
    const base = baseSetHits(listed, cardText);
    if (base.length > 0 && new Set(base.map((item) => nameKey(item.player))).size === 1) return named(base[0].player, "checklist", base[0].sport);
  }
  if (market && market.votes >= MARKET_ALONE_MIN_VOTES) return named(market.name, "sales");
  return evidence;
}

/** The player the card names (nameplate first), or "" when none was read. */
export function scanPlayerName(read: ScanRead, directory: readonly IndexedDirectoryPlayer[]): string {
  return bestPlayerName(evidenceFrom(read, directory));
}

/** The player a scan read and their sport ("" when the card and our list give none). Null with no player. */
export function scanPlayer(read: ScanRead, directory: readonly IndexedDirectoryPlayer[]): { name: string; sport: string } | null {
  const evidence = evidenceFrom(read, directory);
  const name = bestPlayerName(evidence);
  return name ? { name, sport: evidence.players[0]?.sport ?? evidence.sport } : null;
}

/** Sets that are only a maker's name: a seller's "Topps" on a Bowman card is the maker. */
const BARE_MAKER_SET = new Set(["Topps", "Upper Deck", "Leaf"]);

/** Checklist prefixes only Bowman prints. A search hint for solds, never the set on the sheet. */
const BOWMAN_ONLY_PREFIXES = new Set(["BP", "BCP", "BDC", "BDP", "BPA", "BCPA", "CPA"]);

/** Words that don't name a product on their own: "Topps Chrome" stays whole, "Topps Inception" searches as Inception. */
const PLAIN_PRODUCT_WORDS = new Set(["chrome", "update", "now", "heritage", "finest", "instant", "certified", "absolute", "select", "draft", "sterling", "score"]);

/** The set as sellers write it: the product's own word when it has one ("Inception"), else the full name. */
export function productWord(setBrand: string): string {
  const parts = setBrand.trim().split(/\s+/);
  if (parts.length !== 2 || !/^(?:topps|panini)$/i.test(parts[0])) return setBrand;
  return PLAIN_PRODUCT_WORDS.has(parts[1].toLowerCase()) ? setBrand : parts[1];
}

/** Most Trawl calls one scan's search ladder makes. */
export const MAX_LADDER_RUNGS = 4;

/**
 * The eBay sold searches for this scan, broadest last, stopping at the first
 * that finds this card's sales:
 *   a. player + set + card # + /run   ("Aidan Miller Bowman BP-27 /299")
 *   b. player + card # + /run         ("Aidan Miller BP-27 /299")
 *   c. player + set + card #          ("Aidan Miller Bowman BP-27")
 *   d. player + card #                ("Aidan Miller BP-27")
 * No "#" and no year: eBay titles often skip them. The set and card # come from
 * the top match only when the card backed them; a Bowman-only checklist code
 * (BP-27) adds "Bowman" to the search, never to the sheet. The printed insert
 * and a slab's grade ride along. The player alone only when nothing else was read.
 */
export function liveSearchLadder(
  read: ScanRead,
  top: ScanMatch | null | undefined,
  directory: readonly IndexedDirectoryPlayer[],
): string[] {
  const evidence = evidenceFrom(read, directory);
  // Searched without Jr. or III: sellers often leave it off, and the title filter takes both.
  const player = withoutSuffix(top?.playerName || bestPlayerName(evidence));
  if (!player) return [];
  const known = (field: keyof ScanMatch["sureness"]) => Boolean(top) && top!.sureness[field] !== "unsure";
  const number = top && top.sureness.number === "sure" ? top.cardNumber : !top ? evidence.cardNumber : "";
  const prefix = /^([A-Z]+)-/i.exec(number)?.[1]?.toUpperCase() ?? "";
  const set = known("set") ? top!.setBrand : BOWMAN_ONLY_PREFIXES.has(prefix) ? "Bowman" : "";
  // The printed insert (Instinct), else the checklist insert the card # is in ("Rookie Code"):
  // sellers name it, and it keeps the base card's sales out.
  const insert = evidence.insert || (number && top?.insertName ? top.insertName : "");
  // A run the sold titles corrected (/298 read, /299 sold) searches as theirs.
  const run = evidence.serial ? `/${top?.runUnsure && top.serialRun ? top.serialRun : evidence.serial.run}` : "";
  const grade = evidence.grade?.company && evidence.grade.number ? `${evidence.grade.company} ${evidence.grade.number}` : "";
  // An autograph searches as one ("... Inception RAV-ML auto"), by the product's own word: sellers
  // write "Inception", not always "Topps Inception".
  const auto = evidence.isAuto && !evidence.slab ? "auto" : "";
  // A Sapphire Edition searches the way sellers list it: "Bowman Sapphire".
  const searchSet = isSapphireSet(set) ? sapphireSearchSet(set) : auto ? productWord(set) : set;
  const rung = (...parts: string[]) => [player, ...parts].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  const rungs = number
    ? [rung(searchSet, insert, number, run, grade, auto), rung(insert, number, run, grade, auto), rung(searchSet, insert, number, grade), rung(insert, number, grade)]
    : [rung(searchSet, insert, run, grade, auto), rung(insert, run, grade, auto), rung(searchSet, insert, grade)];
  // A slab searches by its label's own wording first: year, set, player, card #, parallel, print
  // run and grade, the way the label prints them. The wider rungs follow, for sellers who leave
  // words out. Base is never a search word, and an open parallel adds none.
  if (evidence.slab && top && set && number) {
    const year = known("year") ? top.yearLabel : "";
    const named = top.parallel.trim() && top.sureness.parallel !== "unsure" && parallelMatchKey(top.parallel) !== "base" ? top.parallel.trim() : "";
    const label = [year, searchSet, player, insert, number, named, run, grade].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
    rungs.unshift(label);
  }
  const useful = [...new Set(rungs)].filter((query) => query !== player);
  // Nothing but the name was read: search the player once, and let the titles name the card.
  return (useful.length > 0 ? useful : [player]).slice(0, MAX_LADDER_RUNGS);
}

/**
 * The search by the card itself, for when the player is open: the year, set, card # and print
 * run the card printed ("2025-26 Panini Prizm 103 /175"). Its sold titles name the player when
 * most of them agree. "" unless the card backed all three: never a search on a guess.
 */
export function cardSearchQuery(
  read: ScanRead,
  top: ScanMatch | null | undefined,
  directory: readonly IndexedDirectoryPlayer[],
): string {
  const card = scanCardKey(read, directory);
  if (!card || !card.yearPrinted || !top) return "";
  if (top.sureness.number !== "sure" || top.sureness.set === "unsure" || top.sureness.year !== "sure") return "";
  const run = card.run != null ? `/${top.runUnsure && top.serialRun ? top.serialRun : card.run}` : "";
  return [top.yearLabel, top.setBrand, top.cardNumber, run].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

/** The first rung of the ladder. "" with no player: no search. */
export function liveSearchQuery(
  read: ScanRead,
  top: ScanMatch | null | undefined,
  directory: readonly IndexedDirectoryPlayer[],
): string {
  return liveSearchLadder(read, top, directory)[0] ?? "";
}

/** Up to 2 search_cards queries: the full card, then the player alone. */
export function catalogQueriesFor(read: ScanRead, directory: readonly IndexedDirectoryPlayer[]): string[] {
  const evidence = evidenceFrom(read, directory);
  const player = bestPlayerName(evidence);
  if (!player) return [];
  const full = [player, evidence.yearLabel, evidence.setNames[0] ?? evidence.setText, evidence.cardNumber]
    .filter(Boolean)
    .join(" ");
  return full === player ? [player] : [full, player];
}

type Candidate = {
  catalogId: string | null;
  playerName: string;
  sport: string;
  yearLabel: string;
  setBrand: string;
  cardNumber: string;
  isRookie: boolean;
  /** Catalog rows for this card, by parallel key, so a resolved parallel can keep its row id. */
  rowsByParallel: Map<string, string>;
  /** Cached sold listings that name this exact card. */
  titles?: TitleFacts[];
  /**
   * Sold titles name 2+ real cards for this player in this set (Select's #47 and #247): +20 for the
   * one the card itself backs (a lone back number, the label's variety), -20 for the others.
   */
  numberNudge?: number;
  /** The card with the # left open because the titles split between real cards: it stands in for the scan's own bare card. */
  openSplit?: boolean;
};

/** The sport a listing's own words give (a team, a league, "Baseball"). "" when it says nothing. */
function titleSport(read: RawCardRead): string {
  return read.team?.sport || read.sportHint || (read.baseballSign ? "Baseball" : "");
}

/** A listing from a sport the card rules out is another card, whatever name, run or code it shares. */
function otherSportTitle(read: RawCardRead, sport: string): boolean {
  const said = titleSport(read);
  return Boolean(sport) && Boolean(said) && said !== sport;
}

/** "CCS-JW" for a player whose initials aren't JW. Only two-letter endings and two-word names: "CPA-JDL" and "De La Cruz" are left alone. */
function otherPlayerCode(cardNumber: string, playerName: string): boolean {
  const ending = /^[A-Z]{2,5}-([A-Z]{2})$/.exec(cardNumber.toUpperCase())?.[1];
  const name = withoutSuffix(playerName).replace(/[^a-z\s]/gi, "").split(/\s+/).filter(Boolean);
  return Boolean(ending) && name.length === 2 && ending !== initialsOf(name.join(" "));
}

function titleNamesPlayer(title: string, playerName: string): boolean {
  const name = compactName(playerName);
  return name.length > 0 && compactNorm(normInterest(title)).includes(name);
}

/** What one cached sold title says about the card. */
type TitleFacts = {
  /** Print runs the title names ("/199"). */
  runs: number[];
  /** Color and finish words, upper case ("ORANGE"). */
  colors: string[];
  insert: string;
  /** The title says Sapphire. */
  sapphire?: boolean;
};

function identityKey(card: { playerName: string; yearLabel: string; setBrand: string; cardNumber: string }): string {
  return [
    compactName(card.playerName),
    startYear(card.yearLabel) ?? "",
    setMatchPhrase(card.setBrand),
    cardNumberKey(card.cardNumber),
  ].join("|");
}

function playerHit(evidence: Evidence, name: string): { score: number } | null {
  const key = compactName(name);
  const hit = evidence.players.find((item) => compactName(item.name) === key);
  if (hit) return hit;
  if (evidence.playerText && compactName(evidence.playerText) === key) return { score: 1 };
  return null;
}

function sameSet(left: string, right: string): boolean {
  const a = setMatchPhrase(left);
  return Boolean(a) && a === setMatchPhrase(right);
}

function setIndex(evidence: Evidence, setBrand: string): number {
  const index = evidence.setNames.findIndex((name) => sameSet(name, setBrand));
  if (index >= 0) return index;
  if (evidence.setText && sameSet(titleCase(evidence.setText), setBrand)) return 0;
  return -1;
}

function copyrightFits(evidence: Evidence, yearLabel: string): boolean {
  const start = startYear(yearLabel);
  const copyright = Number(evidence.copyrightYear);
  return start != null && Boolean(copyright) && (copyright === start || copyright === start + 1);
}

function identityScore(evidence: Evidence, card: Candidate): number {
  let score = 0;
  const hit = playerHit(evidence, card.playerName);
  if (hit) score += 40 * hit.score;
  if (evidence.yearLabel) score += sameSeason(card.yearLabel, evidence.yearLabel) ? 20 : -20;
  else if (copyrightFits(evidence, card.yearLabel)) score += 6;
  const set = setIndex(evidence, card.setBrand);
  if (evidence.setNames.length > 0 || evidence.setText) score += set === 0 ? 20 : set > 0 ? 12 : -10;
  if (evidence.cardNumber) {
    score += cardNumberKey(evidence.cardNumber) === cardNumberKey(card.cardNumber) ? 25 : -25;
  }
  if (evidence.isRookie && card.isRookie) score += 3;
  // The card prints an insert (Instinct): a base catalog row without it is a different card.
  if (evidence.insert && card.catalogId != null) {
    const insert = parallelMatchKey(evidence.insert);
    if (![...card.rowsByParallel.keys()].some((key) => key.includes(insert))) score -= 8;
  }
  return score;
}

type ParallelPick = {
  parallel: string;
  sureness: FieldSureness;
  serialRun: number | null;
  options: ProductParallel[];
  source?: "card" | "sales" | "run";
};

const COLOR_WORDS = new Set(["red", "pink", "magenta", "fuchsia", "purple", "blue", "aqua", "green", "yellow", "orange", "gold", "black", "silver", "bronze", "white"]);

/** "PINK RED" → "Pink/Red" (colors only, the way eBay lists them); "GREEN REFRACTOR" → "Green Refractor". */
export function parallelLabel(colorWords: readonly string[]): string {
  const list = colorWords.flatMap((phrase) => words(phrase));
  // One parallel with its own name, not three colors.
  if (list.filter((word) => word !== "and").join(" ") === "red white blue") return "Red White & Blue";
  if (list.length >= 2 && list.every((word) => COLOR_WORDS.has(word))) return list.map((word) => titleCase(word)).join("/");
  return titleCase(list.join(" "));
}

function checklistFor(
  products: readonly ProductRecord[] | null,
  card: Pick<Candidate, "sport" | "yearLabel" | "setBrand" | "cardNumber">,
  checklists: readonly ChecklistProduct[] | null | undefined = null,
): ProductParallel[] {
  // No set: no list of parallels is this card's. Nothing to pick from beats a made-up list.
  if (!card.setBrand.trim()) return [];
  const insert = insertCode(card, checklists);
  const listed = products?.length ? parallelsIn(products, card.sport, card.yearLabel, card.setBrand, card.cardNumber) : [];
  // An insert (Rookie Code RC-3) has its own parallels: the set's list counts only when its rows name this code's prefix.
  if (insert) return listed.length > 0 && productCovers(products!, card) ? listed : [];
  if (listed.length > 0) return listed;
  // A set family we know (Prizm, Optic, Chrome…) has its real parallels. Any other set gets none:
  // a generic Base, Silver, Refractor, Gold list would be a guess dressed up as a choice.
  return parallelSetFamily(card.setBrand) ? parallelsForSet(card.setBrand).map((name) => ({ name, serialRun: null })) : [];
}

/** A card's versions to pick ("Which version?"): an insert's own list, else its set's. */
export function versionOptionsFor(
  products: readonly ProductRecord[] | null,
  card: Pick<ScanMatch, "sport" | "yearLabel" | "setBrand" | "cardNumber">,
  checklists: readonly ChecklistProduct[] | null | undefined,
): ProductParallel[] {
  return checklistFor(products, card, checklists);
}

/** The checklist puts this card # (a letter code) in an insert section only, never the base set. */
function insertCode(card: Pick<Candidate, "sport" | "yearLabel" | "setBrand" | "cardNumber">, checklists: readonly ChecklistProduct[] | null | undefined): boolean {
  if (!checklists?.length || !/^[a-z]+\d*-?\d/i.test(card.cardNumber.trim())) return false;
  const hits = playersAt(checklists, { yearLabel: card.yearLabel, setBrand: card.setBrand, cardNumber: card.cardNumber, sport: card.sport || undefined });
  return hits.length > 0 && hits.every((hit) => !isBaseSection(hit.section));
}

/** The product's parallel rows name this card #'s prefix (Bowman's BP- rows), so they are this card's. */
function productCovers(products: readonly ProductRecord[], card: Pick<Candidate, "sport" | "yearLabel" | "setBrand" | "cardNumber">): boolean {
  const prefix = /^([a-z]+)/i.exec(card.cardNumber.trim())?.[1]?.toUpperCase() ?? "";
  const product = productForSet(products, card.sport, card.yearLabel, card.setBrand);
  return Boolean(prefix && product?.parallels.some((row) => row.cardPrefixes?.some((item) => item.toUpperCase() === prefix)));
}

/**
 * A slab whose player our list doesn't know has no sport, so no season and no checklist to look the
 * player up in. PSA prints the first year of a season ("2025 PANINI PRIZM" on a 2025-26 basketball
 * card). When the label names a parallel that only one sport's list for that year and set has
 * (Orange Pulsar is only in 2025-26 basketball Prizm), that is the sport. Two sports' lists having
 * it, or none, leaves it open.
 */
function withSportFromParallel(evidence: Evidence, products: readonly ProductRecord[] | null | undefined): Evidence {
  if (!evidence.slab || evidence.sport || evidence.parallelWords.length === 0 || !products?.length) return evidence;
  const setBrand = evidence.setNames[0] ?? "";
  const phrase = productPhrase(setBrand);
  if (!phrase || !evidence.yearLabel) return evidence;
  const sports = new Set<string>();
  for (const product of products) {
    if (!sameSeason(product.yearLabel, evidence.yearLabel) || productPhrase(product.product) !== phrase) continue;
    const list = parallelsIn([product], product.sport, product.yearLabel, product.product, evidence.cardNumber);
    if (coveringLabel(list, evidence.parallelWords).length > 0) sports.add(product.sport);
  }
  return sports.size === 1 ? { ...evidence, sport: [...sports][0] } : evidence;
}

/** Parallels (Refractor, Silver, Holo) arrived in the 1993-94 season: Finest's Refractor was the first. */
const FIRST_PARALLEL_YEAR = 1993;

/**
 * A pre-1993 set we have no parallel list for that year: the general list and the family lists
 * (Donruss Press Proofs, Prizm colors) describe modern products only, so "Which version?" offers
 * Base and Something else.
 */
function vintageWithoutList(
  products: readonly ProductRecord[] | null,
  card: Pick<Candidate, "sport" | "yearLabel" | "setBrand" | "cardNumber">,
): boolean {
  const year = Number(/^(\d{4})/.exec(card.yearLabel.trim())?.[1] ?? Number.NaN);
  if (!(year < FIRST_PARALLEL_YEAR)) return false;
  const listed = products?.length ? parallelsIn(products, card.sport, card.yearLabel, card.setBrand, card.cardNumber) : [];
  return listed.length === 0;
}

/** The parallel's own words all appear in what the card showed. */
function namedBy(option: ProductParallel, shown: readonly string[]): boolean {
  const own = words(parallelMatchKey(option.name));
  return own.length > 0 && own.every((word) => shown.includes(word));
}

function longestNamed(options: ProductParallel[], shown: readonly string[]): ProductParallel[] {
  const named = options.filter((option) => namedBy(option, shown));
  if (named.length <= 1) return named;
  const longest = Math.max(...named.map((option) => words(option.name).length));
  return named.filter((option) => words(option.name).length === longest);
}

/** Words a label adds to a color that the list's name may leave off: "GOLD REFRACTOR" is the list's Gold. */
const LABEL_OPTIONAL_WORDS = new Set(["refractor", "border"]);

/**
 * The list's parallels that are the label's variety, whole: every word of the name is on the
 * label, and the label printed nothing more (bar "Refractor" or "Border" after a color).
 * "ORANGE PULSAR" is not the list's Orange, and "GOLD WAVE" is neither Gold nor Wave.
 */
function coveringLabel(options: ProductParallel[], shown: readonly string[]): ProductParallel[] {
  const covering = options.filter((option) => {
    const own = words(parallelMatchKey(option.name));
    if (own.length === 0 || !own.every((word) => shown.includes(word))) return false;
    const extra = shown.filter((word) => !own.includes(word));
    return extra.every((word) => LABEL_OPTIONAL_WORDS.has(word)) && (extra.length === 0 || own.some((word) => !LABEL_OPTIONAL_WORDS.has(word)));
  });
  if (covering.length <= 1) return covering;
  const longest = Math.max(...covering.map((option) => words(option.name).length));
  return covering.filter((option) => words(option.name).length === longest);
}

/** Finishes a base chrome card already looks like: the border can't tell them apart. */
const CHROME_FINISH = new Set(["SILVER", "REFRACTOR", "HOLO", "PRIZM", "CHROME", "SHIMMER", "MOJO"]);

/**
 * The color every sold listing with this print run names ("GREEN" from
 * "Green Refractor /99" and "Green 61/99"), or "" when they don't agree or
 * none names one. One listing that disagrees leaves it open.
 */
function titleColor(titles: readonly TitleFacts[], run: number | null, border: string | null = null): string {
  const named = titles
    .filter((item) => item.colors.length > 0 && (run == null ? item.runs.length === 0 : item.runs.includes(run)))
    .map((item) => item.colors.flatMap((phrase) => phrase.split(" ")));
  if (named.length === 0) return "";
  // Most of the sales name one parallel: that's it (Pink/Red /299, with one Base /299 listing that's mislabeled).
  const groups = new Map<string, { words: string[]; count: number }>();
  for (const list of named) {
    const key = [...new Set(list)].sort().join(" ");
    const group = groups.get(key) ?? { words: [...new Set(list)], count: 0 };
    group.count += 1;
    groups.set(key, group);
  }
  const ranked = [...groups.values()].sort((a, b) => b.count - a.count);
  if (ranked[0].count >= 2 && ranked[0].count * 2 > named.length) return ranked[0].words.join(" ");
  // All of them share a color: that much is sure (Green from "Green Refractor" and "Green").
  const shared = named[0].filter((word) => named.every((list) => list.includes(word)));
  if (shared.length > 0) return [...new Set(shared)].join(" ");
  // The titles offer a few parallels at this run: the border's color picks one, only when exactly one fits.
  if (border) {
    // A chrome finish (Silver, Refractor, Holo, Prizm) is never told from the border: base chrome looks the same.
    const fits = ranked.filter(
      (group) =>
        !group.words.some((word) => CHROME_FINISH.has(word.toUpperCase())) &&
        group.words.some((word) => word.toLowerCase() === border.toLowerCase()),
    );
    if (fits.length === 1) return fits[0].words.join(" ");
  }
  return "";
}

/** The one print run the sold titles naming this parallel agree on, or null. */
function titleRunFor(titles: readonly TitleFacts[], parallel: string): number | null {
  const own = words(parallel);
  const runs = new Set<number>();
  for (const item of titles) {
    const shown = item.colors.flatMap((phrase) => words(phrase));
    if (!own.every((word) => shown.includes(word))) continue;
    if (item.runs.length !== 1) return null;
    runs.add(item.runs[0]);
  }
  return runs.size === 1 ? [...runs][0] : null;
}

/** "2026" → "2025"; "2025-26" → "2024-25". "" when the label isn't a year. */
export function yearBefore(label: string): string {
  const season = /^(\d{4})-(\d{2})$/.exec(label.trim());
  if (season) return `${Number(season[1]) - 1}-${String((Number(season[2]) + 99) % 100).padStart(2, "0")}`;
  return /^\d{4}$/.test(label.trim()) ? String(Number(label.trim()) - 1) : "";
}

/** How many versions "Which version?" offers, Base included. */
const CLOSEST_VERSIONS = 5;

/**
 * The versions closest to Base on a label that names no parallel, always unnumbered (a numbered
 * card prints its run). First the look-alikes, with no color of their own (Refractor, X-Fractor,
 * Silver, Holo). A set with none of those offers its unnumbered colors instead. Plain names lead
 * ("Refractor" before "Negative Refractor"). Empty when the list has neither: then only Base.
 */
function closestToBase(checklist: readonly ProductParallel[]): ProductParallel[] {
  const spaced = (name: string) => name.trim().split(/\s+/).length;
  const unnumbered = checklist
    .map((option, index) => ({ option, index, kind: parallelSwatch(option.name).kind }))
    .filter(({ option }) => option.serialRun == null && !option.runVaries && parallelMatchKey(option.name) !== "base");
  const lookalike = (kind: string) => kind === "shimmer" || kind === "neutral";
  const pool = unnumbered.some(({ kind }) => lookalike(kind)) ? unnumbered.filter(({ kind }) => lookalike(kind)) : unnumbered;
  const rank = (kind: string) => (kind === "shimmer" ? 0 : 1);
  return pool
    .sort((a, b) => rank(a.kind) - rank(b.kind) || spaced(a.option.name) - spaced(b.option.name) || a.index - b.index)
    .slice(0, CLOSEST_VERSIONS - 1)
    .map(({ option }) => option);
}

function pickParallel(
  evidence: Evidence,
  checklist: ProductParallel[],
  titles: readonly TitleFacts[] = [],
  /** Last year's parallels of the same set: quick picks for a numbered card this year's list can't place. */
  yearAgo: ProductParallel[] = [],
  /** A pre-1993 set with no parallel list: "Which version?" offers Base alone (and Something else). */
  baseOnly = false,
): ParallelPick {
  const runOf = (option: ProductParallel | undefined) => option?.serialRun ?? null;

  if (evidence.slab) {
    // A serial stamped on the label ("432/499", "/99") is the card's run.
    const labelRun = evidence.serial ? Number(evidence.serial.run) : null;
    if (evidence.parallelWords.length === 0) {
      // A numbered card is never Base: with no parallel named, it stays open.
      if (labelRun != null) return { parallel: "", sureness: "unsure", serialRun: labelRun, options: [] };
      const base = checklist.find((option) => parallelMatchKey(option.name) === "base") ?? { name: "Base", serialRun: null };
      // A base label prints no variety line, and neither does one whose variety line didn't read.
      // So we always ask "Which version?", Base first, in every set. Never Base on our say-so.
      return { parallel: "", sureness: "unsure", serialRun: null, options: baseOnly ? [base] : [base, ...closestToBase(checklist)] };
    }
    const named = coveringLabel(checklist, evidence.parallelWords);
    if (named.length === 1) {
      return { parallel: named[0].name, sureness: "sure", serialRun: labelRun ?? runOf(named[0]), options: named };
    }
    // Printed on the label, but not a parallel our lists know whole: keep the label's words.
    const printed = titleCase(evidence.parallelWords.join(" "));
    return { parallel: printed, sureness: "likely", serialRun: labelRun, options: [{ name: printed, serialRun: labelRun }] };
  }

  const run = evidence.serial ? Number(evidence.serial.run) : null;
  // A color word printed on the card wins. Otherwise a clear sold title for this print run can pin one.
  const printedColor = evidence.parallelWords.length > 0;
  // Sold titles may pick a parallel only for a card with a read print run. An unnumbered card's
  // base can look like its Silver/Refractor (Prizm, Optic, Select, Mosaic), so titles never flip it.
  // An autograph or a named variation is never Base either, so titles that agree may name its color.
  const neverBase = run != null || evidence.isAuto || Boolean(evidence.subset);
  // A patch card whose serial wasn't read: its versions differ by run, so a color most titles name
  // (the Red /99 that sold last week) says nothing about this one. Open, never a guess.
  const runMissed = Boolean(evidence.isRelic) && run == null;
  const soldColor = neverBase && !runMissed ? titleColor(titles, run, evidence.border) : "";

  // A printed insert is the card's own name (Instinct), not a guess. Its color comes from the card or a sold title.
  if (evidence.insert) {
    const color = printedColor ? titleCase(evidence.parallelWords.join(" ")) : soldColor ? parallelLabel([soldColor]) : "";
    const name = color ? `${evidence.insert} ${color}` : evidence.insert;
    const options: ProductParallel[] = [{ name, serialRun: run }];
    if (name !== evidence.insert) options.push({ name: evidence.insert, serialRun: run });
    return { parallel: name, sureness: "likely", serialRun: run, options };
  }

  const fitsRun = run == null ? checklist : checklist.filter((option) => option.serialRun === run || option.runVaries);
  if (run != null && fitsRun.length === 1) {
    // The only parallel at this run. Sure once the card's print or its sold titles name it too;
    // on the run alone it is likely, and its sales price from the run's majority.
    const only = fitsRun[0];
    const backed = namedBy(only, evidence.parallelWords) || (Boolean(soldColor) && sameParallelLoosely(parallelLabel([soldColor]), only.name));
    if (backed) return { parallel: only.name, sureness: "sure", serialRun: run, options: fitsRun };
    return { parallel: only.name, sureness: "likely", serialRun: run, options: fitsRun, source: "run" };
  }
  // The card is numbered (15/97) and our list has a few parallels at that run: the photo's border
  // color picks one, only when exactly one of them names that color and nothing printed or sold
  // says otherwise. Likely, never sure: the collector sees it and can change it.
  if (run != null && fitsRun.length > 1 && !printedColor && !soldColor && evidence.border) {
    const border = evidence.border.toLowerCase();
    const colored = fitsRun.filter((option) => words(option.name).includes(border));
    if (colored.length === 1) return { parallel: colored[0].name, sureness: "likely", serialRun: run, options: fitsRun, source: "card" };
  }
  const named = longestNamed(fitsRun, evidence.parallelWords);
  if (named.length === 1) {
    return { parallel: named[0].name, sureness: "likely", serialRun: run ?? runOf(named[0]), options: named };
  }
  // The card prints its parallel ("REFRACTOR" on the back) and its run, and our list has no runs
  // for this set: the printed word is the parallel when it names exactly one on the list.
  if (run != null && fitsRun.length === 0 && printedColor) {
    const printedOnCard = longestNamed(checklist, evidence.parallelWords);
    if (printedOnCard.length === 1 && parallelMatchKey(printedOnCard[0].name) !== "base") {
      const option = { name: printedOnCard[0].name, serialRun: run };
      return { parallel: option.name, sureness: "likely", serialRun: run, options: [option], source: "card" };
    }
  }
  if (!printedColor && soldColor && named.length === 0) {
    const fromList = longestNamed(fitsRun.length > 0 ? fitsRun : checklist, words(soldColor));
    const label = parallelLabel([soldColor]);
    // Titles skip "Border" and "Refractor": "Sky Blue" is the list's Sky Blue Border when only one
    // listed name is the same give or take those words. Never shortened, never picked from two.
    const fuller = (fitsRun.length > 0 ? fitsRun : checklist).filter(
      (option) => sameParallelLoosely(option.name, label) && words(option.name).length > words(label).length,
    );
    const pinned = fromList.length === 1 ? fromList[0].name : fuller.length === 1 ? fuller[0].name : label;
    return { parallel: pinned, sureness: "likely", serialRun: run, options: [{ name: pinned, serialRun: run }], source: "sales" };
  }
  // A numbered card is never Base, and with no checklist run that fits, any color would be a guess:
  // leave it open with no chips. The print run the card showed still shows on the sheet.
  // Then last year's parallels with the same run are offered as quick picks, never preselected.
  // Last year's name gives way to this year's for the same parallel: 2024's "Green Pattern" /99 is
  // 2025's Green Pattern Border, when exactly one name on this year's list is it, give or take Border.
  const thisYearsName = (option: ProductParallel): ProductParallel => {
    const same = checklist.filter((item) => sameParallelLoosely(item.name, option.name));
    return same.length === 1 ? { ...option, name: same[0].name } : option;
  };
  const sameRunLastYear =
    run != null && fitsRun.length === 0 ? yearAgo.filter((option) => option.serialRun === run && parallelMatchKey(option.name) !== "base").map(thisYearsName) : [];
  const pool = run != null && fitsRun.length === 0 ? sameRunLastYear : fitsRun;
  const ordered = [
    ...named,
    // An autograph, a variation and a numbered card are never offered Base.
    ...(neverBase ? [] : pool.filter((option) => !named.includes(option) && parallelMatchKey(option.name) === "base")),
    ...pool.filter((option) => !named.includes(option) && parallelMatchKey(option.name) !== "base"),
  ];
  // The photo's look (border color, rainbow sheen) puts the closest versions first and trims the
  // far colors. It only orders the picker: the parallel stays open, and Base is never chosen for them.
  const looked = evidence.look ? rankVersionsByLook(ordered, evidence.look, { runRead: run != null }) : ordered;
  return { parallel: "", sureness: "unsure", serialRun: run, options: looked.slice(0, MAX_PARALLEL_OPTIONS) };
}

function sureness(evidence: Evidence, card: Candidate, parallel: ParallelPick): ScanMatch["sureness"] {
  const hit = playerHit(evidence, card.playerName);
  const inDirectory = evidence.players.some((item) => compactName(item.name) === compactName(card.playerName));
  const printedOnly = !evidence.slab && !inDirectory && !evidence.playerBothSides;
  // A looked-up player is likely until the collector confirms: the card alone didn't say so.
  const player: FieldSureness =
    !hit ? "unsure" : hit.score === 1 && (inDirectory || !evidence.slab) && !printedOnly && !evidence.lookedUp ? "sure" : "likely";
  const year: FieldSureness =
    evidence.yearLabel && sameSeason(card.yearLabel, evidence.yearLabel)
      ? "sure"
      : copyrightFits(evidence, card.yearLabel)
        ? "likely"
        : "unsure";
  const index = setIndex(evidence, card.setBrand);
  const set: FieldSureness =
    index < 0 ? "unsure" : evidence.slab && !evidence.setText ? "sure" : index === 0 ? "likely" : "unsure";
  const number: FieldSureness =
    evidence.cardNumber && cardNumberKey(evidence.cardNumber) === cardNumberKey(card.cardNumber) ? "sure" : "unsure";
  return { player, year, set, number, parallel: parallel.sureness };
}

function synthesized(evidence: Evidence): Candidate | null {
  const playerName = bestPlayerName(evidence);
  if (!playerName && !evidence.playerOpen) return null;
  const setBrand = evidence.setNames[0] ?? (evidence.setText ? titleCase(evidence.setText) : "");
  // No year on the front: the back's © year is usually the card's year (marked likely, not sure).
  const year = evidence.yearLabel || (evidence.slab || evidence.yearOpen ? "" : evidence.copyrightYear);
  // A clearly printed name with a print run still shows the player, with the set and number open.
  if (!year && !setBrand && !evidence.cardNumber && !(evidence.playerLocked && evidence.serial)) return null;
  const sport = evidence.players[0]?.sport ?? evidence.sport;
  return {
    catalogId: null,
    playerName,
    sport,
    yearLabel: seasonFor(sport, year, setBrand),
    setBrand,
    cardNumber: evidence.cardNumber,
    isRookie: evidence.isRookie,
    rowsByParallel: new Map(),
  };
}

/** Every field the card showed agrees with this catalog card. */
function covers(card: Candidate, built: Candidate): boolean {
  if (compactName(card.playerName) !== compactName(built.playerName)) return false;
  if (built.yearLabel && !sameSeason(card.yearLabel, built.yearLabel)) return false;
  if (built.setBrand && !sameSet(card.setBrand, built.setBrand)) return false;
  if (built.cardNumber && cardNumberKey(card.cardNumber) !== cardNumberKey(built.cardNumber)) return false;
  return true;
}

function candidatesFrom(rows: readonly CatalogCard[], evidence: Evidence): Candidate[] {
  const byIdentity = new Map<string, Candidate>();
  for (const row of rows) {
    if (!playerHit(evidence, row.playerName)) continue;
    // A row whose number is a catalog SKU is junk: it never shows, not even as an alternative.
    if (looksLikeCatalogSku(row.cardNumber)) continue;
    const key = identityKey(row);
    let card = byIdentity.get(key);
    if (!card) {
      card = {
        catalogId: row.id,
        playerName: row.playerName,
        sport: row.sport,
        yearLabel: row.yearLabel,
        setBrand: row.setBrand,
        cardNumber: row.cardNumber,
        isRookie: row.isRookie === true,
        rowsByParallel: new Map(),
      };
      byIdentity.set(key, card);
    }
    const parallelKey = parallelMatchKey(row.parallel || "Base");
    if (!card.rowsByParallel.has(parallelKey)) card.rowsByParallel.set(parallelKey, row.id);
    if (parallelKey === "base") card.catalogId = row.id;
  }
  const candidates = [...byIdentity.values()];
  const built = synthesized(evidence);
  // A printed insert (Instinct) is its own card: a base catalog row doesn't cover it.
  const coveredBy = (card: Candidate) => covers(card, built!) && (!evidence.insert || card.catalogId == null);
  if (built && !candidates.some(coveredBy)) candidates.push(built);
  return candidates;
}

/**
 * Cards named by cached sold listings for the player the card prints. The
 * title gives the year, set, card # and print run, so a card our catalog
 * doesn't have (a Mosaic, an insert) can still be found. Only titles with that
 * player's name count, and only ones that name a year and a set.
 */
function titleCandidates(
  evidence: Evidence,
  titles: readonly SoldTitle[],
  directory: readonly IndexedDirectoryPlayer[],
  checklists: readonly ChecklistProduct[] | null | undefined = null,
): Candidate[] {
  const playerName = bestPlayerName(evidence);
  if (!playerName) return [];
  const sport = evidence.players[0]?.sport ?? evidence.sport;
  const printedNumber = cardNumberKey(evidence.cardNumber);
  const printedRun = evidence.serial ? Number(evidence.serial.run) : null;

  // Every title for this player (and the printed # and run, when read), with or without a year or a set.
  const parsed = titles
    .slice(0, MAX_SOLD_TITLES)
    .map((sold) => (typeof sold?.title === "string" ? sold.title.trim() : ""))
    .filter((title) => title && !TITLE_LOT.test(title) && titleNamesPlayer(title, playerName))
    .map((title) => {
      const read = readRawCardText([title], directory);
      return { title, read, number: cardNumberKey(read.cardNumber), runs: titleRuns(title) };
    })
    .filter((item) => !otherSportTitle(item.read, sport))
    // An autograph code ends in its player's initials: CCS-JW is never a James Cook card.
    .filter((item) => !otherPlayerCode(item.read.cardNumber, playerName))
    .filter((item) => (!printedNumber || !item.number || item.number === printedNumber))
    .filter((item) => printedRun == null || item.runs.length === 0 || item.runs.includes(printedRun));

  // A seller's bare "Topps" is the maker, not the set, when the card is a Bowman one: a Bowman-only
  // code (BP-27) or any matching title that names Bowman.
  const bowmanCard = (number: string) =>
    BOWMAN_ONLY_PREFIXES.has(/^([a-z]+)-/.exec(number)?.[1]?.toUpperCase() ?? "") ||
    parsed.some((item) => item.number === number && item.read.setNames.some((name) => /^bowman/i.test(name)));
  const printedSet = evidence.setNames[0] ?? "";
  // Flagship Bowman prints the BCP Chrome Prospects, and sellers title them "Bowman Chrome Prospects".
  // When the checklist for the Bowman the card printed has this player at this number, it is that card.
  const inPrintedBowman =
    printedSet === "Bowman" &&
    Boolean(evidence.yearLabel && printedNumber && checklists?.length) &&
    playersAt(checklists!, { yearLabel: evidence.yearLabel, setBrand: printedSet, cardNumber: evidence.cardNumber }).some((hit) => namesAgree(hit.player, playerName));
  const titleSet = (item: (typeof parsed)[number]) => {
    const set = item.read.setNames[0] ?? "";
    if (BARE_MAKER_SET.has(set) && bowmanCard(item.number || printedNumber)) return "";
    if (inPrintedBowman && set === "Bowman Chrome") return printedSet;
    // A title for this card's product family ("Bowman U Chrome Sapphire", "Bowman Chrome U") backs the
    // set the card printed: Sapphire is settled separately, by the card or by most of the titles.
    if (printedSet && inSapphireFamily(printedSet) && inSapphireFamily(set)) return printedSet;
    // Sellers shorten it: "Bowman Sapphire", "Bowman Chrome U". Any Bowman title for a Bowman U card,
    // and a Sapphire title by the same maker, is this card's product.
    if (/^bowman u chrome/i.test(printedSet) && /^bowman\b/i.test(set)) return printedSet;
    if (printedSet && inSapphireFamily(printedSet) && SAPPHIRE_WORD.test(item.title) && words(set)[0] === words(printedSet)[0]) return printedSet;
    return set;
  };

  const groups = new Map<string, TitleGroup>();
  for (const item of parsed) {
    const set = titleSet(item);
    if (!set) continue;
    const key = `${setMatchPhrase(set)}|${item.number}`;
    const group: TitleGroup = groups.get(key) ?? { set, number: item.read.cardNumber, years: new Map(), isRookie: false, titles: [], nudge: 0 };
    if (item.read.yearLabel) group.years.set(item.read.yearLabel, (group.years.get(item.read.yearLabel) ?? 0) + 1);
    if (item.read.isRookie) group.isRookie = true;
    group.titles.push(item.title);
    groups.set(key, group);
  }
  if (!printedNumber) settleSplitNumbers(evidence, groups);

  // No title names a set ("Aidan Miller Pink/Red /299 BP-27"): they still count toward the parallel of
  // the card the scan built, for its # and run.
  if (groups.size === 0) return [];
  return [...groups.values()].map((group) => {
    // The year most titles give; titles that skip it still count toward everything else.
    const year = [...group.years.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? (evidence.yearLabel || (evidence.yearOpen ? "" : evidence.copyrightYear));
    const number = cardNumberKey(group.number);
    // Agreement is counted across ALL matching titles for this card: no year, no set, or a maker's
    // bare name on a Bowman card all count; a title naming another set doesn't.
    const facts = parsed
      .filter((item) => !number || !item.number || item.number === number)
      .filter((item) => {
        const set = titleSet(item);
        return !set || sameSet(set, group.set);
      })
      .map((item) => ({ runs: item.runs, colors: item.read.parallelWords, insert: item.read.insert, sapphire: SAPPHIRE_WORD.test(item.title) }));
    return {
      catalogId: null,
      playerName,
      sport,
      yearLabel: seasonFor(sport, year, group.set),
      setBrand: group.set,
      cardNumber: group.number,
      isRookie: group.isRookie,
      rowsByParallel: new Map(),
      titles: facts,
      ...(group.nudge ? { numberNudge: group.nudge } : {}),
      ...(group.openSplit ? { openSplit: true } : {}),
    };
  });
}

/** Sold titles for one set and card # (# "" when they give none). */
type TitleGroup = { set: string; number: string; years: Map<string, number>; isRookie: boolean; titles: string[]; nudge: number; openSplit?: boolean };

/** Titles for one card # count as a second card only with 2+ of them: one is a seller's slip. */
const SPLIT_NUMBER_MIN_TITLES = 2;
const NUMBER_NUDGE = 20;

/**
 * The card printed no # we read, and its sold titles name 2+ cards of this player in one set, each
 * in 2+ titles (Select's Concourse #47 and Club Level #247). How many sold says nothing about which
 * one is in hand. The card picks one when it can: a number alone on its back that one of them has,
 * or, on a slab, the label's variety in only one of them's titles ("CONCOURSE"). Then that one is
 * nudged up and the rest down. Otherwise every one is nudged down and a card with the # open leads:
 * open beats wrong, and the numbers stay under "Or one of these".
 */
function settleSplitNumbers(evidence: Evidence, groups: Map<string, TitleGroup>) {
  const bySet = new Map<string, TitleGroup[]>();
  for (const group of groups.values()) {
    if (!group.number || group.titles.length < SPLIT_NUMBER_MIN_TITLES) continue;
    const phrase = setMatchPhrase(group.set);
    bySet.set(phrase, [...(bySet.get(phrase) ?? []), group]);
  }
  for (const [phrase, split] of bySet) {
    if (split.length < 2) continue;
    let picked = split.filter((group) => evidence.backNumbers.includes(cardNumberKey(group.number)));
    if (picked.length !== 1 && evidence.slab && evidence.parallelWords.length > 0) {
      const says = (title: string) => {
        const titleWords = new Set(words(title));
        return evidence.parallelWords.every((word) => titleWords.has(word));
      };
      picked = split.filter((group) => group.titles.some(says));
    }
    if (picked.length === 1) {
      for (const group of split) group.nudge = group === picked[0] ? NUMBER_NUDGE : -NUMBER_NUDGE;
      continue;
    }
    for (const group of split) group.nudge = -NUMBER_NUDGE;
    const openKey = `${phrase}|`;
    if (!groups.has(openKey)) {
      const years = new Map<string, number>();
      for (const group of split) for (const [year, count] of group.years) years.set(year, (years.get(year) ?? 0) + count);
      groups.set(openKey, { set: split[0].set, number: "", years, isRookie: split.some((group) => group.isRookie), titles: split.flatMap((group) => group.titles), nudge: 0, openSplit: true });
    }
  }
}

/** How far an OCR'd print run can be from the run sold titles agree on (/298 for /299). */
const RUN_MISREAD = 2;

/**
 * The read print run when a sold title backs it. When none does but 2+ titles for this player
 * (and card #, when read) agree on one run within 2 of it, the titles' run: OCR misread a digit.
 * The read run then counts as unsure.
 */
function withAgreedRun(evidence: Evidence, titles: readonly SoldTitle[], directory: readonly IndexedDirectoryPlayer[]): Evidence {
  const playerName = bestPlayerName(evidence);
  if (!evidence.serial || !playerName || titles.length === 0) return evidence;
  const read = Number(evidence.serial.run);
  if (!Number.isInteger(read) || read <= 0) return evidence;
  const printedNumber = cardNumberKey(evidence.cardNumber);
  const runs = titles
    .slice(0, MAX_SOLD_TITLES)
    .map((sold) => (typeof sold?.title === "string" ? sold.title.trim() : ""))
    .filter((title) => title && !TITLE_LOT.test(title) && titleNamesPlayer(title, playerName))
    .filter((title) => !printedNumber || cardNumberKey(readRawCardText([title], directory).cardNumber) === printedNumber)
    .map((title) => titleRuns(title));
  if (runs.some((list) => list.includes(read))) return evidence;
  const counts = new Map<number, number>();
  for (const list of runs) {
    for (const run of new Set(list)) if (run !== read && Math.abs(run - read) <= RUN_MISREAD) counts.set(run, (counts.get(run) ?? 0) + 1);
  }
  const agreed = [...counts.entries()].filter(([, count]) => count >= 2);
  if (agreed.length !== 1) return evidence;
  return { ...evidence, serial: { ...evidence.serial, run: String(agreed[0][0]) }, runUnsure: true };
}

/** Facts from matching titles that name no set and no other card #, for the card the scan built. */
function looseTitleFacts(
  evidence: Evidence,
  titles: readonly SoldTitle[],
  directory: readonly IndexedDirectoryPlayer[],
): TitleFacts[] {
  const playerName = bestPlayerName(evidence);
  const printedNumber = cardNumberKey(evidence.cardNumber);
  if (!playerName || !printedNumber) return [];
  const printedRun = evidence.serial ? Number(evidence.serial.run) : null;
  return titles
    .slice(0, MAX_SOLD_TITLES)
    .map((sold) => (typeof sold?.title === "string" ? sold.title.trim() : ""))
    .filter((title) => title && !TITLE_LOT.test(title) && titleNamesPlayer(title, playerName))
    .map((title) => ({ title, read: readRawCardText([title], directory), runs: titleRuns(title) }))
    .filter((item) => cardNumberKey(item.read.cardNumber) === printedNumber && item.read.setNames.length === 0)
    .filter((item) => printedRun == null || item.runs.includes(printedRun))
    .map((item) => ({ runs: item.runs, colors: item.read.parallelWords, insert: item.read.insert, sapphire: SAPPHIRE_WORD.test(item.title) }));
}

/** Catalog and sold-listing candidates for the same card become one, keeping the catalog row. */
function mergeTitleCandidates(candidates: Candidate[], fromTitles: Candidate[]): Candidate[] {
  let out = [...candidates];
  // The open-# card from split titles says everything the scan's bare card does, and more.
  for (const open of fromTitles.filter((card) => card.openSplit)) {
    out = out.filter((card) => !(card.catalogId == null && !card.titles?.length && covers(open, card)));
  }
  for (const card of fromTitles) {
    const key = identityKey(card);
    const same = out.find((item) => identityKey(item) === key);
    if (same) same.titles = [...(same.titles ?? []), ...(card.titles ?? [])];
    else out.unshift(card);
  }
  return out;
}

/** How much the cached sold listings back this card: more listings, a matching print run, the printed insert. */
function titleScore(evidence: Evidence, card: Candidate): number {
  const titles = card.titles ?? [];
  if (titles.length === 0) return 0;
  let score = Math.min(TITLE_SUPPORT_MAX, TITLE_SUPPORT * titles.length);
  const run = evidence.serial ? Number(evidence.serial.run) : null;
  if (run != null) {
    if (titles.some((item) => item.runs.includes(run))) score += 12;
    else if (titles.every((item) => item.runs.length > 0)) score -= 6;
  }
  if (evidence.insert) {
    score += titles.some((item) => item.insert === evidence.insert) ? 10 : -6;
  }
  return score;
}

/**
 * A printed name we don't know and the card doesn't back: real only when a catalog row or a sold
 * title carries it. With neither, the name is dropped and the player stays open.
 */
function withVerifiedPlayer(evidence: Evidence, rows: readonly CatalogCard[], titles: readonly SoldTitle[]): Evidence {
  if (!evidence.playerUnverified || !evidence.playerText) return evidence;
  const name = titleCase(evidence.playerText);
  const named =
    rows.some((row) => compactName(row.playerName) === compactName(name)) ||
    titles.slice(0, MAX_SOLD_TITLES).some((item) => titleNamesPlayer(item.title, name));
  if (named) return { ...evidence, playerUnverified: false };
  // The name is dropped, not the card: the set, year, # and run it printed still show, with the player open.
  return { ...evidence, playerText: "", playerLocked: false, playerBothSides: false, playerOpen: true };
}

/**
 * A near match (RONDON for Rodon, one or two letters off a roster name) is a guess until something
 * else on the card backs it: the card's own team line is that player's team, or a sold or active
 * title for this card names the player. A title is for this card when it gives the card # the card
 * printed, or, with no # to compare, the same set (and no other year). With neither, the guess is
 * dropped and the player stays open: never the near player, never the misread as a new player.
 * An exact name (accents aside: Rodón is Rodon) is never a guess.
 */
function withBackedNearPlayer(
  evidence: Evidence,
  read: ScanRead,
  titles: readonly SoldTitle[],
  directory: readonly IndexedDirectoryPlayer[],
): Evidence {
  if (!evidence.players.some((hit) => hit.score < 1)) return evidence;
  const cardTeams = read.kind === "raw" ? [read.front, read.back].map((side) => side?.team?.name ?? "").filter(Boolean) : [];
  const printedNumber = cardNumberKey(evidence.cardNumber);
  const printedSet = evidence.setNames[0] ?? "";
  const parsed = titles
    .slice(0, MAX_SOLD_TITLES)
    .map((sold) => (typeof sold?.title === "string" ? sold.title.trim() : ""))
    .filter((title) => title && !TITLE_LOT.test(title))
    .map((title) => ({ title, read: readRawCardText([title], directory) }));
  const titled = (name: string) =>
    parsed.some((item) => {
      if (!titleNamesPlayer(item.title, name) || otherSportTitle(item.read, evidence.sport)) return false;
      const number = cardNumberKey(item.read.cardNumber);
      if (printedNumber && number) return number === printedNumber;
      const set = item.read.setNames[0] ?? "";
      // A maker's bare name ("Topps") is on every card it makes: it never says this is the card.
      if (!printedSet || !set || BARE_MAKER_SET.has(printedSet) || !sameSet(set, printedSet)) return false;
      return !evidence.yearLabel || !item.read.yearLabel || sameSeason(item.read.yearLabel, evidence.yearLabel);
    });
  const backed = (hit: RawPlayerHit) => hit.score === 1 || (Boolean(hit.team) && cardTeams.includes(hit.team!)) || titled(hit.name);
  const players = evidence.players.filter(backed);
  if (players.length === evidence.players.length) return evidence;
  if (players.length > 0) return { ...evidence, players };
  // The guess is dropped, not the card: its set, year, # and run still show, with the player open.
  return { ...evidence, players: [], playerText: "", playerLocked: false, playerBothSides: false, playerUnverified: false, playerOpen: true };
}

/** Fewest matching titles before "most of them" means anything. */
const SAPPHIRE_MIN_TITLES = 2;

/**
 * Most sold titles for this exact card say Sapphire: the same player, the same card # (required)
 * and, on a numbered card, the same print run. Fewer than two such titles is no majority.
 */
function mostTitlesSaySapphire(evidence: Evidence, card: Candidate, titles: readonly SoldTitle[]): boolean {
  const number = cardNumberKey(card.cardNumber);
  if (!card.playerName || !number || evidence.slab) return false;
  const run = evidence.serial ? Number(evidence.serial.run) : null;
  const pattern = new RegExp(`(?:^|[^a-z0-9])${number.replace(/[^a-z0-9]/g, "[^a-z0-9]?")}(?:[^a-z0-9]|$)`, "i");
  const same = titles
    .slice(0, MAX_SOLD_TITLES)
    .map((sold) => (typeof sold?.title === "string" ? sold.title.trim() : ""))
    .filter((title) => title && !TITLE_LOT.test(title) && titleNamesPlayer(title, card.playerName) && pattern.test(title))
    .filter((title) => (run == null ? titleRuns(title).length === 0 : titleRuns(title).includes(run)));
  const sapphire = same.filter((title) => SAPPHIRE_WORD.test(title)).length;
  return same.length >= SAPPHIRE_MIN_TITLES && sapphire * 2 > same.length;
}

export function rankScanMatches(
  read: ScanRead,
  rows: readonly CatalogCard[],
  options: RankOptions,
): ScanMatchResult {
  const evidence: Evidence = withVerifiedPlayer(
    withAgreedRun(
      withBackedNearPlayer(
        withLookedUpPlayer(
          withChecklistNumber(
            withSportFromParallel(evidenceFrom(read, options.directory), options.products),
            options.checklists,
            read.kind === "raw" ? read.front.lines.join(" ") : "",
          ),
          options.soldTitles ?? [],
          options.checklists,
          options.directory,
          read.kind === "raw" ? [...read.front.lines, ...(read.back?.lines ?? [])].join(" ") : "",
        ),
        read,
        options.soldTitles ?? [],
        options.directory,
      ),
      options.soldTitles ?? [],
      options.directory,
    ),
    rows,
    options.soldTitles ?? [],
  );
  // No name was read, but the year, set and card # were: the card still shows, with the player open.
  if (!bestPlayerName(evidence) && !evidence.playerOpen && cardKeyOf(evidence)) evidence.playerOpen = true;
  const fromTitles = evidence.slab && !bestPlayerName(evidence) ? [] : titleCandidates(evidence, options.soldTitles ?? [], options.directory, options.checklists);
  const merged = mergeTitleCandidates(candidatesFrom(rows, evidence), fromTitles);
  if (fromTitles.length === 0 && !(evidence.slab && !bestPlayerName(evidence))) {
    const loose = looseTitleFacts(evidence, options.soldTitles ?? [], options.directory);
    for (const card of merged) {
      if (!card.titles?.length && compactName(card.playerName) === compactName(bestPlayerName(evidence))) card.titles = loose;
    }
  }
  const printedLines = read.kind === "raw" ? [...read.front.lines, ...(read.back?.lines ?? [])] : [];
  const scored = merged.map((found) => {
    let card = found;
    // Sapphire the card didn't print: named only when most sold titles for this player, card # and run say so.
    const sapphireSet = sapphireOf(card.setBrand);
    const fromSales = sapphireSet && mostTitlesSaySapphire(evidence, card, options.soldTitles ?? []) ? sapphireSet : null;
    if (fromSales) card = { ...card, setBrand: fromSales };
    // In these sets "Sapphire" is the product: titles for the other edition don't vote on the parallel,
    // and the word itself is never a color.
    const titles = inSapphireFamily(card.setBrand)
      ? card.titles
          ?.filter((item) => Boolean(item.sapphire) === isSapphireSet(card.setBrand))
          .map((item) => ({ ...item, colors: item.colors.map((phrase) => phrase.replace(/\bsapphire\b/gi, " ").replace(/\s+/g, " ").trim()).filter(Boolean) }))
      : card.titles;
    const lastYear = yearBefore(card.yearLabel);
    const yearAgo = lastYear && options.products?.length ? parallelsIn(options.products, card.sport, lastYear, card.setBrand, card.cardNumber) : [];
    const tierList = tierParallels(checklistFor(options.products, card, options.checklists), printedLines, insertSectionFor(card, options.checklists));
    const parallel = pickParallel(evidence, tierList, titles, yearAgo, vintageWithoutList(options.products, card));
    const inDirectory = evidence.players.some((item) => compactName(item.name) === compactName(card.playerName));
    // A slab label prints no run: when every sold title for this parallel names the same one, use it.
    if (parallel.serialRun == null && parallel.parallel && card.titles?.length) {
      parallel.serialRun = titleRunFor(card.titles, parallel.parallel);
    }
    const parallelBonus = parallel.sureness === "sure" ? 10 : parallel.sureness === "likely" ? 5 : 0;
    const rowId = parallel.parallel ? card.rowsByParallel.get(parallelMatchKey(parallel.parallel)) : undefined;
    // The insert this card # is in: the one the front named, else the checklist's section for it.
    const insertName =
      evidence.insertSection && checklistNumberKey(card.cardNumber) === checklistNumberKey(evidence.cardNumber) ? evidence.insertSection : insertSectionFor(card, options.checklists);
    // An autograph or relic section never names an insert by the # alone: only when the card prints its name.
    const signed = insertName ? null : signedSectionFor(card, options.checklists, printedLines);
    const match: ScanMatch = {
      catalogId: rowId ?? card.catalogId,
      playerName: card.playerName,
      sport: card.sport,
      yearLabel: card.yearLabel,
      setBrand: card.setBrand,
      cardNumber: card.cardNumber,
      parallel: parallel.parallel,
      serialRun: parallel.serialRun,
      serialNo: evidence.serial?.number ?? "",
      isRookie: card.isRookie || evidence.isRookie,
      isAuto: evidence.isAuto || Boolean(signed?.isAuto),
      ...(evidence.isRelic || signed?.isRelic ? { isRelic: true } : {}),
      grade: evidence.grade,
      // Scored and judged as the set the card printed: Sapphire from sales rides on top of it.
      score: identityScore(evidence, found) + titleScore(evidence, found) + parallelBonus + (found.numberNudge ?? 0),
      sureness: sureness(evidence, found, parallel),
      parallelOptions: parallel.options,
      ...(fromSales ? { setSource: "sales" as const } : {}),
      // Asked only on a raw card (a slab's label prints SAPPHIRE when it is one), and only from the
      // year that set first had a Sapphire Edition.
      ...(!evidence.slab && sapphireOptionFor(card.setBrand, card.yearLabel) ? { sapphireOption: sapphireOptionFor(card.setBrand, card.yearLabel)! } : {}),
      ...(evidence.subset ? { subset: evidence.subset } : {}),
      ...(insertName || signed ? { insertName: insertName || signed!.insertName } : {}),
      ...(read.kind === "raw" && [read.front, read.back].some((side) => side?.firstBowman) ? { firstBowman: true } : {}),
      ...(!evidence.slab && !inDirectory && card.playerName && compactName(card.playerName) === compactName(evidence.playerText) ? { playerNew: true } : {}),
      ...(parallel.source ? { parallelSource: parallel.source } : {}),
      ...(evidence.runUnsure ? { runUnsure: true } : {}),
      ...(evidence.lookedUp && compactName(card.playerName) === compactName(evidence.lookedUp.name) ? { playerSource: evidence.lookedUp.source } : {}),
    };
    return match;
  });

  // The card printed this player's name: never show anyone else.
  const locked = evidence.playerLocked ? compactName(bestPlayerName(evidence)) : "";
  const ranked = scored
    .filter((match) => !locked || compactName(match.playerName) === locked)
    .sort((a, b) => b.score - a.score || Number(b.catalogId != null) - Number(a.catalogId != null));
  // The hard guard: a card by another maker than the back signs, or with another card # than the
  // card printed, is never shown, not even as an alternative. None left: open, never a guess.
  const fitting = ranked.filter((match) => !conflictsWithCard(evidence, match));
  const matches = fitting.slice(0, MAX_MATCHES);
  const top = matches[0];
  const settled = Boolean(
    top &&
      top.sureness.player !== "unsure" &&
      (evidence.slab || top.sureness.player === "sure") &&
      top.sureness.year !== "unsure" &&
      top.sureness.set !== "unsure" &&
      top.sureness.number === "sure" &&
      top.sureness.parallel === "sure",
  );
  return { matches, settled, ...(ranked.length > 0 && fitting.length === 0 ? { unpinned: true } : {}) };
}

/** The match names another card # than the one the card printed, a season after its © year, or a set by another maker than the back signs. */
function conflictsWithCard(evidence: Evidence, match: Pick<ScanMatch, "cardNumber" | "setBrand" | "yearLabel" | "sport">): boolean {
  if (evidence.cardNumber && match.cardNumber && checklistNumberKey(match.cardNumber) !== checklistNumberKey(evidence.cardNumber)) return true;
  // A card is never from a season that starts after the year its back was printed (© 2026 is never 2027-28).
  const start = startYear(match.yearLabel);
  if (/^\d{4}$/.test(evidence.copyrightYear) && start != null && start > Number(evidence.copyrightYear)) return true;
  if (!evidence.backMaker || !match.setBrand) return false;
  const maker = setMakerOf(match.setBrand, match.yearLabel, match.sport);
  return Boolean(maker) && maker !== evidence.backMaker;
}

export type MatchScanDeps = {
  directory: readonly IndexedDirectoryPlayer[];
  /** search_cards. Null means the search failed; the card's own read still counts. */
  search: (query: string, signal: AbortSignal) => Promise<CatalogCard[] | null>;
  /** Checklists. A failure falls back to the per-set lists. */
  products: () => Promise<readonly ProductRecord[]>;
  /**
   * Cached eBay sold listings (sold_comps_cache) whose titles name this player.
   * A cache read only: never Trawl, never a live eBay search. Null on failure.
   */
  soldTitles?: (playerName: string, signal: AbortSignal) => Promise<SoldTitle[] | null>;
  /** The checklists for the year and set the scan read. A failure is no lookup: the card's own read still counts. */
  checklists?: (card: ScanChecklistKey) => Promise<readonly ChecklistProduct[]>;
  signal: AbortSignal;
};

/** Searches the catalog (at most 2 calls) and ranks. Null once aborted, e.g. by a retake. */
export async function matchScan(read: ScanRead, deps: MatchScanDeps): Promise<ScanMatchResult | null> {
  const rows = new Map<string, CatalogCard>();
  for (const query of catalogQueriesFor(read, deps.directory)) {
    if (deps.signal.aborted) return null;
    const found = await deps.search(query, deps.signal);
    if (deps.signal.aborted) return null;
    for (const row of found ?? []) rows.set(row.id, row);
  }
  let soldTitles: SoldTitle[] | null = null;
  const player = bestPlayerName(evidenceFrom(read, deps.directory));
  if (player && deps.soldTitles) {
    try {
      soldTitles = await deps.soldTitles(player, deps.signal);
    } catch {
      soldTitles = null;
    }
    if (deps.signal.aborted) return null;
  }
  let products: readonly ProductRecord[] | null = null;
  try {
    products = await deps.products();
  } catch {
    products = null;
  }
  if (deps.signal.aborted) return null;
  let checklists: readonly ChecklistProduct[] | null = null;
  const card = scanChecklistKey(read, deps.directory);
  if (card && deps.checklists) {
    try {
      checklists = await deps.checklists(card);
    } catch {
      checklists = null;
    }
    if (deps.signal.aborted) return null;
  }
  return rankScanMatches(read, [...rows.values()], { directory: deps.directory, products, soldTitles, checklists });
}
