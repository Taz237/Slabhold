import { GRADE_QUALIFIERS, SETS, parseYearLabel, resolveGradingCompany } from "@/lib/card-options";

/**
 * Reads the text on a graded slab's label (PSA, BGS, SGC, CGC) into the
 * fields Add card saves. Pure: it takes OCR lines in label order, top to
 * bottom, and never looks anything up. The matcher checks the result
 * against the catalog later, so text it is unsure of stays as printed.
 */

export type SlabLabelRead = {
  /** PSA, BGS, SGC, CGC (or another known grader). Empty when unknown. */
  grader: string;
  /** "10", "9.5". Empty for Authentic or when no grade was read. */
  gradeNumber: string;
  /** OC, MK, ST, PD, OF or MC. */
  gradeQualifier: string;
  /** PSA "AUTHENTIC": graded as real, with no number. */
  authentic: boolean;
  /** Autograph grade on a dual-grade label. */
  autoGrade: string;
  /** As printed, leading zeros kept. Private: never put it in a URL. */
  certNumber: string;
  /** "2018" or "2023-24", as printed. */
  yearLabel: string;
  /** A name from SETS when the label's set words match one. */
  setName: string;
  /** The set words as printed. */
  setText: string;
  /** Without the leading #. */
  cardNumber: string;
  /** The player line as printed. The matcher checks it against the directory. */
  playerText: string;
  /** Parallel or insert words, such as "SILVER PRIZM". */
  varietyText: string;
  isRookie: boolean;
  /** A stamped serial on the label: "432/499", or "/99" (number ""). Null when none. */
  serial: { number: string; run: string } | null;
  /** BGS-style centering, corners, edges and surface lines were read. */
  hasSubgrades: boolean;
  /** The lines left after grader, grade and cert lines are taken out. */
  cardLines: string[];
};

export type SlabLabelOptions = {
  /** A grader the collector picked, used when no grader word is read. */
  graderHint?: string;
  /**
   * How sure the caller is that a line names a player it knows (0 to 1). The label can be read
   * upside down or with a wrapped set line, so the player line is the one that names a player,
   * wherever it sits. Without it (or with no hit), the first line shaped like a name is used.
   */
  playerScore?: (line: string) => number;
};

const MAX_LINES = 60;
const MAX_LINE_LENGTH = 200;

/** Grade words, longest first so "NM-MT+" wins over "NM". */
const DESCRIPTORS = [
  "GEM MINT",
  "GEM-MT",
  "GEM MT",
  "PRISTINE",
  "NM-MT+",
  "NM-MT",
  "NM/MT+",
  "NM/MT",
  "NM MT",
  "EX-MT+",
  "EX-MT",
  "VG-EX+",
  "VG-EX",
  "MINT+",
  "MINT",
  // SGC's short forms: 10 PRI, 10 GM, 9.5 MT+, 9 MT, 8.5 NM/MT+.
  "MT+",
  "MT",
  "GEM",
  "GM",
  "PRI",
  "NM+",
  "NM",
  "EX+",
  "EX",
  "VG+",
  "VG",
  "GOOD+",
  "GOOD",
  "FAIR",
  "FR",
  "POOR",
  "PR",
] as const;

/** The number each grade word stands for, used only when the number was not read. */
const DESCRIPTOR_NUMBERS: Record<string, string> = {
  PRISTINE: "10",
  "GEM MT": "10",
  "MINT+": "9.5",
  MINT: "9",
  "NM-MT+": "8.5",
  "NM-MT": "8",
  "NM+": "7.5",
  NM: "7",
  "EX-MT+": "6.5",
  "EX-MT": "6",
  "EX+": "5.5",
  EX: "5",
  "VG-EX+": "4.5",
  "VG-EX": "4",
  "VG+": "3.5",
  VG: "3",
  "GOOD+": "2.5",
  GOOD: "2",
  FAIR: "1.5",
  FR: "1.5",
  POOR: "1",
  PR: "1",
};

const SUBGRADE_LINE = /^(CENTERING|CORNERS|EDGES|SURFACE)\b/i;
const AUTO_GRADE_LINE = /^AUTO(?:GRAPH)?(?:\s+GRADE)?\s*:?\s*(\S+)$/i;
const BOILERPLATE = /^(CARDS?|GRADING|SERVICES?|AUTHENTICATION|COLLECTIBLES|DNA|INC\.?|LLC)$/i;
const CARD_NUMBER = /(?:#|\bNO\.)\s*([A-Z0-9]+(?:-[A-Z0-9]+)*)/i;
const YEAR_START = /^(\d{4}(?:\s*-\s*\d{2})?)\b\s*(.*)$/;
const GRADE_NUMBER = "(?:10|[1-9](?:\\.5)?)";
/** Four grade numbers in a row: BGS subgrades printed without their words. */
const SUBGRADE_ROW = new RegExp(`^(?:${GRADE_NUMBER}\\s+){3}${GRADE_NUMBER}$`);
/**
 * A grade at the end of a card line, when the label's rows are read across:
 * "LUKA DONCIC GEM MT". Only grade words that can't be card text.
 */
const TRAILING_GRADE = new RegExp(
  `^(.*\\S)\\s+((?:GEM[\\s-]MINT|GEM[\\s-]MT|PRISTINE|NM-MT\\+?|EX-MT\\+?|VG-EX\\+?|MINT\\+?)(?:\\s+${GRADE_NUMBER})?)$`,
  "i",
);
const TRAILING_NUMBER = new RegExp(`^(.*\\S)\\s+(${GRADE_NUMBER})$`);
/** "432/499", "/99", "#/99". A season written 2023/24 is not a serial. */
const LABEL_SERIAL = /(?:#\s*)?(?:(\d{1,4})\s*)?\/\s*(\d{1,4})\b/;
/** PSA shortens Chrome: "BOWMAN CHR.", "TOPPS CHR. UPDATE", "BOWMAN CHR.PROSPECTS". */
const CHROME_SHORT = /\bCHR\b\.?/gi;
/** A rookie mark hanging off the player line: "JUSTIN HERBERT - RC", "ELLY DE LA CRUZ RC". */
const ROOKIE_TAIL = /\s*[-–—]?\s*\b(?:RC|ROOKIE(?:\s+CARD)?)\b\.?\s*$/i;
/** Words a label prints that are never part of a player's name. */
const NOT_NAME_WORDS = new Set([
  ...SETS.flatMap((name) => name.toUpperCase().split(/[\s&-]+/)),
  "PROSPECT", "PROSPECTS", "AUTOGRAPH", "AUTOGRAPHS", "AUTO", "AUTOS", "ROOKIE", "ROOKIES", "RC", "TICKET", "REFRACTOR",
  "XFRACTOR", "SUPERFRACTOR", "PRIZM", "PRIZMS", "SILVER", "GOLD", "RED", "BLUE", "GREEN", "ORANGE", "PURPLE", "PINK",
  "BLACK", "WHITE", "YELLOW", "AQUA", "BRONZE", "HOLO", "MOJO", "WAVE", "SHIMMER", "ICE", "TIGER", "STRIPE", "ZEBRA",
  "CAMO", "DISCO", "HYPER", "SCOPE", "LAZER", "LASER", "NEON", "ATOMIC", "SPECKLE", "SEPIA", "YOUNG", "GUNS", "RATED",
  "1ST", "FIRST", "DEBUT", "BASE", "INSERT", "PARALLEL", "VARIATION", "EDITION", "NUMBERED", "PATCH", "RELIC", "JERSEY",
  "CARD", "CARDS", "SP", "SSP", "THE", "OF", "AND",
]);

/** A line shaped like a person's name: two to four words of letters, none a label word. */
function looksLikeName(line: string): boolean {
  const words = line.replace(ROOKIE_TAIL, "").split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 4) return false;
  return words.every((word) => /^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ.'’-]*$/.test(word) && !NOT_NAME_WORDS.has(word.toUpperCase().replace(/[.'’]/g, "")));
}

function emptyRead(): SlabLabelRead {
  return {
    grader: "",
    gradeNumber: "",
    gradeQualifier: "",
    authentic: false,
    autoGrade: "",
    certNumber: "",
    yearLabel: "",
    setName: "",
    setText: "",
    cardNumber: "",
    playerText: "",
    varietyText: "",
    isRookie: false,
    serial: null,
    hasSubgrades: false,
    cardLines: [],
  };
}

function cleanLines(lines: readonly string[]): string[] {
  const out: string[] = [];
  for (const raw of lines) {
    if (typeof raw !== "string") continue;
    const line = raw.slice(0, MAX_LINE_LENGTH).replace(/\s+/g, " ").trim();
    if (!line) continue;
    out.push(line);
    if (out.length >= MAX_LINES) break;
  }
  return out;
}

/** "1O" and "I0" read for 10. Other tokens pass through. */
function gradeNumberToken(token: string): string {
  const fixed = /^[1Il][O0o]$/.test(token) ? "10" : token;
  if (!/^(10|[1-9](?:\.5)?)$/.test(fixed)) return "";
  return fixed;
}

/** 7 to 12 digits, allowing O for 0 and I or l for 1 when most are real digits. */
function certToken(token: string): string {
  if (!/^[0-9OIl]{7,12}$/.test(token)) return "";
  const digits = token.replace(/[^0-9]/g, "").length;
  if (digits < token.length - 2) return "";
  return token.replace(/O/g, "0").replace(/[Il]/g, "1");
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const DESCRIPTOR_PATTERN = new RegExp(
  `(?:^|\\s)(${DESCRIPTORS.map(escapeRegExp).join("|")})(?=\\s|$)`,
  "i",
);
const QUALIFIER_PATTERN = new RegExp(`(?:^|\\s)\\(?(${GRADE_QUALIFIERS.join("|")})\\)?(?=\\s|$)`, "i");

/** PSA writes GEM MT, others GEM MINT. Spelling variants share one key. */
const DESCRIPTOR_ALIASES: Record<string, string> = {
  "GEM-MT": "GEM MT",
  "NM MT": "NM-MT",
  "NM/MT": "NM-MT",
  "NM/MT+": "NM-MT+",
  MT: "MINT",
  "MT+": "MINT+",
  GM: "GEM MT",
  GEM: "GEM MT",
  PRI: "PRISTINE",
};

function canonicalDescriptor(word: string): string {
  const upper = word.toUpperCase();
  return DESCRIPTOR_ALIASES[upper] ?? upper;
}

type GradeLine = {
  number: string;
  descriptor: string;
  qualifier: string;
  authentic: boolean;
};

/** A line made only of grade words, a grade number and a qualifier. Null otherwise. */
function readGradeLine(line: string): GradeLine | null {
  let rest = ` ${line.toUpperCase()} `;
  let authentic = false;
  if (/\sAUTHENTIC\s/.test(rest)) {
    authentic = true;
    rest = rest.replace(/\sAUTHENTIC\s/, " ");
  }
  let descriptor = "";
  const descriptorMatch = DESCRIPTOR_PATTERN.exec(rest);
  if (descriptorMatch) {
    descriptor = canonicalDescriptor(descriptorMatch[1]);
    rest = rest.replace(descriptorMatch[0], " ");
  }
  let qualifier = "";
  const qualifierMatch = QUALIFIER_PATTERN.exec(rest);
  if (qualifierMatch) {
    qualifier = qualifierMatch[1].toUpperCase();
    rest = rest.replace(qualifierMatch[0], " ");
  }
  let number = "";
  const tokens = rest.trim().split(" ").filter(Boolean);
  const left: string[] = [];
  for (const token of tokens) {
    const value = number ? "" : gradeNumberToken(token);
    if (value) number = value;
    else left.push(token);
  }
  if (left.length > 0) return null;
  if (!number && !descriptor && !qualifier && !authentic) return null;
  return { number, descriptor, qualifier, authentic };
}

function impliedNumber(descriptor: string, grader: string): string {
  if (!descriptor) return "";
  if (descriptor === "GEM MINT") {
    if (grader === "BGS") return "9.5";
    if (grader === "SGC" || grader === "CGC") return "10";
    return "";
  }
  if (descriptor === "PRISTINE") return "10";
  return DESCRIPTOR_NUMBERS[descriptor] ?? "";
}

/** The grader a line names, when the rest of the line is boilerplate, a cert or a grade. */
function readGraderLine(line: string): { grader: string; rest: string } | null {
  const parts = line.split(/[\s/]+/).filter(Boolean);
  if (parts.length === 0) return null;
  const grader = resolveGradingCompany(parts[0]);
  if (!grader) return null;
  const rest = parts
    .slice(1)
    .filter((word) => !BOILERPLATE.test(word))
    .join(" ");
  if (!rest) return { grader, rest };
  if (certFromLine(rest) || readGradeLine(rest)) return { grader, rest };
  return null;
}

function certFromLine(line: string): string {
  const upper = line.toUpperCase();
  if (/\bCERT/.test(upper)) {
    for (const token of upper.replace(/[#:]/g, " ").split(" ")) {
      const cert = certToken(token);
      if (cert) return cert;
    }
    return "";
  }
  const tokens = line.split(" ");
  if (tokens.length !== 1) return "";
  return certToken(tokens[0]);
}

type SetMatch = { setName: string; setText: string; rest: string };

/** Longest SETS name at the start of `text`, counting a leading "Panini" it skipped. */
function matchSet(text: string): SetMatch {
  const words = text.split(" ").filter(Boolean);
  const upper = words.map((word) => word.toUpperCase());
  let best: { name: string; used: number } | null = null;
  for (const name of SETS) {
    const nameWords = name.toUpperCase().split(" ");
    const variants = [nameWords];
    if (nameWords[0] === "PANINI" && nameWords.length > 1) variants.push(nameWords.slice(1));
    for (const variant of variants) {
      for (const skip of upper[0] === "PANINI" && variant[0] !== "PANINI" ? [0, 1] : [0]) {
        const slice = upper.slice(skip, skip + variant.length);
        if (slice.length !== variant.length || slice.some((word, i) => word !== variant[i])) continue;
        const used = skip + variant.length;
        if (!best || used > best.used) best = { name, used };
      }
    }
  }
  if (!best) return { setName: "", setText: words.join(" "), rest: "" };
  return {
    setName: best.name,
    setText: words.slice(0, best.used).join(" "),
    rest: words.slice(best.used).join(" "),
  };
}

export function readSlabLabel(lines: readonly string[], options: SlabLabelOptions = {}): SlabLabelRead {
  const read = emptyRead();
  const gradeLines: GradeLine[] = [];
  const cardLines: string[] = [];
  let logoGrader = "";

  const classify = (line: string) => {
    if (SUBGRADE_LINE.test(line)) {
      read.hasSubgrades = true;
      return;
    }
    const auto = AUTO_GRADE_LINE.exec(line);
    if (auto && gradeNumberToken(auto[1])) {
      read.autoGrade = gradeNumberToken(auto[1]);
      return;
    }
    const graderLine = readGraderLine(line);
    if (graderLine) {
      if (!logoGrader) logoGrader = graderLine.grader;
      if (graderLine.rest) classify(graderLine.rest);
      return;
    }
    const cert = certFromLine(line);
    if (cert) {
      if (!read.certNumber) read.certNumber = cert;
      return;
    }
    if (/\bCERT/i.test(line)) return;
    if (SUBGRADE_ROW.test(line)) {
      read.hasSubgrades = true;
      return;
    }
    const grade = readGradeLine(line);
    if (grade) {
      gradeLines.push(grade);
      return;
    }
    if (line.split(" ").every((word) => BOILERPLATE.test(word))) return;
    // Rows read across: the grade words sit at the end of a card line.
    const tail = TRAILING_GRADE.exec(line);
    const tailGrade = tail ? readGradeLine(tail[2]) : null;
    if (tail && tailGrade) {
      gradeLines.push(tailGrade);
      cardLines.push(tail[1].trim());
      return;
    }
    cardLines.push(line);
  };

  for (const line of cleanLines(lines)) classify(line);

  read.grader =
    logoGrader ||
    resolveGradingCompany(options.graderHint ?? "") ||
    (read.hasSubgrades ? "BGS" : "");

  read.authentic = gradeLines.some((line) => line.authentic);
  read.gradeQualifier = gradeLines.find((line) => line.qualifier)?.qualifier ?? "";
  let numbered = gradeLines.find((line) => line.number);
  const described = gradeLines.find((line) => line.descriptor);
  // Rows read across: the grade's number can end a card line ("SILVER PRIZM 10"). It only counts
  // when it is the number the grade words stand for, so a set's "SERIES 2" is never a grade.
  if (!numbered && described) {
    const expected =
      described.descriptor === "GEM MINT" ? ["10", "9.5"] : [impliedNumber(described.descriptor, read.grader)].filter(Boolean);
    for (let i = 0; i < cardLines.length && !numbered; i += 1) {
      const match = TRAILING_NUMBER.exec(cardLines[i]);
      if (!match || !expected.includes(match[2]) || /\bSERIES$/i.test(match[1])) continue;
      numbered = { number: match[2], descriptor: "", qualifier: "", authentic: false };
      cardLines[i] = match[1].trim();
    }
  }
  read.gradeNumber = numbered?.number ?? impliedNumber(described?.descriptor ?? "", read.grader);
  if (read.authentic && !numbered) read.gradeNumber = "";

  readCardLines(read, cardLines, options);
  return read;
}

function readCardLines(read: SlabLabelRead, lines: string[], options: SlabLabelOptions = {}) {
  read.cardLines = lines;
  const rest = lines.map((line) => line.replace(CHROME_SHORT, "CHROME ").replace(/\s+/g, " ").trim());
  read.isRookie = rest.some((line) => /\b(RC|ROOKIE)\b/i.test(line));

  // A stamped serial ("432/499", "/99"), taken out before anything reads its digits.
  for (let i = 0; i < rest.length && !read.serial; i += 1) {
    const match = LABEL_SERIAL.exec(rest[i]);
    if (!match) continue;
    const number = match[1] ? Number(match[1]) : null;
    const run = Number(match[2]);
    if (!(run > 0) || (number != null && (number < 1 || number > run))) continue;
    read.serial = { number: number == null ? "" : String(number), run: String(run) };
    rest[i] = rest[i].replace(match[0], " ").replace(/\s+/g, " ").trim();
  }

  for (let i = 0; i < rest.length; i += 1) {
    const match = CARD_NUMBER.exec(rest[i]);
    if (!match) continue;
    read.cardNumber = match[1].toUpperCase();
    rest[i] = rest[i].replace(match[0], " ").replace(/\s+/g, " ").trim();
    break;
  }

  let yearRest = "";
  const yearIndex = rest.findIndex((line) => {
    const match = YEAR_START.exec(line);
    if (!match) return false;
    const parsed = parseYearLabel(match[1].replace(/\s+/g, ""));
    if (!parsed) return false;
    read.yearLabel = parsed.yearLabel;
    yearRest = match[2].trim();
    return true;
  });

  const others = rest.map((line, i) => (i === yearIndex ? "" : line));

  // The player line names a player the caller knows, wherever it sits. Otherwise the first
  // line shaped like a name; otherwise the first line, as printed.
  const score = options.playerScore;
  let playerIndex = -1;
  if (score) {
    let best = 0;
    others.forEach((line, i) => {
      const value = line ? score(line) : 0;
      if (value > best) {
        best = value;
        playerIndex = i;
      }
    });
  }
  if (playerIndex < 0) playerIndex = others.findIndex((line) => line && looksLikeName(line));
  if (playerIndex < 0) playerIndex = others.findIndex(Boolean);
  if (playerIndex >= 0) {
    read.playerText = others[playerIndex].replace(ROOKIE_TAIL, "").trim() || others[playerIndex];
    others[playerIndex] = "";
  }

  const variety: string[] = [];
  if (yearIndex >= 0) {
    let set = matchSet(yearRest);
    // The set name can wrap onto the next line ("2023 TOPPS CHROME" / "UPDATE"), or sit under a bare year.
    const next = others[yearIndex + 1] ?? "";
    if (next) {
      const joined = matchSet(`${yearRest} ${next}`.trim());
      const reach = (match: SetMatch) => (match.setName ? match.setText.split(" ").length : 0);
      if (reach(joined) > Math.max(reach(set), yearRest ? yearRest.split(" ").length : 0)) {
        set = joined;
        others[yearIndex + 1] = "";
      }
    }
    if (yearRest || set.setName) {
      read.setName = set.setName;
      read.setText = set.setText;
      if (set.rest) variety.push(set.rest);
    }
  }
  variety.push(...others.filter(Boolean));
  read.varietyText = variety.join(" ");
}

/** True when the lines read like a grading label rather than a raw card. */
export function looksLikeSlabLabel(lines: readonly string[]): boolean {
  const read = readSlabLabel(lines);
  if (read.hasSubgrades) return true;
  return Boolean(read.grader) && Boolean(read.gradeNumber || read.authentic || read.certNumber);
}
