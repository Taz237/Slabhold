import { usernameFieldError } from "@/lib/auth/signup-fields";
import { normalizeUsername, usernameError } from "@/lib/social/usernames";
import { TAKEN_USERNAME } from "@/lib/social/username-taken";

/** Debounce for the live username check. */
export const USERNAME_CHECK_DELAY = 350;

/** Suggestions looked up after a taken name, at most. */
const SUGGESTION_LOOKUPS = 3;

const MAX_LENGTH = 20;

export type UsernameCheck =
  | { status: "idle" }
  | { status: "invalid"; message: string }
  | { status: "available"; value: string }
  | { status: "taken"; value: string; message: string; suggestion: string | null }
  | { status: "unknown"; value: string };

/** True when someone already holds this lowercase handle. */
export type UsernameLookup = (username: string) => Promise<boolean>;

function withSuffix(base: string, suffix: string): string {
  return `${base.slice(0, MAX_LENGTH - suffix.length)}${suffix}`;
}

/** Nearby names that pass the username rules, in the order we offer them. */
export function usernameCandidates(raw: string): string[] {
  const base = normalizeUsername(raw).replace(/[^a-z0-9_]/g, "").slice(0, MAX_LENGTH);
  if (!base) return [];
  const names = [
    withSuffix(base, "_cards"),
    withSuffix(base, "_pc"),
    withSuffix(base, "_hobby"),
    withSuffix(base, "1"),
    withSuffix(base, "2"),
    withSuffix(base, "_23"),
  ];
  return [...new Set(names)].filter((name) => name !== base && usernameError(name) === null);
}

async function firstFree(raw: string, isTaken: UsernameLookup): Promise<string | null> {
  for (const name of usernameCandidates(raw).slice(0, SUGGESTION_LOOKUPS)) {
    if (!(await isTaken(name))) return name;
  }
  return null;
}

/**
 * The live check behind "available ✓". Rules first (no lookup), then one
 * lookup, then up to a few more for a suggestion. A failed lookup returns
 * "unknown" so the flow can continue; sign-up still checks on the server.
 */
export async function checkUsername(raw: string, isTaken: UsernameLookup): Promise<UsernameCheck> {
  const value = normalizeUsername(raw);
  if (!value) return { status: "idle" };
  const rule = usernameFieldError(value);
  try {
    if (rule === TAKEN_USERNAME) {
      return { status: "taken", value, message: TAKEN_USERNAME, suggestion: await firstFree(value, isTaken) };
    }
    if (rule) return { status: "invalid", message: rule };
    if (!(await isTaken(value))) return { status: "available", value };
    return { status: "taken", value, message: TAKEN_USERNAME, suggestion: await firstFree(value, isTaken) };
  } catch {
    if (rule === TAKEN_USERNAME) return { status: "taken", value, message: TAKEN_USERNAME, suggestion: null };
    return { status: "unknown", value };
  }
}
