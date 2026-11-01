import { userHref } from "@/lib/social/user-href";

/** Handles that make one clean `/u/<handle>` segment. No leading dot, so never `.` or `..`. */
const CLEAN_HANDLE = /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/;

/**
 * Profile path for a leaderboard row, or null when the row has no clean handle
 * and no `/u/` href. A null row renders without a link.
 */
export function profileLinkFor(entry: { subtitle: string; href: string }): string | null {
  const handle = entry.subtitle.trim().replace(/^@/, "");
  if (CLEAN_HANDLE.test(handle)) return userHref(handle);
  if (entry.href.startsWith("/u/")) return entry.href;
  return null;
}

/** The row's profile opened on the Cards tab, or null when the row stays unlinked. */
export function profileCardsLinkFor(entry: { subtitle: string; href: string }): string | null {
  const path = profileLinkFor(entry);
  return path ? `${path}?tab=cards` : null;
}
