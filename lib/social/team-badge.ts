/**
 * Who wears the Slabhold team badge in the app. One list, by username: no
 * database column. Edit here to add or remove someone.
 */
export const TEAM_BADGE_USERNAMES: readonly string[] = ["donnietaz", "slabhold", "ripsandlots", "kevstuff"];

export const TEAM_BADGE_LABEL = "Slabhold team";

const TEAM = new Set(TEAM_BADGE_USERNAMES.map(normalize));

function normalize(username: string): string {
  return username.trim().replace(/^@/, "").toLowerCase();
}

/**
 * True for a listed username, matched without case or a leading @. An account
 * that already wears the official mark gets no second badge.
 */
export function hasTeamBadge(
  username: string | null | undefined,
  { official = false }: { official?: boolean } = {},
): boolean {
  if (official || !username) return false;
  return TEAM.has(normalize(username));
}
