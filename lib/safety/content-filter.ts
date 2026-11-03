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

/**
 * Lowercase ASCII after normalising. `word` entries only match as a whole
 * word, even in usernames, because they're common inside harmless names.
 */
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
  "retard",
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

const LEET: Record<string, string> = {
  "0": "o",
  "1": "i",
  "3": "e",
  "4": "a",
  "5": "s",
  "7": "t",
  "@": "a",
  $: "s",
};

const ZERO_WIDTH = /[­᠎​-‏⁠-⁤﻿]/g;

/** Lowercase, NFKD, no diacritics or zero-width characters, leetspeak mapped. */
export function normaliseForFilter(text: string): string {
  return text
    .replace(ZERO_WIDTH, "")
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[0134578@$]/g, (char) => LEET[char] ?? char);
}

/**
 * Runs of 3 or more of a letter collapse to one ("kyyys" → "kys") and to two
 * ("fagggot" → "faggot"), so stretched words match either spelling.
 */
function collapsedForms(text: string): string[] {
  return [text.replace(/([a-z])\1{2,}/g, "$1"), text.replace(/([a-z])\1{2,}/g, "$1$1")];
}

function entryWord(entry: Entry): string {
  return typeof entry === "string" ? entry : entry.word;
}

const WORD_PATTERN = new RegExp(
  `(?:^|[^a-z])(?:${BLOCKED.map((entry) => entryWord(entry).replace(/ /g, "[^a-z]+")).join("|")})(?=$|[^a-z])`,
);

const SUBSTRINGS = BLOCKED.filter((entry): entry is string => typeof entry === "string").map(
  (entry) => entry.replace(/ /g, ""),
);

function hasBlockedWord(normalised: string): boolean {
  return collapsedForms(normalised).some((form) => WORD_PATTERN.test(form));
}

/** The error to show for text that includes a blocked word, or null. */
export function contentProblem(text: string): string | null {
  if (!text) return null;
  return hasBlockedWord(normaliseForFilter(text)) ? CONTENT_PROBLEM : null;
}

/**
 * Same list, but also matches inside the handle, since usernames have no
 * spaces. Whole-word-only entries still need a boundary such as `_`.
 */
export function usernameProblem(name: string): string | null {
  if (!name) return null;
  const normalised = normaliseForFilter(name);
  if (hasBlockedWord(normalised)) return CONTENT_PROBLEM;
  const squashed = collapsedForms(normalised.replace(/[^a-z]/g, ""));
  return squashed.some((form) => SUBSTRINGS.some((entry) => form.includes(entry)))
    ? CONTENT_PROBLEM
    : null;
}
