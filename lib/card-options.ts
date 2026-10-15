export const CARD_YEAR_MAX = 2026;
export const CARD_YEAR_MIN = 1970;

export const CARD_YEARS = Array.from(
  { length: CARD_YEAR_MAX - CARD_YEAR_MIN + 1 },
  (_, index) => String(CARD_YEAR_MAX - index),
);

export const SPORTS = ["Baseball", "Basketball", "Football", "Hockey", "Soccer", "Other"];

export const SETS = [
  "Topps",
  "Topps Series 1",
  "Topps Series 2",
  "Topps Update",
  "Topps Chrome",
  "Topps Chrome Sapphire",
  "Topps Heritage",
  "Topps Stadium Club",
  "Topps Finest",
  "Topps Allen & Ginter",
  "Bowman",
  "Bowman Chrome",
  "Bowman Chrome Sapphire",
  "Bowman Draft",
  "Bowman Sterling",
  "Panini Prizm",
  "Panini Prizm WNBA",
  "Panini Select",
  "Panini Mosaic",
  "Panini Optic",
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

export const PARALLELS = [
  "Base",
  "Silver",
  "Refractor",
  "Gold",
  "Green",
  "Blue",
  "Red",
  "Pink",
  "Purple",
  "Orange",
  "Black",
  "White",
  "Holo",
  "Cracked Ice",
  "Wave",
  "Scope",
  "Shimmer",
  "Mojo",
  "Camo",
  "Tie-Dye",
  "Disco",
  "/299",
  "/199",
  "/150",
  "/99",
  "/75",
  "/50",
  "/25",
  "/10",
  "/5",
  "1/1",
];

export const RAW_GRADE = "Raw / Ungraded";

export const GRADE_COMPANIES = ["PSA", "BGS", "SGC", "CGC", RAW_GRADE];

function gradeScale(includeNineFive: boolean) {
  const values: string[] = [];
  for (let tenths = 100; tenths >= 10; tenths -= 5) {
    if (tenths === 95 && !includeNineFive) continue;
    values.push(tenths % 10 === 0 ? String(tenths / 10) : (tenths / 10).toFixed(1));
  }
  return values;
}

export const GRADE_NUMBERS: Record<string, string[]> = {
  PSA: gradeScale(false),
  BGS: gradeScale(true),
  SGC: gradeScale(true),
  CGC: gradeScale(true),
};

export function optionsWithCurrent(options: string[], current: string) {
  const value = current.trim();
  if (!value) return options;
  if (options.some((option) => option.toLowerCase() === value.toLowerCase())) return options;
  return [value, ...options];
}

export function formatGrade(company: string, number: string) {
  if (!company) return "";
  if (company === RAW_GRADE) return "Raw";
  if (!number) return "";
  return `${company} ${number}`;
}

export function parseGrade(grade: string) {
  const text = grade.trim();
  if (!text) return { company: "", number: "", recognized: true };
  if (/raw|ungraded/i.test(text)) return { company: RAW_GRADE, number: "", recognized: true };
  const company = GRADE_COMPANIES.find(
    (item) => item !== RAW_GRADE && text.toUpperCase().includes(item),
  );
  const match = text.match(/(\d+(?:\.\d+)?)/);
  const number = match ? normalizeGradeNumber(match[1]) : "";
  const allowed = company ? GRADE_NUMBERS[company] : undefined;
  if (company && number && allowed?.includes(number)) {
    return { company, number, recognized: true };
  }
  return { company: "", number: "", recognized: false };
}

function normalizeGradeNumber(value: string) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return value;
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(1);
}
