export const CARD_YEAR_MAX = new Date().getFullYear() + 1;
export const CARD_YEAR_MIN = 1900;

export const CARD_YEARS = Array.from(
  { length: CARD_YEAR_MAX - CARD_YEAR_MIN + 1 },
  (_, index) => String(CARD_YEAR_MAX - index),
);

/** Season labels for Basketball / Hockey (current → older). */
export const CARD_SEASONS = Array.from(
  { length: CARD_YEAR_MAX - CARD_YEAR_MIN },
  (_, index) => {
    const end = CARD_YEAR_MAX - index;
    const start = end - 1;
    return `${start}-${String(end).slice(-2)}`;
  },
);

/** Known stored sports. Pokémon remains a stored value and is not offered in pickers. */
export const SPORTS = [
  "Baseball",
  "Basketball",
  "Football",
  "Hockey",
  "Soccer",
  "Pokémon",
  "Other",
];

const PICKER_EXCLUDED_SPORTS = ["Pokémon"];

export function isPickerSport(sport: string) {
  return !PICKER_EXCLUDED_SPORTS.some((item) => item.toLowerCase() === sport.toLowerCase());
}

/** Add a card and Mail Day. A stored value that is not offered is still rendered. */
export const SPORT_PICKER_OPTIONS = SPORTS.filter(isPickerSport);

export const SETS = [
  "Topps",
  "Topps Now",
  "Topps Series 1",
  "Topps Series 2",
  "Topps Update",
  "Topps Chrome",
  "Topps Chrome Update",
  "Topps Chrome Sapphire",
  "Topps Cosmic Chrome",
  "Topps Heritage",
  "Topps Stadium Club",
  "Topps Finest",
  "Topps Allen & Ginter",
  "Bowman",
  "Bowman Chrome",
  "Bowman Chrome Sapphire",
  "Bowman Draft",
  "Bowman Sterling",
  "Bowman's Best",
  "Panini Prizm",
  "Panini Prizm WNBA",
  "Prizm Draft Picks",
  "Panini Select",
  "Panini Mosaic",
  "Panini Optic",
  "Donruss Optic",
  "Panini Donruss",
  "Panini Contenders",
  "Panini National Treasures",
  "Panini Immaculate",
  "Panini Flawless",
  "Panini Chronicles",
  "Panini Spectra",
  "Panini Absolute",
  "Panini Phoenix",
  "Panini Obsidian",
  "Panini Revolution",
  "Panini Instant",
  "Panini Certified",
  "Hoops",
  "Court Kings",
  "Upper Deck",
  "Upper Deck Series 1",
  "Upper Deck Series 2",
  "Upper Deck SP Authentic",
  "Upper Deck The Cup",
  "O-Pee-Chee",
  "Fleer",
  "Skybox",
  "Score",
  "Leaf",
];

export const GRADE_QUALIFIERS = ["OC", "MK", "ST", "PD", "OF", "MC"];

export const RAW_GRADE = "Raw";

export const GRADE_COMPANIES = ["PSA", "BGS", "SGC", "CGC", "TAG", "Other"];

/**
 * Slab names comps already use to spot a graded title.
 * Beckett is an alias of BGS. Gem Studios and Studios stay title filters only.
 */
export const SLAB_TITLE_GRADER_PATTERN =
  "PSA|BGS|SGC|CGC|TAG|Beckett|HGA|CSG|ISA|Gem\\s*Studios|Studios";

/** The repo never lists BVG as its own company, so it saves as BGS. */
const GRADER_ALIASES: Record<string, string> = {
  beckett: "BGS",
  bvg: "BGS",
};

const TITLE_ONLY_GRADERS = new Set(["gem studios", "studios"]);

function canonicalCompanyName(name: string): string {
  const listed = GRADE_COMPANIES.find((item) => item.toLowerCase() === name.toLowerCase());
  return listed ?? name.toUpperCase();
}

const KNOWN_GRADING_COMPANIES: readonly string[] = (() => {
  const fromTitles = SLAB_TITLE_GRADER_PATTERN.split("|").map((part) =>
    part.replace(/\\s\*/g, " "),
  );
  const seen = new Set<string>();
  const companies: string[] = [];
  for (const name of [...GRADE_COMPANIES, ...fromTitles]) {
    const key = name.toLowerCase();
    if (TITLE_ONLY_GRADERS.has(key) || key in GRADER_ALIASES || seen.has(key)) continue;
    seen.add(key);
    companies.push(canonicalCompanyName(name));
  }
  return companies;
})();

/** Companies a grade string may name. Unknown words such as Mint are absent. */
export function knownGradingCompanies(): readonly string[] {
  return KNOWN_GRADING_COMPANIES;
}

/** A known company, or "" when the word is not one. Aliases become BGS. */
export function resolveGradingCompany(token: string): string {
  const key = token.trim().toLowerCase();
  if (!key) return "";
  const alias = GRADER_ALIASES[key];
  if (alias) return alias;
  return KNOWN_GRADING_COMPANIES.find((item) => item.toLowerCase() === key) ?? "";
}

function matchGradingCompany(text: string): string {
  const candidates = [
    ...Object.entries(GRADER_ALIASES).map(([name, company]) => ({ name, company })),
    ...KNOWN_GRADING_COMPANIES.map((company) => ({ name: company, company })),
  ];
  let best: { index: number; length: number; company: string } | null = null;
  for (const item of candidates) {
    const escaped = item.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(?:^|\\b)${escaped}(?=\\s|\\d|\\b|$)`, "i");
    const match = re.exec(text);
    if (!match) continue;
    if (
      !best ||
      match.index < best.index ||
      (match.index === best.index && item.name.length > best.length)
    ) {
      best = { index: match.index, length: item.name.length, company: item.company };
    }
  }
  return best?.company ?? "";
}

function gradeScale(includeNineFive: boolean) {
  const values: string[] = [];
  for (let tenths = 100; tenths >= 10; tenths -= 5) {
    if (tenths === 95 && !includeNineFive) continue;
    values.push(
      tenths % 10 === 0 ? String(tenths / 10) : (tenths / 10).toFixed(1),
    );
  }
  return values;
}

export const GRADE_NUMBERS: Record<string, string[]> = {
  PSA: gradeScale(false),
  BGS: gradeScale(true),
  SGC: gradeScale(true),
  CGC: gradeScale(true),
  TAG: gradeScale(true),
  Other: gradeScale(true),
};

export function optionsWithCurrent(options: string[], current: string) {
  const value = current.trim();
  if (!value) return options;
  if (options.some((option) => option.toLowerCase() === value.toLowerCase())) {
    return options;
  }
  return [value, ...options];
}

/** Grade select options, including a saved number the scale does not list. */
export function gradeSelectOptions(company: string, current: string): string[] {
  const base = GRADE_NUMBERS[company] ?? GRADE_NUMBERS.Other;
  return optionsWithCurrent(base, current);
}

export function formatGrade(company: string, number: string) {
  if (!company) return "Raw";
  if (!number) return company;
  return `${company} ${number}`;
}

export function parseGrade(grade: string) {
  const text = grade.trim();
  if (!text) return { company: "", number: "", recognized: true };
  if (/raw|ungraded|^none$/i.test(text)) {
    return { company: RAW_GRADE, number: "", recognized: true };
  }
  const company = matchGradingCompany(text);
  const match = text.match(/(\d+(?:\.\d+)?)/);
  const number = match ? normalizeGradeNumber(match[1]) : "";
  if (company || number) return { company, number, recognized: true };
  return { company: "", number: "", recognized: false };
}

function normalizeGradeNumber(value: string) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return value;
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(1);
}

/**
 * Accept only YYYY (1900…next calendar year) or YYYY-YY where
 * YY === (YYYY + 1) % 100 (e.g. 2023-24, 1999-00).
 */
export function isValidYear(value: string): boolean {
  return parseYearLabel(value) != null;
}

/** Parse "2023" or "2023-24" into start year + label. */
export function parseYearLabel(value: string): {
  year: number;
  yearLabel: string;
} | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const maxYear = new Date().getFullYear() + 1;
  const season = trimmed.match(/^(\d{4})\s*[-/]\s*(\d{2}|\d{4})$/);
  if (season) {
    const start = Number(season[1]);
    if (!Number.isFinite(start) || start < 1900 || start > maxYear) return null;
    const endRaw = season[2];
    const endTwo =
      endRaw.length === 4 ? endRaw.slice(-2) : endRaw.padStart(2, "0");
    const expected = String((start + 1) % 100).padStart(2, "0");
    if (endTwo !== expected) return null;
    return { year: start, yearLabel: `${start}-${endTwo}` };
  }
  const single = trimmed.match(/^(\d{4})$/);
  if (single) {
    const year = Number(single[1]);
    if (year < 1900 || year > maxYear) return null;
    return { year, yearLabel: trimmed };
  }
  return null;
}

export function defaultYearLabelForSport(sport: string): string {
  if (sport === "Basketball" || sport === "Hockey") {
    return CARD_SEASONS[0] ?? String(CARD_YEAR_MAX);
  }
  return String(CARD_YEAR_MAX);
}

export function yearOptionsForSport(sport: string): string[] {
  if (sport === "Basketball" || sport === "Hockey") {
    return [...CARD_SEASONS, ...CARD_YEARS];
  }
  return [...CARD_YEARS, ...CARD_SEASONS];
}

/** Card number: letters, digits, dashes; strip leading #. */
export function normalizeCardNumberInput(value: string): string {
  return value.replace(/^#/, "").trim().toUpperCase();
}

export function isValidCardNumber(value: string): boolean {
  const n = normalizeCardNumberInput(value);
  if (!n) return false;
  return /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/i.test(n);
}
