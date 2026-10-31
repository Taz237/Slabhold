import { isOfficialUpdatesAccount } from "./official-updates";

/**
 * Handle rules shared by sign-up, profile edits, and the server reads. Kept
 * apart from local-db (the on-device accounts) so hosted screens don't load it.
 */

const USERNAME = /^[a-z0-9_]{3,20}$/;

/**
 * Handles a new account cannot claim. Keep this list identical to the
 * reserved array in supabase/migrations/20261022223000_reserve_profile_usernames.sql.
 */
export const RESERVED_USERNAMES = [
  "grokbotreview",
  "slabholdupdates",
  "slabhold",
  "slabholdapp",
  "slabhold_updates",
  "slabholdteam",
  "slabholdsupport",
  "slabholdofficial",
  "admin",
  "administrator",
  "support",
  "help",
  "moderator",
  "mod",
  "official",
  "staff",
  "team",
] as const;

/** Stems that also reserve lookalikes such as slabholdupdates1 and grokbotreview_. */
export const UPDATES_HANDLE_STEMS = ["grokbotreview", "slabholdupdates"] as const;

export function normalizeUsername(value: string) {
  return value.trim().toLowerCase();
}

/** Lowercase handle with `_`, `.`, `-`, and trailing digits removed. */
export function reservedHandleStem(value: string) {
  return normalizeUsername(value).replace(/[_.-]/g, "").replace(/\d+$/, "");
}

export function isUpdatesHandleVariant(value: string) {
  return (UPDATES_HANDLE_STEMS as readonly string[]).includes(reservedHandleStem(value));
}

export function isReservedUsername(value: string) {
  const handle = normalizeUsername(value);
  if ((RESERVED_USERNAMES as readonly string[]).includes(handle)) return true;
  return isUpdatesHandleVariant(value);
}

export function usernameError(value: string) {
  if (!USERNAME.test(value)) {
    return "Usernames are 3–20 characters: letters, numbers, underscores.";
  }
  if (isReservedUsername(value)) return "That username is taken.";
  return null;
}

/** Existing holders may keep a reserved name. Only the updates id may newly take a variant. */
export function usernameChangeError(next: string, userId?: string | null, current?: string | null) {
  const error = usernameError(next);
  if (!error || !isReservedUsername(next)) return error;
  if (normalizeUsername(current ?? "") === normalizeUsername(next)) return null;
  if (isOfficialUpdatesAccount(userId) && isUpdatesHandleVariant(next)) return null;
  return error;
}
