import { contentProblem, normaliseForFilter } from "@/lib/safety/content-filter";

/*
 * Words that keep a real post off the signed-out landing page. Edit this one
 * list to add or remove a word: lowercase, one word or short phrase each.
 *
 * This is on top of the app's own filter (lib/safety/content-filter.ts),
 * which already stops slurs, explicit terms and threats from being posted at
 * all. General swearing is allowed in the app, so it is listed here: the
 * front page is the first thing a visitor sees. Words match whole words
 * only, so names like Dickerson, Hancock or Cassel still pass, and words
 * that are also a player's first name are left off. A post that matches is
 * simply skipped; it stays up in the app.
 */
export const LANDING_BLOCKED_WORDS: readonly string[] = [
  "fuck",
  "fucks",
  "fucked",
  "fucker",
  "fuckers",
  "fuckin",
  "fucking",
  "motherfucker",
  "motherfuckers",
  "motherfucking",
  "wtf",
  "stfu",
  "shit",
  "shits",
  "shitty",
  "shitting",
  "bullshit",
  "ass",
  "asses",
  "asshole",
  "assholes",
  "bitch",
  "bitches",
  "bitching",
  "bastard",
  "bastards",
  "dickhead",
  "piss",
  "pissed",
  "slut",
  "sluts",
  "whore",
  "whores",
  "douche",
  "douchebag",
  "jackass",
  "dumbass",
];

function escape(word: string): string {
  return word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s+");
}

const PATTERN = new RegExp(`(?:^|[^a-z])(?:${LANDING_BLOCKED_WORDS.map(escape).join("|")})(?![a-z])`);

/** True when this text should not be on the landing page: a listed word, or anything the app's own filter stops. */
export function landingTextBlocked(text: string): boolean {
  if (!text) return false;
  if (contentProblem(text)) return true;
  return PATTERN.test(normaliseForFilter(text));
}
