/**
 * What a person reads when something fails. Dropped connections become one
 * plain sentence, database and vendor internals become the caller's own
 * fallback, and messages we wrote ourselves pass through. The raw reason
 * belongs in the console or the error report, never on screen.
 */

export const CONNECT_ERROR = "Can't connect right now. Check your connection and try again.";
export const GENERIC_ERROR = "Something went wrong. Try again.";

const NETWORK =
  /failed to fetch|load failed|networkerror|network request failed|fetch failed|internet connection appears to be offline|err_internet|err_network|timed out|timeout|aborted|abort ?error|offline/i;

const TECHNICAL =
  /supabase|postgres|pgrst|\bjwt\b|violates|row-level security|\brls\b|relation "|column "|syntax error|does not exist|schema cache|duplicate key|null value|permission denied|typeerror|referenceerror|syntaxerror|cannot read propert|undefined|unexpected token|\bjson\b|chunk|\b(?:42|23|22|40|53|57)[0-9A-Z]{3}\b|status code|internal server error|\[object /i;

const AUTH: [RegExp, string][] = [
  [/invalid login credentials/i, "That email and password don't match."],
  [/user already registered/i, "That email already has an account. Try logging in."],
  [/only request this after|rate limit|too many requests/i, "Too many tries. Wait a minute and try again."],
];

/** Longer than this is almost always a stack or a payload, not a sentence. */
const MAX_SHOWN = 160;

function messageOf(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  const message = (error as { message?: unknown } | null)?.message;
  return typeof message === "string" ? message : "";
}

/** A dropped or timed-out request, not an answer from the server. */
export function isNetworkFailure(error: unknown): boolean {
  return NETWORK.test(messageOf(error));
}

export function friendlyError(error: unknown, fallback: string = GENERIC_ERROR): string {
  const message = messageOf(error).trim();
  if (!message) return fallback;
  if (NETWORK.test(message)) return CONNECT_ERROR;
  for (const [pattern, shown] of AUTH) if (pattern.test(message)) return shown;
  if (TECHNICAL.test(message) || message.length > MAX_SHOWN) return fallback;
  return message;
}

/** An action tapped before the app finished starting. Never shown for long: sign-in waits instead. */
export const NOT_READY = "Still getting ready. Try again in a moment.";
