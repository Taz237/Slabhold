/**
 * Blocks a short list of objectionable words before a post, reply, DM or
 * profile saves (App Store guideline 1.2). Pure, so the client can run it
 * before any network call.
 *
 * The list is kept small on purpose: severe slurs, explicit sexual terms and
 * self-harm threats. General swearing is allowed. Words are matched on word
 * boundaries so card words and player names like Hancock, Cockrell or
 * Scunthorpe pass.
 */

export const CONTENT_PROBLEM = "This includes words Slabhold doesn't allow. Edit it and try again";

/** Lowercase ASCII after normalising. `word` entries stay whole-word, even in usernames. */
type Entry = string | { word: string };

const BLOCKED: readonly Entry[] = [
  // Racial and ethnic slurs
  "nigger",
  "niggers",
  "nigga",
  "niggas",
  { word: "chink" },
  { word: "chinks" },
  { word: "spic" },
  { word: "spics" },
  { word: "kike" },
  { word: "kikes" },
  { word: "gook" },
  { word: "gooks" },
  "wetback",
  "beaner",
  "raghead",
  "towelhead",
  "sandnigger",
  // Homophobic and transphobic slurs
  "faggot",
  "faggots",
  { word: "fag" },
  { word: "fags" },
  "tranny",
  "trannies",
  "shemale",
  // Ableist slurs
  { word: "retard" },
  { word: "retarded" },
  { word: "retards" },
  "mongoloid",
  // Explicit sexual terms
  "porn",
  "blowjob",
  "handjob",
  "cumshot",
  "creampie",
  "gangbang",
  "dildo",
  "hentai",
  { word: "milf" },
  { word: "pussy" },
  { word: "cunt" },
  { word: "cunts" },
  { word: "cock" },
  { word: "nudes" },
  { word: "rape" },
  { word: "rapist" },
  // Threats and self-harm
  { word: "kys" },
  "kill yourself",
  "kill urself",
  "kill your self",
  "hang yourself",
  "neck yourself",
];

/** Cyrillic and Greek letters that pass for Latin ones. */
const LOOKALIKE = "аaеeоoрpсcуyхxіiјjѕsкkмmтtнhвbοoαaνvιiκkρpτt";
const LEET = "0o1i3e4a5s7t@a$s";

const MAP: Record<string, string> = {};
for (const pairs of [LOOKALIKE, LEET]) {
  for (let i = 0; i < pairs.length; i += 2) MAP[pairs[i]] = pairs[i + 1];
}
const MAPPED = new RegExp(`[${Object.keys(MAP).join("")}]`, "g");

const ZERO_WIDTH = /[­᠎​-‏⁠-⁤﻿]/g;

/** A letter, or `*` standing in for one. */
const NON_LETTER = "[^a-z*]";

/**
 * Lowercase, NFKD, no diacritics or zero-width characters, lookalikes and
 * leetspeak mapped. `!`, `|` and `+` only count as i, l and t before a
 * letter, so "kys!" still ends the word.
 */
export function normaliseForFilter(text: string): string {
  return text
    .replace(ZERO_WIDTH, "")
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(MAPPED, (char) => MAP[char] ?? char)
    .replace(/[!|+](?=[a-z])/g, (char) => (char === "!" ? "i" : char === "|" ? "l" : "t"));
}

/** Runs of single letters split by one non-letter join up: "p.o.r.n" → "porn". */
const SINGLES = new RegExp(`(?<![a-z*])[a-z*](?:${NON_LETTER}[a-z*](?![a-z*]))+`, "g");

/**
 * Every spelling to test: as typed, "ph" as "f", single letters joined, and
 * runs of 3 or more of a letter collapsed to one ("kyyys") and to two ("fagggot").
 */
function forms(text: string): string[] {
  const out = new Set<string>();
  for (const base of [text, text.replace(/ph/g, "f")]) {
    for (const joined of [base, base.replace(SINGLES, (run) => run.replace(/[^a-z*]/g, ""))]) {
      out.add(joined.replace(/([a-z])\1{2,}/g, "$1"));
      out.add(joined.replace(/([a-z])\1{2,}/g, "$1$1"));
    }
  }
  return [...out];
}

/** Inner letters also match `*` (p*rn). Spaces in a phrase match any separators, or none. */
function pattern(entry: string): string {
  return [...entry]
    .map((char, i, all) => {
      if (char === " ") return `${NON_LETTER}*`;
      const edge = i === 0 || i === all.length - 1 || all[i - 1] === " " || all[i + 1] === " ";
      return edge ? char : `[${char}*]`;
    })
    .join("");
}

const words = BLOCKED.filter((entry): entry is { word: string } => typeof entry !== "string");
const plain = BLOCKED.filter((entry): entry is string => typeof entry === "string");

const BLOCKED_PATTERN = new RegExp(
  [
    `(?:^|${NON_LETTER})(?:${words.map((entry) => pattern(entry.word)).join("|")})(?=$|${NON_LETTER})`,
    `(?:^|${NON_LETTER})(?:${plain.filter((entry) => entry.includes(" ")).map(pattern).join("|")})`,
    plain.filter((entry) => !entry.includes(" ")).map(pattern).join("|"),
  ].join("|"),
);

function hasBlockedWord(text: string): boolean {
  return forms(normaliseForFilter(text)).some((form) => BLOCKED_PATTERN.test(form));
}

/** The error to show for text that includes a blocked word, or null. */
export function contentProblem(text: string): string | null {
  return text && hasBlockedWord(text) ? CONTENT_PROBLEM : null;
}

/** Same list, also read with `_`, `.` and digits squeezed out, since handles have no spaces. */
export function usernameProblem(name: string): string | null {
  if (!name) return null;
  if (hasBlockedWord(name)) return CONTENT_PROBLEM;
  const squashed = normaliseForFilter(name).replace(/[^a-z]/g, "");
  return forms(squashed).some((form) => plain.some((entry) => form.includes(entry.replace(/ /g, ""))))
    ? CONTENT_PROBLEM
    : null;
}

/** For the SQL sync test. */
export const BLOCKED_ENTRIES = BLOCKED;
