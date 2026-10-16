import { parseGrade, RAW_GRADE } from "@/lib/card-options";
import { filterPriceOutliers } from "./stats";
import type { CleanedSale, TrawlSoldResult } from "./types";

/** Card fields used for comps query + matching. */
export type MatchCard = {
  playerName: string;
  year: number;
  yearLabel?: string;
  setBrand: string;
  cardNumber?: string;
  noNumber?: boolean;
  parallel?: string;
  serialRun?: number | null;
  isAuto?: boolean;
  isRelic?: boolean;
  conditionType?: "raw" | "graded";
  /** Combined grade text e.g. "PSA 10" or "Raw". */
  grade?: string;
  gradeQualifier?: string | null;
  isRookie?: boolean;
};

const TITLE_JUNK =
  /\b(?:lot|lots|proxy|reprint|custom|candidate|worthy|you\s+pick|RP|bundle|complete\s+set|base\s+set|team\s+set|set)\b|\bx[2-9]\b|\b\d+\s*x\b|\b\d+\s*cards?\b/i;

const AUTO_RE = /\b(?:auto|autograph|autographed|signed)\b/i;
const RELIC_RE = /\b(?:patch|relic)\b/i;
const SERIAL_RE = /\/(\d+)\b/;
const TITLE_GRADE_RE =
  /\b(PSA|BGS|SGC|CGC|TAG|HGA)\s*(\d+(?:\.\d+)?)\b/i;
const GRADED_CUE_RE =
  /\b(?:PSA|BGS|SGC|CGC|TAG|HGA|graded|slab)\b|\bGem\s*Mint\b/i;
const TITLE_HASH_NUMBER_RE = /#([A-Za-z0-9]+(?:-[A-Za-z0-9]+)*)/g;

const QUALIFIERS = ["OC", "MK", "ST", "PD", "OF", "MC"] as const;

/** Competing / sibling product lines for family exclusion. */
const SET_FAMILIES: { family: string; members: string[] }[] = [
  {
    family: "topps",
    members: [
      "topps now",
      "topps chrome",
      "topps chrome update",
      "topps cosmic chrome",
      "topps update",
      "topps heritage",
      "topps stadium club",
      "topps finest",
      "topps allen & ginter",
      "topps series 1",
      "topps series 2",
    ],
  },
  {
    family: "prizm",
    members: ["prizm draft picks", "prizm wnba", "fast break", "monopoly prizm"],
  },
  {
    family: "select",
    members: ["select"],
  },
  {
    family: "optic",
    members: ["donruss optic", "optic"],
  },
  {
    family: "bowman",
    members: [
      "bowman chrome",
      "bowman chrome sapphire",
      "bowman draft",
      "bowman sterling",
      "bowman's best",
    ],
  },
];

const SET_KEYWORDS = [
  "select",
  "mosaic",
  "optic",
  "donruss",
  "contenders",
  "national treasures",
  "immaculate",
  "flawless",
  "chronicles",
  "spectra",
  "absolute",
  "phoenix",
  "obsidian",
  "revolution",
  "hoops",
  "court kings",
  "monopoly",
  "prizm",
  "bowman",
  "topps chrome",
  "topps now",
  "topps cosmic",
  "topps heritage",
  "topps update",
  "topps",
  "upper deck",
  "fleer",
  "skybox",
  "score",
  "leaf",
  "panini instant",
  "panini certified",
  "donruss optic",
  "prizm draft picks",
  "bowman's best",
] as const;

const PARALLEL_KEYWORDS = [
  "silver",
  "holo",
  "refractor",
  "gold",
  "green",
  "blue",
  "red",
  "pink",
  "purple",
  "orange",
  "black",
  "white",
  "cracked ice",
  "wave",
  "scope",
  "shimmer",
  "mojo",
  "camo",
  "tie-dye",
  "disco",
] as const;

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function normalizeCardNumber(value: string | undefined | null): string {
  return (value ?? "").replace(/^#/, "").trim().toUpperCase();
}

export function yearLabelOf(card: MatchCard): string {
  const label = (card.yearLabel ?? "").trim();
  if (label) return label;
  if (card.year > 0) return String(card.year);
  return "";
}

export function startYearOf(card: MatchCard): string {
  const label = yearLabelOf(card);
  const match = label.match(/^(\d{4})/);
  return match ? match[1] : String(card.year);
}

function parallelIsBase(parallel?: string): boolean {
  const p = (parallel ?? "").trim().toLowerCase();
  return !p || p === "base";
}

function isRawCard(card: MatchCard): boolean {
  if (card.conditionType === "raw") return true;
  if (card.conditionType === "graded") return false;
  const parsed = parseGrade(card.grade ?? "");
  if (parsed.company === RAW_GRADE) return true;
  if (!parsed.company && !card.grade?.trim()) return true;
  return false;
}

/**
 * Human-readable comps search / preview line.
 * e.g. "2023-24 Panini Prizm #136 Victor Wembanyama RC, Base, PSA 10"
 */
export function buildCompsQuery(card: MatchCard): string {
  const year = yearLabelOf(card);
  const set = card.setBrand.trim();
  const player = card.playerName.trim();
  const num = normalizeCardNumber(card.cardNumber);
  const numberPart =
    !card.noNumber && num ? `#${num}` : "";
  const parallel = (card.parallel ?? "").trim() || "Base";
  const serial =
    card.serialRun != null && card.serialRun > 0 ? `/${card.serialRun}` : "";
  const gradePart = (() => {
    if (isRawCard(card)) return "Raw";
    const g = (card.grade ?? "").trim();
    if (g && !/^raw/i.test(g)) return g;
    return "";
  })();
  const qualifier = (card.gradeQualifier ?? "").trim().toUpperCase();
  const playerPart = [player, card.isRookie ? "RC" : ""].filter(Boolean).join(" ");

  const head = [year, set, numberPart, playerPart].filter(Boolean).join(" ");
  const tail = [
    parallelIsBase(parallel) ? "Base" : parallel,
    serial,
    card.isAuto ? "Auto" : "",
    card.isRelic ? "Patch" : "",
    gradePart,
    qualifier,
  ]
    .filter(Boolean)
    .join(", ");

  return [head, tail].filter(Boolean).join(", ").replace(/\s+/g, " ").trim();
}

/** Trawl search string (space-joined, no commas). */
export function buildSoldSearchQuery(card: MatchCard): string {
  const year = yearLabelOf(card);
  const set = card.setBrand.trim();
  const player = card.playerName.trim();
  const num = normalizeCardNumber(card.cardNumber);
  const numberPart = !card.noNumber && num ? `#${num}` : "";
  const parallel = (card.parallel ?? "").trim();
  const parallelPart =
    parallel && !parallelIsBase(parallel) ? parallel : "";
  const serial =
    card.serialRun != null && card.serialRun > 0
      ? `/${card.serialRun}`
      : "";
  const gradePart = isRawCard(card)
    ? ""
    : (card.grade ?? "").trim().replace(/^raw.*/i, "");

  return [year, set, player, numberPart, parallelPart, serial, gradePart]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export function titleHashCardNumbers(title: string): string[] {
  const out: string[] = [];
  TITLE_HASH_NUMBER_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TITLE_HASH_NUMBER_RE.exec(title)) !== null) {
    out.push(match[1].toUpperCase());
  }
  return out;
}

export function titleHasCardNumber(
  title: string,
  cardNumber?: string,
): boolean {
  const num = normalizeCardNumber(cardNumber);
  if (!num) return false;

  const hashTokens = titleHashCardNumbers(title);
  if (hashTokens.length > 0) {
    return hashTokens.some((token) => token === num);
  }

  const escaped = escapeRegExp(num);
  const re = new RegExp(`(?<![\\w#])${escaped}\\b`, "i");
  return re.test(title);
}

export function titleHasPlayer(title: string, playerName: string): boolean {
  const name = playerName.trim();
  if (!name) return true;
  const lower = title.toLowerCase();
  if (lower.includes(name.toLowerCase())) return true;
  const parts = name.split(/\s+/).filter(Boolean);
  const last = parts[parts.length - 1];
  if (!last || last.length < 2) return false;
  const re = new RegExp(`\\b${escapeRegExp(last)}\\b`, "i");
  return re.test(title);
}

export function titleHasYear(title: string, card: MatchCard): boolean {
  const start = startYearOf(card);
  const season = yearLabelOf(card);
  if (season.includes("-") && title.includes(season)) return true;
  const re = new RegExp(`\\b${escapeRegExp(start)}\\b`);
  return re.test(title);
}

function normalizeSetToken(value: string): string {
  return value
    .toLowerCase()
    .replace(/\bpanini\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function setMatchPhrase(setBrand?: string): string {
  const raw = (setBrand ?? "").trim();
  if (!raw) return "";
  const withoutPanini = normalizeSetToken(raw);
  return withoutPanini || raw.toLowerCase();
}

export function titleHasSetName(title: string, setBrand?: string): boolean {
  const phrase = setMatchPhrase(setBrand);
  if (!phrase) return true;
  const re = new RegExp(
    `\\b${escapeRegExp(phrase).replace(/\s+/g, "\\s+")}\\b`,
    "i",
  );
  return re.test(title);
}

/**
 * Family logic: base "Topps" excludes Now/Chrome/Update/etc.
 * "Topps Now" requires Now. Same idea for Prizm/Select/Optic families.
 */
export function titleNamesWrongSet(title: string, setBrand?: string): boolean {
  const cardSet = normalizeSetToken(setBrand ?? "");
  const lower = title.toLowerCase();

  for (const keyword of SET_KEYWORDS) {
    if (cardSet.includes(keyword)) continue;
    const re = new RegExp(
      `\\b${escapeRegExp(keyword).replace(/\s+/g, "\\s+")}\\b`,
      "i",
    );
    if (re.test(lower)) return true;
  }

  for (const { family, members } of SET_FAMILIES) {
    const cardIsBaseFamily =
      cardSet === family ||
      cardSet === `panini ${family}` ||
      (family === "topps" && cardSet === "topps");
    if (!cardIsBaseFamily) continue;
    for (const member of members) {
      if (cardSet.includes(member)) continue;
      const re = new RegExp(
        `\\b${escapeRegExp(member).replace(/\s+/g, "\\s+")}\\b`,
        "i",
      );
      if (re.test(lower)) return true;
    }
  }

  // Topps Now must require "now"
  if (/\btopps\s+now\b/i.test(cardSet) || cardSet === "topps now") {
    if (!/\bnow\b/i.test(lower)) return true;
  }

  return false;
}

export function titleHasDisallowedParallel(
  title: string,
  parallel?: string,
): boolean {
  const lower = title.toLowerCase();
  const allowed = (parallel ?? "").trim().toLowerCase();
  const base = parallelIsBase(parallel);

  for (const keyword of PARALLEL_KEYWORDS) {
    const re = new RegExp(`\\b${escapeRegExp(keyword)}\\b`, "i");
    if (!re.test(lower)) continue;
    if (base) return true;
    if (allowed !== keyword && !allowed.includes(keyword)) return true;
  }

  if (!base && allowed) {
    const word = allowed.replace(/^\/\d+$/, "").trim();
    if (word && !PARALLEL_KEYWORDS.includes(word as (typeof PARALLEL_KEYWORDS)[number])) {
      const re = new RegExp(`\\b${escapeRegExp(word)}\\b`, "i");
      if (!re.test(lower)) return true;
    } else if (word) {
      const re = new RegExp(`\\b${escapeRegExp(word)}\\b`, "i");
      if (!re.test(lower)) return true;
    }
  }

  return false;
}

export function titleSerialOk(
  title: string,
  serialRun?: number | null,
): boolean {
  const match = title.match(SERIAL_RE);
  if (serialRun != null && serialRun > 0) {
    if (!match) return false;
    return Number(match[1]) === serialRun;
  }
  // Card has no serial run → exclude any /NN serial in title
  return !match;
}

export function titleLooksExcluded(title: string): boolean {
  return TITLE_JUNK.test(title);
}

export function parseGradeFromTitle(
  title: string,
): { grader: string; grade: string } | null {
  const match = title.match(TITLE_GRADE_RE);
  if (!match) return null;
  return { grader: match[1].toUpperCase(), grade: match[2] };
}

function gradingDetailsCueText(result: TrawlSoldResult): string {
  const details = result.details?.grading;
  if (!details) return "";
  return [details.grader, details.grade, details.condition]
    .filter((part) => part != null && String(part).trim() !== "")
    .join(" ");
}

export function listingLooksProfessionallyGraded(
  result: TrawlSoldResult,
): boolean {
  const details = result.details?.grading;
  if (details?.graded === true) return true;
  if (details?.grader?.trim()) return true;
  if (details?.grade != null && String(details.grade).trim() !== "") {
    return true;
  }
  if (GRADED_CUE_RE.test(result.title)) return true;
  if (GRADED_CUE_RE.test(gradingDetailsCueText(result))) return true;
  return false;
}

export function resolveListingGrade(result: TrawlSoldResult): {
  grader: string | null;
  grade: string | null;
} {
  const details = result.details?.grading;
  const grader = details?.grader?.trim() || null;
  const grade =
    details?.grade != null && String(details.grade).trim() !== ""
      ? String(details.grade).trim()
      : null;

  if (grader && grade) {
    return { grader, grade };
  }

  const fromTitle = parseGradeFromTitle(result.title);
  if (fromTitle) return fromTitle;
  return { grader: null, grade: null };
}

function titleHasQualifier(title: string, qualifier: string): boolean {
  const q = qualifier.trim().toUpperCase();
  if (!q) return false;
  return new RegExp(`\\b${escapeRegExp(q)}\\b`, "i").test(title);
}

function titleHasAnyQualifier(title: string): boolean {
  return QUALIFIERS.some((q) => titleHasQualifier(title, q));
}

export function gradesMatchCard(
  card: MatchCard,
  detailsGrader: string | null | undefined,
  detailsGrade: string | null | undefined,
  title: string,
): boolean {
  if (isRawCard(card)) {
    // Raw cards reject any professional grader+grade in details or title.
    if (detailsGrader?.trim() && detailsGrade != null && String(detailsGrade).trim() !== "") {
      return false;
    }
    if (parseGradeFromTitle(title)) return false;
    return !GRADED_CUE_RE.test(title);
  }

  const parsed = parseGrade(card.grade ?? "");
  if (!parsed.company || parsed.company === RAW_GRADE || !parsed.number) {
    return false;
  }
  if (!detailsGrader || detailsGrade == null || detailsGrade === "") {
    return false;
  }
  return (
    detailsGrader.trim().toLowerCase() === parsed.company.toLowerCase() &&
    detailsGrade.trim().toLowerCase() === parsed.number.toLowerCase()
  );
}

/** Legacy helper used by older tests — prefer gradesMatchCard. */
export function gradesMatch(
  cardGrade: string | undefined,
  detailsGrader: string | null | undefined,
  detailsGrade: string | null | undefined,
): boolean {
  return gradesMatchCard(
    { playerName: "", year: 0, setBrand: "", grade: cardGrade },
    detailsGrader,
    detailsGrade,
    "",
  );
}

export function titleMatchesCard(title: string, card: MatchCard): boolean {
  if (titleLooksExcluded(title)) return false;
  if (card.playerName.trim() && !titleHasPlayer(title, card.playerName)) {
    return false;
  }
  if (
    (card.yearLabel?.trim() || card.year > 0) &&
    !titleHasYear(title, card)
  ) {
    return false;
  }
  if (!titleHasSetName(title, card.setBrand)) return false;
  if (titleNamesWrongSet(title, card.setBrand)) return false;

  const num = normalizeCardNumber(card.cardNumber);
  if (!card.noNumber) {
    if (!num) return false;
    if (!titleHasCardNumber(title, num)) return false;
  }

  if (titleHasDisallowedParallel(title, card.parallel)) return false;
  if (!titleSerialOk(title, card.serialRun)) return false;

  if (card.isAuto) {
    if (!AUTO_RE.test(title)) return false;
  } else if (AUTO_RE.test(title)) {
    return false;
  }

  if (card.isRelic) {
    if (!RELIC_RE.test(title)) return false;
  } else if (RELIC_RE.test(title)) {
    return false;
  }

  if (isRawCard(card) && GRADED_CUE_RE.test(title)) return false;

  const qualifier = (card.gradeQualifier ?? "").trim().toUpperCase();
  if (qualifier) {
    if (!titleHasQualifier(title, qualifier)) return false;
  } else if (titleHasAnyQualifier(title)) {
    return false;
  }

  return true;
}

function normalizeSoldAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString();
}

/** Expand one Trawl result into cleaned sales after match filters. */
export function cleanMatchedResult(
  result: TrawlSoldResult,
  card: MatchCard,
): CleanedSale[] {
  const details = result.details ?? null;
  if (details?.listing_state === "removed") return [];
  if (!titleMatchesCard(result.title, card)) return [];

  if (isRawCard(card) && listingLooksProfessionallyGraded(result)) {
    return [];
  }

  const resolved = resolveListingGrade(result);
  const { grader, grade } = resolved;

  if (!isRawCard(card)) {
    if (!grader || grade == null || grade === "") return [];
  }

  if (!gradesMatchCard(card, grader, grade, result.title)) return [];

  const url = result.item_link || details?.item_link || "";
  const currency = result.currency ?? null;

  const sales = details?.sales;
  if (Array.isArray(sales) && sales.length > 0) {
    const bestOfferPrice =
      details?.best_offer_accepted && typeof details.sale_price === "number"
        ? details.sale_price
        : null;

    return sales.map((sale) => ({
      itemId: result.item_id,
      title: result.title,
      price: bestOfferPrice ?? sale.sale_price,
      currency: sale.currency ?? currency,
      soldAt: normalizeSoldAt(sale.date_sold),
      grader,
      grade,
      url,
    }));
  }

  const price =
    details?.best_offer_accepted && typeof details.sale_price === "number"
      ? details.sale_price
      : result.sale_price;

  return [
    {
      itemId: result.item_id,
      title: result.title,
      price,
      currency,
      soldAt: normalizeSoldAt(result.date_sold),
      grader,
      grade,
      url,
    },
  ];
}

export function dedupeSales(sales: CleanedSale[]): CleanedSale[] {
  const seen = new Set<string>();
  const out: CleanedSale[] = [];
  for (const sale of sales) {
    const title = sale.title.toLowerCase().replace(/\s+/g, " ").trim();
    const day = sale.soldAt.slice(0, 10);
    const key = `${title}|${sale.price}|${day}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(sale);
  }
  return out;
}

/**
 * Shared comps filter used by /api/comps/sold and refreshCardValue.
 * Accepts raw Trawl results (preferred) or already-cleaned sales (cache re-filter).
 */
export function filterComps(
  card: MatchCard,
  comps: TrawlSoldResult[] | CleanedSale[],
): CleanedSale[] {
  if (!comps.length) return [];

  const first = comps[0] as TrawlSoldResult | CleanedSale;
  const isTrawl = "sale_price" in first && "item_id" in first;

  let sales: CleanedSale[];
  if (isTrawl) {
    sales = (comps as TrawlSoldResult[]).flatMap((r) =>
      cleanMatchedResult(r, card),
    );
  } else {
    // Re-filter cached CleanedSale rows against current rules
    sales = (comps as CleanedSale[]).filter((sale) => {
      const synthetic: TrawlSoldResult = {
        title: sale.title,
        sale_price: sale.price,
        shipping_price: null,
        currency: sale.currency ?? "$",
        condition: "",
        condition_raw: null,
        date_sold: sale.soldAt,
        buying_format: "",
        item_id: sale.itemId,
        item_link: sale.url,
        image_url: null,
        details: {
          listing_state: "sold",
          grading: {
            graded: Boolean(sale.grader && sale.grade),
            grader: sale.grader,
            grade: sale.grade,
            condition: null,
          },
          sales: [
            {
              date_sold: sale.soldAt,
              sale_price: sale.price,
              currency: sale.currency,
            },
          ],
        },
      };
      return cleanMatchedResult(synthetic, card).length > 0;
    });
  }

  return filterPriceOutliers(dedupeSales(sales));
}

/** @deprecated Use filterComps — kept as alias while callers migrate. */
export function prepareSales(
  results: TrawlSoldResult[],
  card: MatchCard,
): CleanedSale[] {
  return filterComps(card, results);
}

export function isLowConfidence(count: number): boolean {
  return count < 5;
}
