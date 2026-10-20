import { escapeIlike } from "@/lib/db/escape-ilike";

export const TAKEN_USERNAME = "That username is taken.";

/** Exact ilike match. `_` and `%` are wildcards unless escaped. */
export function ilikeExact(value: string) {
  return escapeIlike(value);
}

export function usernameTakenMessage(
  error: { code?: string | null; message?: string | null } | null | undefined,
): string | null {
  if (!error) return null;
  const message = error.message ?? "";
  if (error.code === "23505" || /database error saving new user/i.test(message)) {
    return TAKEN_USERNAME;
  }
  return null;
}
