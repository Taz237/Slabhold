/**
 * Vouches: the numbers, the copy and the small rules the app shares with the database.
 *
 * The numbers mirror private.vouch_rules() in supabase/migrations/20261127200000_vouches.sql.
 * Change them in both places together (lib/vouches/rules.test.ts reads the SQL and fails if they drift).
 * The database is the judge: everything here only makes the app say the same thing sooner.
 *
 * The few things a profile's trust line needs live in ./core, so a profile doesn't load this file.
 */
import { NO_VOUCHES, VOUCH_BUSY, VOUCH_FAILED, vouchCount, wholeCount as count, type VouchRating, type VouchSummary } from "./core";

/** Both accounts must be this old. */
export const MIN_ACCOUNT_DAYS = 7;
/** Each person's first message to the other must be this old. */
export const MIN_CHAT_HOURS = 24;
/** Longest note or reply. */
export const NOTE_MAX = 280;
/** Shortest note on a neutral or negative vouch. */
export const NOTE_MIN_NON_POSITIVE = 10;
/** Shortest reply. */
export const REPLY_MIN = 1;
/** New vouches per person per rolling 24 hours. Edits don't count. */
export const DAILY_NEW_LIMIT = 10;
/** Most rows in one list_vouches page. */
export const LIST_MAX = 50;
/** Rows the vouches page asks for at a time. */
export const LIST_PAGE = 20;

export * from "./core";

/** "8 vouches", for the line under a voucher's name. */
export function vouchCountLabel(total: number): string {
  return vouchCount(count(total));
}

/** "Vouched by @kev and 2 others you follow": one handle and a count, or nothing. */
export function socialProofLine(summary: Pick<VouchSummary, "followedCount" | "followedSampleUsername"> | null | undefined): string {
  const followed = count(summary?.followedCount ?? 0);
  if (followed === 0) return "";
  const handle = summary?.followedSampleUsername?.replace(/^@/, "").trim();
  if (!handle) return followed === 1 ? "Vouched by 1 person you follow" : `Vouched by ${followed} people you follow`;
  if (followed === 1) return `Vouched by @${handle}, who you follow`;
  const others = followed - 1;
  return `Vouched by @${handle} and ${others} ${others === 1 ? "other" : "others"} you follow`;
}

/** "12 positive · 2 neutral · 0 negative". */
export function breakdownLine(summary: Pick<VouchSummary, "positive" | "neutral" | "negative">): string {
  return `${count(summary.positive)} positive · ${count(summary.neutral)} neutral · ${count(summary.negative)} negative`;
}

/**
 * A note or reply the way the database stores it: a Windows line break becomes a plain one, then
 * spaces, tabs and line breaks come off both ends (the same four characters the SQL trims).
 */
export function cleanVouchText(text: string | null | undefined): string {
  return (text ?? "").replace(/\r\n/g, "\n").replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, "");
}

/**
 * What the character counter shows: the length the database will check. A line break is one
 * character however the keyboard typed it (CRLF counts once), and an emoji counts the way
 * Postgres counts it.
 */
export function vouchTextLength(text: string | null | undefined): number {
  return Array.from(cleanVouchText(text)).length;
}

/** Control characters other than a line break: tab, bell, escape, delete... */
const CONTROL_CHARACTERS = /[\u0000-\u0009\u000b-\u001f\u007f]/;

export type VouchTextProblem = "vouch_note_too_long" | "vouch_note_required" | "vouch_note_chars" | "vouch_word_filter";

function textProblem(text: string | null | undefined, min: number, blocked?: (text: string) => boolean): VouchTextProblem | null {
  const body = cleanVouchText(text);
  const length = Array.from(body).length;
  // The same order as private.clean_vouch_text: length, then characters, then the word filter.
  if (length > NOTE_MAX) return "vouch_note_too_long";
  if (length < min) return "vouch_note_required";
  if (CONTROL_CHARACTERS.test(body)) return "vouch_note_chars";
  if (body && blocked?.(body)) return "vouch_word_filter";
  return null;
}

/** Null when the note can be saved with this rating. `blocked` is the word filter, where the caller has it loaded. */
export function vouchNoteProblem(rating: VouchRating, note: string | null | undefined, blocked?: (text: string) => boolean): VouchTextProblem | null {
  return textProblem(note, rating === "positive" ? 0 : NOTE_MIN_NON_POSITIVE, blocked);
}

/** Null when the reply can be saved. An empty reply is not a problem: it removes the reply. */
export function vouchReplyProblem(reply: string | null | undefined, blocked?: (text: string) => boolean): VouchTextProblem | null {
  if (cleanVouchText(reply) === "") return null;
  return textProblem(reply, REPLY_MIN, blocked);
}

/** Every code the vouch functions put in an error's hint. */
export const VOUCH_HINTS = [
  "vouch_self",
  "vouch_signed_out",
  "vouch_suspended",
  "vouch_blocked",
  "vouch_no_conversation",
  "vouch_conversation_too_new",
  "vouch_too_new_voucher",
  "vouch_too_new_subject",
  "vouch_test_mismatch",
  "vouch_rate_limited",
  "vouch_note_required",
  "vouch_note_too_long",
  "vouch_note_chars",
  "vouch_word_filter",
  "vouch_not_found",
  "vouch_not_yours",
  "vouch_rating",
  "vouch_too_many",
] as const;
export type VouchHint = (typeof VOUCH_HINTS)[number];

export function isVouchHint(value: unknown): value is VouchHint {
  return typeof value === "string" && (VOUCH_HINTS as readonly string[]).includes(value);
}

/** Every string the vouch screens show. One place, so the wording rules can be checked over all of it. */
export const VOUCH_COPY = {
  none: NO_VOUCHES,
  vouch: "Vouch",
  editVouch: "Edit vouch",
  removeVouch: "Remove vouch",
  reply: "Reply",
  editReply: "Edit reply",
  removeReply: "Remove reply",
  sheetTitle: (handle: string) => `Vouch for @${handle}`,
  sheetSub: "How did your deal go?",
  ratings: { positive: "Positive", neutral: "Neutral", negative: "Negative" } satisfies Record<VouchRating, string>,
  notePlaceholder: "What happened? e.g. Shipped fast, card as shown.",
  noteHelper: "Add a short reason so others know what happened.",
  sheetFootnote: (handle: string) => `Everyone can see this on @${handle}'s profile.`,
  post: "Post vouch",
  save: "Save changes",
  removeConfirmTitle: "Remove this vouch?",
  removeConfirmBody: "It comes off their profile right away.",
  replyTitle: "Reply to this vouch",
  replyPlaceholder: "Add your side in a line or two.",
  replyFrom: (handle: string) => `Reply from @${handle}`,
  pageTitle: "Vouches",
  pageMetaTitle: (handle: string) => `Vouches for @${handle}`,
  pageFootnote:
    "Vouches show who's been solid in past deals. Slabhold doesn't handle money or check deals, so use a payment method with buyer protection.",
  howItWorksTitle: "How vouches work",
  howItWorks: [
    "You can vouch for someone 24 hours after you've both messaged each other.",
    `Both accounts need to be ${MIN_ACCOUNT_DAYS} days old.`,
    "One vouch per person. You can edit or remove yours any time.",
    "Neutral and negative vouches need a short reason.",
    "The person you vouch for can post one reply.",
  ],
  backToProfile: "Back to profile",
  filterLabel: "Filter vouches",
  joined: (monthYear: string) => `joined ${monthYear}`,
  lastVouch: (when: string) => `Last vouch ${when}`,
  emptyHiddenTitle: "No vouches to show",
  emptyHidden: "Vouches from accounts you've blocked, or that blocked you, don't show here.",
  unavailable: "That page isn't available",
  edited: "Edited",
  loggedDeal: "Logged deal",
  emptyOther: (handle: string) => `Vouches come from people @${handle} has messaged with about a deal.`,
  emptyOwn: "After a deal, the other collector can vouch for you from your chat.",
  emptyFilter: { positive: "No positive vouches", neutral: "No neutral vouches", negative: "No negative vouches" } satisfies Record<VouchRating, string>,
  filters: { all: "All", positive: "Positive", neutral: "Neutral", negative: "Negative" },
  notifyVouch: "vouched for you",
  notifyReply: "replied to your vouch",
  reportVouch: "Report vouch",
  reportReply: "Report reply",
  hideVouch: "Hide vouch",
  failed: VOUCH_FAILED,
  loadFailed: "Couldn't load vouches. Try again.",
  busy: VOUCH_BUSY,
} as const;

/** What each refusal says. `{handle}` is the other person's handle. */
const HINT_COPY: Record<VouchHint, string> = {
  vouch_self: "You can't vouch for yourself.",
  vouch_signed_out: "Sign in to vouch.",
  vouch_suspended: "Your account can't vouch right now.",
  vouch_blocked: "You can't vouch for this account.",
  vouch_no_conversation: "You can vouch once you've both sent each other a message.",
  vouch_conversation_too_new: "You can vouch 24 hours after you've both messaged.",
  vouch_too_new_voucher: `Your account needs to be ${MIN_ACCOUNT_DAYS} days old to vouch.`,
  vouch_too_new_subject: `{handle}'s account needs to be ${MIN_ACCOUNT_DAYS} days old to get vouches.`,
  vouch_test_mismatch: "You can't vouch for this account.",
  vouch_rate_limited: "You've left a lot of vouches today. Try again tomorrow.",
  vouch_note_required: VOUCH_COPY.noteHelper,
  vouch_note_too_long: `Keep it to ${NOTE_MAX} characters.`,
  vouch_note_chars: "Remove the special characters and try again.",
  vouch_word_filter: "This includes words Slabhold doesn't allow. Edit it and try again.",
  vouch_not_found: "That vouch is unavailable.",
  vouch_not_yours: "Only the person a vouch is about can reply to it.",
  vouch_rating: "Pick positive, neutral or negative.",
  vouch_too_many: VOUCH_COPY.loadFailed,
};

/** The copy for one refusal. With no handle, "{handle}'s account" reads "That account". */
export function vouchHintCopy(hint: VouchHint, handle?: string | null): string {
  const name = handle?.replace(/^@/, "").trim();
  const copy = HINT_COPY[hint];
  return name ? copy.replace("{handle}", `@${name}`) : copy.replace("{handle}'s account", "That account");
}

/** The hint in a database error, when it is one of ours. */
export function vouchHintOf(error: { hint?: string | null } | null | undefined): VouchHint | null {
  return isVouchHint(error?.hint) ? error.hint : null;
}

/** What a failed vouch call says: the hint's copy, else a plain "try again". Never the raw database message. */
export function vouchErrorCopy(error: { hint?: string | null } | null | undefined, handle?: string | null): string {
  const hint = vouchHintOf(error);
  return hint ? vouchHintCopy(hint, handle) : VOUCH_COPY.failed;
}

/** Refusals that hide the Vouch button instead of explaining themselves. */
export function vouchButtonHidden(hint: VouchHint | null): boolean {
  return hint === "vouch_blocked" || hint === "vouch_self" || hint === "vouch_test_mismatch";
}
