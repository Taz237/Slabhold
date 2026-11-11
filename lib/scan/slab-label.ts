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
  /** BGS-style centering, corners, edges and surface lines were read. */
  hasSubgrades: boolean;
  /** The lines left after grader, grade and cert lines are taken out. */
  cardLines: string[];
};

export type SlabLabelOptions = {
  /** A grader the collector picked, used when no grader word is read. */
  graderHint?: string;
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
  "NM MT",
  "EX-MT+",
  "EX-MT",
  "VG-EX+",
  "VG-EX",
  "MINT+",
  "MINT",
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
const DESCRIPTOR_ALIASES: Record<string, string> = { "GEM-MT": "GEM MT", "NM MT": "NM-MT" };

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
    const grade = readGradeLine(line);
    if (grade) {
      gradeLines.push(grade);
      return;
    }
    if (line.split(" ").every((word) => BOILERPLATE.test(word))) return;
    cardLines.push(line);
  };

  for (const line of cleanLines(lines)) classify(line);

  read.grader =
    logoGrader ||
    resolveGradingCompany(options.graderHint ?? "") ||
    (read.hasSubgrades ? "BGS" : "");

  read.authentic = gradeLines.some((line) => line.authentic);
  read.gradeQualifier = gradeLines.find((line) => line.qualifier)?.qualifier ?? "";
  const numbered = gradeLines.find((line) => line.number);
  const described = gradeLines.find((line) => line.descriptor);
  read.gradeNumber = numbered?.number ?? impliedNumber(described?.descriptor ?? "", read.grader);
  if (read.authentic && !numbered) read.gradeNumber = "";

  readCardLines(read, cardLines);
  return read;
}

function readCardLines(read: SlabLabelRead, lines: string[]) {
  read.cardLines = lines;
  const rest = [...lines];

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

  const others = rest.filter((line, i) => i !== yearIndex && line);
  const variety: string[] = [];
  if (yearIndex >= 0 && yearRest) {
    const set = matchSet(yearRest);
    read.setName = set.setName;
    read.setText = set.setText;
    if (set.rest) variety.push(set.rest);
  }
  read.playerText = others[0] ?? "";
  variety.push(...others.slice(1));
  read.varietyText = variety.join(" ");
  read.isRookie = /\b(RC|ROOKIE)\b/i.test(read.varietyText);
}

/** True when the lines read like a grading label rather than a raw card. */
export function looksLikeSlabLabel(lines: readonly string[]): boolean {
  const read = readSlabLabel(lines);
  if (read.hasSubgrades) return true;
  return Boolean(read.grader) && Boolean(read.gradeNumber || read.authentic || read.certNumber);
}
